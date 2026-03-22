import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { generateSuggestionWorker } from "../services/copilot.service.js";
import { runDailyTaskSync } from "../workers/task.worker.js";

let redisAvailable = false;

const connection = new Redis(config.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times: number) {
    if (times > 3) {
      console.warn("[BullMQ] Redis unavailable — copilot queue disabled, using sync fallback");
      redisAvailable = false;
      return null; // Stop retrying
    }
    return Math.min(times * 500, 2000);
  },
});

// Track connection state
connection.on("connect", () => {
  redisAvailable = true;
  console.log("[BullMQ] Redis connected successfully");
});

connection.on("error", () => {
  redisAvailable = false;
});

connection.on("close", () => {
  redisAvailable = false;
});

// Try initial connection
connection.connect().catch(() => {
  console.warn("[BullMQ] Initial Redis connection failed — using sync fallback");
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
  console.log(`[CopilotWorker] Job ${job.id} completed successfully`);
});

copilotWorker.on("failed", (job, err) => {
  console.error(`[CopilotWorker] Job ${job?.id} failed:`, err);
});

// ─── Task Sync Queue (CRM reservations) ─────────────────
export const TASK_QUEUE_NAME = "task-sync";

export const taskQueue = new Queue(TASK_QUEUE_NAME, {
  connection: connection as any,
  defaultJobOptions: { removeOnComplete: 5, removeOnFail: 10 },
});

export const taskWorker = new Worker(
  TASK_QUEUE_NAME,
  async () => {
    await runDailyTaskSync();
  },
  { connection: connection as any },
);

taskWorker.on("completed", () => {
  console.log("[TaskWorker] BullMQ job completed");
});

taskWorker.on("failed", (_job, err) => {
  console.error("[TaskWorker] BullMQ job failed:", err);
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
    console.log("[TaskQueue] CRM sync scheduled every 1h via BullMQ");
  } catch (err) {
    console.warn("[TaskQueue] Failed to schedule CRM sync via BullMQ:", err);
  }
}
