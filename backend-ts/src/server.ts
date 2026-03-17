import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyMultipart from "@fastify/multipart";
import { config, allowedOrigins } from "./config.js";
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
import { tenantRoutes } from "./routes/tenant.routes.js";
import { knowledgeBaseRoutes } from "./routes/knowledge-base.routes.js";
import { staysnetRoutes } from "./routes/staysnet.routes.js";
import { analyticsRoutes } from "./routes/analytics.routes.js";
import { customerRoutes } from "./routes/customer.routes.js";
import { audioRoutes } from "./routes/audio.routes.js";
import { copilotWorker } from "./lib/queue.js";
import { SocketService } from "./services/socket.service.js";

const app = Fastify({ logger: config.DEBUG });

// Security headers
await app.register(helmet, { contentSecurityPolicy: false });

// Rate limiting
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// CORS
await app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
});

// Error handler
app.setErrorHandler(errorHandler);

// Health check with dependency verification
app.get("/health", async () => {
  const health: { status: string; db: string; redis: string } = {
    status: "ok",
    db: "ok",
    redis: "ok",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    health.status = "degraded";
    health.db = "error";
  }

  try {
    await redis.ping();
  } catch {
    health.status = "degraded";
    health.redis = "error";
  }

  return health;
});

// Multipart uploads
await app.register(fastifyMultipart, {
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size for OpenAI audio
  },
});

// Routes
await app.register(authRoutes, { prefix: "/api/v1/auth" });
await app.register(webhookRoutes, { prefix: "/api/v1/webhook" });
await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
await app.register(messageRoutes, { prefix: "/api/v1/conversations" });
await app.register(copilotRoutes, { prefix: "/api/v1/conversations" });
await app.register(audioRoutes, { prefix: "/api/v1/audio" });
await app.register(agentRoutes, { prefix: "/api/v1/agents" });
await app.register(jobRoutes, { prefix: "/api/v1/jobs" });
await app.register(tenantRoutes, { prefix: "/api/v1/tenants" });
await app.register(knowledgeBaseRoutes, { prefix: "/api/v1/tenants" });
await app.register(staysnetRoutes, { prefix: "/api/v1/staysnet" });
await app.register(analyticsRoutes, { prefix: "/api/v1/analytics" });
await app.register(customerRoutes, { prefix: "/api/v1/customers" });

// Start
async function start(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("Database connected");

    // Redis is optional for local dev — don't block the server if unavailable
    try {
      await redis.connect();
      console.log("Redis connected");
      console.log(`BullMQ Copilot Worker started: ${copilotWorker.name}`);
    } catch (redisErr) {
      console.warn("⚠️  Redis not available — server will start without queue/copilot features");
      console.warn("   To enable: install Docker and run 'docker run -d -p 6379:6379 redis:alpine'");
    }

    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`Server running on http://localhost:${config.PORT}`);
    
    // Initialize WebSockets using the Fastify raw HTTP server
    SocketService.initialize(app.server);
    console.log("WebSocket Server Initialized");
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
