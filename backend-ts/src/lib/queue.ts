import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { generateSuggestionWorker } from "../services/copilot.service.js";

const connection = new Redis(config.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times: number) {
    if (times > 3) {
      console.warn("[BullMQ] Redis unavailable — copilot queue disabled");
      return null; // Stop retrying
    }
    return Math.min(times * 500, 2000);
  },
});

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
