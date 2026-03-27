import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyMultipart from "@fastify/multipart";
import jwt from "jsonwebtoken";
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
import { taskRoutes } from "./routes/task.routes.js";
import { publicCheckinRoutes } from "./routes/public-checkin.routes.js";
import { propertyConfigRoutes } from "./routes/property-config.routes.js";
import { pushRoutes } from "./routes/push.routes.js";
import { serviceOrderRoutes } from "./routes/serviceorder.routes.js";
import { billingRoutes } from "./routes/billing.routes.js";
import { auditRoutes } from "./routes/audit.routes.js";
import { campaignRoutes } from "./routes/campaign.routes.js";
import { attachAppDeps, type AppDeps } from "./app-deps.js";
import { runDailyTaskSync } from "./workers/task.worker.js";
import { scheduleTaskSync } from "./lib/queue.js";

export async function buildApp(deps?: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.DEBUG });

  attachAppDeps(app, deps);

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // Webhooks externos e formulário público de checkin ficam isentos do rate limit
    allowList: (request) =>
      request.url.startsWith("/api/v1/webhook") ||
      request.url.startsWith("/api/v1/billing/webhook") ||
      request.url.startsWith("/public/checkin"),
    // Por tenant autenticado; fallback para IP
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        try {
          const decoded = jwt.decode(auth.slice(7)) as { tenant_id?: string } | null;
          if (decoded?.tenant_id) return `tenant:${decoded.tenant_id}`;
        } catch {
          // fallback to IP
        }
      }
      return request.ip;
    },
  });

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.setErrorHandler(errorHandler);

  app.get("/health", async () => {
    const health: {
      status: string;
      db: string;
      redis: string;
      openai: string;
      whatsapp: string;
      timestamp: string;
    } = {
      status: "ok",
      db: "ok",
      redis: "ok",
      openai: config.OPENAI_API_KEY ? "configured" : "not_configured",
      whatsapp: config.WHATSAPP_API_TOKEN ? "configured" : "not_configured",
      timestamp: new Date().toISOString(),
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
      // Redis is optional — degraded but not fatal
      health.status = health.status === "ok" ? "degraded" : health.status;
      health.redis = "unavailable";
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
  await app.register(taskRoutes, { prefix: "/api/v1/tasks" });
  await app.register(propertyConfigRoutes, { prefix: "/api/v1/property-configs" });
  // Public (unauthenticated) guest check-in form routes — no authMiddleware
  await app.register(publicCheckinRoutes, { prefix: "/public/checkin" });
  await app.register(pushRoutes, { prefix: "/api/v1/push" });
  await app.register(serviceOrderRoutes, { prefix: "/api/v1/service-orders" });
  await app.register(billingRoutes, { prefix: "/api/v1/billing" });
  await app.register(auditRoutes, { prefix: "/api/v1/audit-logs" });
  await app.register(campaignRoutes, { prefix: "/api/v1/campaigns" });

  // Job Agendador de Missões (CRM Sync) = a cada 1 hora via BullMQ
  await scheduleTaskSync();

  // Executa sync inicial no boot (com delay para o DB estar pronto)
  setTimeout(() => {
    runDailyTaskSync().catch(err => app.log.error({ err }, "[CRON] Initial worker failed"));
  }, 5000);

  return app;
}
