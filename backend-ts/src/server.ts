import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRoutes } from "./routes/auth.routes.js";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { conversationRoutes } from "./routes/conversation.routes.js";
import { messageRoutes } from "./routes/message.routes.js";
import { copilotRoutes } from "./routes/copilot.routes.js";
import { agentRoutes } from "./routes/agent.routes.js";
import { jobRoutes } from "./routes/job.routes.js";
import { copilotWorker } from "./lib/queue.js";
import { SocketService } from "./services/socket.service.js";

const app = Fastify({ logger: config.DEBUG });

// Plugins
await app.register(cors, {
  origin: true,
  credentials: true,
});

// Error handler
app.setErrorHandler(errorHandler);

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Routes
await app.register(authRoutes, { prefix: "/api/v1/auth" });
await app.register(webhookRoutes, { prefix: "/api/v1/webhook" });
await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
await app.register(messageRoutes, { prefix: "/api/v1/conversations" });
await app.register(copilotRoutes, { prefix: "/api/v1/conversations" });
await app.register(agentRoutes, { prefix: "/api/v1/agents" });
await app.register(jobRoutes, { prefix: "/api/v1/jobs" });

// Start
async function start(): Promise<void> {
  try {
    await redis.connect();
    console.log("Redis connected");

    await prisma.$connect();
    console.log("Database connected");

    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`Server running on http://localhost:${config.PORT}`);
    
    // Initialize WebSockets using the Fastify raw HTTP server
    SocketService.initialize(app.server);
    console.log("WebSocket Server Initialized");

    console.log(`BullMQ Copilot Worker started: ${copilotWorker.name}`);
  } catch (err) {
    console.error("Failed to start:", err);
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
