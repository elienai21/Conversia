import { config } from "./config.js";
import { redis } from "./lib/redis.js";
import { copilotWorker, taskWorker } from "./lib/queue.js";
import { startCronJobs } from "./lib/cron.js";
import { SocketService } from "./services/socket.service.js";
import { buildApp } from "./app.js";

const app = await buildApp();

// Start
async function start(): Promise<void> {
  try {
    // Prisma connects lazily on first query — no explicit $connect() needed.
    // Calling $connect() here blocks startup when the DB has too many connections
    // (e.g. during rolling deploys), preventing app.listen() from ever being
    // called and causing Railway healthcheck failures.

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
  const { prisma } = await import("./lib/prisma.js");
  await prisma.$disconnect();
  redis.disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
