import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { generateSuggestionWorker } from "../services/copilot.service.js";
import { runDailyTaskSync } from "../workers/task.worker.js";
import { logger } from "./logger.js";

let redisAvailable = false;

export const connection = new Redis(config.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times: number) {
    if (times > 3) {
      logger.warn("[BullMQ] Redis unavailable — copilot queue disabled, using sync fallback");
      redisAvailable = false;
      return null; // Stop retrying
    }
    return Math.min(times * 500, 2000);
  },
});

// Track connection state
connection.on("connect", () => {
  redisAvailable = true;
  logger.info("[BullMQ] Redis connected successfully");
});

connection.on("error", () => {
  redisAvailable = false;
});

connection.on("close", () => {
  redisAvailable = false;
});

// Try initial connection
connection.connect().catch(() => {
  logger.warn("[BullMQ] Initial Redis connection failed — using sync fallback");
  redisAvailable = false;
});

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export const COPILOT_QUEUE_NAME = "copilot-suggestions";

export const copilotQueue = new Queue(COPILOT_QUEUE_NAME, {
  connection: connection as any,
});

export interface CopilotJobData {
  tenantId: string;
  message: { id: string; conversationId: string; originalText: string };
  agentId: string;
  agentLanguage: string;
}

// Instantiate the worker
export const copilotWorker = new Worker<CopilotJobData>(
  COPILOT_QUEUE_NAME,
  async (job: Job<CopilotJobData>) => {
    return generateSuggestionWorker(job.data);
  },
  { connection: connection as any },
);

copilotWorker.on("completed", (job) => {
  logger.info(`[CopilotWorker] Job ${job.id} completed successfully`);
});

copilotWorker.on("failed", (job, err) => {
  logger.error({ err }, `[CopilotWorker] Job ${job?.id} failed`);
});

// ─── Task Sync Queue (CRM reservations) ─────────────────
export const TASK_QUEUE_NAME = "task-sync";

export const taskQueue = new Queue(TASK_QUEUE_NAME, {
  connection: connection as any,
  defaultJobOptions: { removeOnComplete: 5, removeOnFail: 10 },
});

const TASK_SYNC_LOCK_KEY = "lock:task-sync";
const TASK_SYNC_LOCK_TTL_SEC = 3600; // 1h — same as sync interval

/**
 * Runs runDailyTaskSync() under a distributed Redis lock.
 *
 * Without this lock, a Railway deploy (or crash+restart) during the hourly
 * cron window could enqueue a second job while the first is still running,
 * causing duplicate tasks to be created for the same reservations.
 *
 * SET NX EX: atomic — only one process can hold the lock at a time.
 * The lock is always released in `finally` so a failed sync doesn't block
 * the next run for a full hour.
 */
async function runDailyTaskSyncWithLock(): Promise<void> {
  if (!redisAvailable) {
    // Redis unavailable — run without lock (accepts the race condition risk)
    logger.warn("[TaskWorker] Redis unavailable — running sync without distributed lock");
    await runDailyTaskSync();
    return;
  }

  const acquired = await connection.set(TASK_SYNC_LOCK_KEY, "1", "EX", TASK_SYNC_LOCK_TTL_SEC, "NX");
  if (!acquired) {
    logger.info("[TaskWorker] Sync already running (lock held by another process) — skipping");
    return;
  }

  try {
    await runDailyTaskSync();
  } finally {
    await connection.del(TASK_SYNC_LOCK_KEY);
    logger.info("[TaskWorker] Distributed lock released");
  }
}

export const taskWorker = new Worker(
  TASK_QUEUE_NAME,
  async () => {
    await runDailyTaskSyncWithLock();
  },
  { connection: connection as any },
);

taskWorker.on("completed", () => {
  logger.info("[TaskWorker] BullMQ job completed");
});

taskWorker.on("failed", (_job, err) => {
  logger.error({ err }, "[TaskWorker] BullMQ job failed");
});

/** Registra o repeat job de 1h se ainda não existir */
export async function scheduleTaskSync(): Promise<void> {
  try {
    // BullMQ v3+: upsertJobScheduler garante idempotência
    await (taskQueue as any).upsertJobScheduler?.(
      "crm-hourly-sync",
      { every: 60 * 60 * 1000 },
      { name: "crm-hourly-sync", data: {} },
    );

    // Fallback para versões mais antigas: add com repeat
    if (!(taskQueue as any).upsertJobScheduler) {
      const existing = await taskQueue.getRepeatableJobs();
      if (!existing.some((j) => j.key.includes("crm-hourly-sync"))) {
        await taskQueue.add(
          "crm-hourly-sync",
          {},
          { repeat: { every: 60 * 60 * 1000 } },
        );
      }
    }
    logger.info("[TaskQueue] CRM sync scheduled every 1h via BullMQ");
  } catch (err) {
    logger.warn({ err }, "[TaskQueue] Failed to schedule CRM sync via BullMQ");
  }
}
