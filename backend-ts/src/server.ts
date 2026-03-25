import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { copilotWorker, taskWorker } from "./lib/queue.js";
import { startCronJobs } from "./lib/cron.js";
import { SocketService } from "./services/socket.service.js";
import { buildApp } from "./app.js";

const app = await buildApp();

// Start
async function start(): Promise<void> {
  try {
    await prisma.$connect();
    app.log.info("Database connected");

    // Dedup cleanup: remove duplicate messages sharing the same external_id.
    // Must delete dependents first (ai_suggestions, translations, attachments)
    // because those FK constraints use RESTRICT (default in Prisma).
    // This unblocks prisma db push from adding the @unique constraint.
    try {
      // 1. Find IDs of duplicate messages to delete (keep oldest per external_id)
      const dupes = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY created_at ASC) AS rn
          FROM messages
          WHERE external_id IS NOT NULL
        ) t
        WHERE t.rn > 1
      `;

      if (dupes.length > 0) {
        const ids = dupes.map((r) => r.id);
        app.log.info(`[Startup] Found ${ids.length} duplicate message(s) — cleaning up dependents first`);

        // 2. Delete dependents in the correct cascade order
        await prisma.aISuggestion.deleteMany({ where: { messageId: { in: ids } } });
        await prisma.messageTranslation.deleteMany({ where: { messageId: { in: ids } } });
        await prisma.messageAttachment.deleteMany({ where: { messageId: { in: ids } } });
        await prisma.message.deleteMany({ where: { id: { in: ids } } });

        app.log.info(`[Startup] Successfully removed ${ids.length} duplicate message(s)`);
      }
    } catch (dedupErr) {
      app.log.warn({ dedupErr }, "[Startup] Could not run external_id dedup cleanup (non-fatal)");
    }

    // Redis is optional for local dev — don't block the server if unavailable
    try {
      await redis.connect();
      app.log.info("Redis connected");
      app.log.info(`BullMQ Copilot Worker started: ${copilotWorker.name}`);
    } catch (redisErr) {
      app.log.warn("Redis not available — server will start without queue/copilot features");
      app.log.warn("To enable: install Docker and run 'docker run -d -p 6379:6379 redis:alpine'");
    }

    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    app.log.info(`Server running on http://localhost:${config.PORT}`);

    // Initialize WebSockets using the Fastify raw HTTP server
    SocketService.initialize(app.server);
    app.log.info("WebSocket Server Initialized");

    // Start scheduled cron jobs (e.g. daily task sync at 03:00)
    startCronJobs();
    app.log.info("Cron jobs initialized");
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  await copilotWorker.close();
  await taskWorker.close();
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
