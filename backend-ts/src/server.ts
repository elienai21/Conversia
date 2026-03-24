import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { copilotWorker } from "./lib/queue.js";
import { SocketService } from "./services/socket.service.js";
import { buildApp } from "./app.js";

const app = await buildApp();

// Start
async function start(): Promise<void> {
  try {
    await prisma.$connect();
    app.log.info("Database connected");

    // Dedup cleanup: remove duplicate messages sharing the same external_id.
    // This allows prisma db push to successfully add/maintain the @unique
    // constraint on external_id even if the Evolution API sent duplicate webhooks.
    try {
      const deleted = await prisma.$executeRaw`
        DELETE FROM messages
        WHERE ctid IN (
          SELECT ctid FROM (
            SELECT ctid,
                   ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY created_at ASC) AS rn
            FROM messages
            WHERE external_id IS NOT NULL
          ) t
          WHERE t.rn > 1
        )
      `;
      if (deleted > 0) {
        app.log.info(`[Startup] Removed ${deleted} duplicate message(s) with repeated external_id`);
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
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  await copilotWorker.close();
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
