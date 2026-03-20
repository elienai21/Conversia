import Fastify, { type FastifyInstance } from "fastify";
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
import { evolutionRoutes } from "./routes/evolution.routes.js";
import { quickReplyRoutes } from "./routes/quick-reply.routes.js";
import { attachAppDeps, type AppDeps } from "./app-deps.js";

export async function buildApp(deps?: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.DEBUG });

  attachAppDeps(app, deps);

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.setErrorHandler(errorHandler);

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

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
    },
  });

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
  await app.register(evolutionRoutes, { prefix: "/api/v1/whatsapp" });
  await app.register(quickReplyRoutes, { prefix: "/api/v1/quick-replies" });

  return app;
}
