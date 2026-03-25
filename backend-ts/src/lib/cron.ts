import cron from "node-cron";
import { runDailyTaskSync } from "../workers/task.worker.js";
import { isRedisAvailable, taskQueue } from "./queue.js";
import { logger } from "./logger.js";

/**
 * Registers all recurring cron jobs for the application.
 * Should be called once after the server starts.
 */
export function startCronJobs(): void {
  // ─── Daily Task Sync: every day at 03:00 (server timezone) ──────────
  cron.schedule("0 3 * * *", async () => {
    logger.info("[Cron] Disparando sincronização diária de tarefas (03:00)...");
    try {
      if (isRedisAvailable()) {
        await taskQueue.add("cron-daily-sync", {});
        logger.info("[Cron] Job de sync enfileirado via BullMQ");
      } else {
        const summary = await runDailyTaskSync();
        logger.info({ summary }, "[Cron] Sync executado diretamente (sem Redis)");
      }
    } catch (err) {
      logger.error({ err }, "[Cron] Falha ao executar sincronização diária");
    }
  });

  logger.info("[Cron] Jobs agendados: task sync diário às 03:00");
}
