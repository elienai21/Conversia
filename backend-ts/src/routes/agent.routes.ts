import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  agentStatusUpdateSchema,
  type AgentOut,
} from "../schemas/agent.schema.js";
import { getActiveConversationCount } from "../services/assignment.service.js";

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // Get current agent profile
  app.get("/me", async (request, reply) => {
    const user = request.user;
    const activeCount = await getActiveConversationCount(user.id);

    const result: AgentOut = {
      id: user.id,
      tenant_id: user.tenantId,
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      preferred_language: user.preferredLanguage,
      is_online: user.isOnline,
      max_concurrent_conversations: user.maxConcurrentConversations,
      active_conversations_count: activeCount,
      created_at: user.createdAt,
      email_verified_at: user.emailVerifiedAt,
    };

    return reply.send(result);
  });

  // Toggle online/offline status
  app.patch("/me/status", async (request, reply) => {
    const user = request.user;

    const parsed = agentStatusUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid status update" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: parsed.data.is_online },
    });

    const activeCount = await getActiveConversationCount(user.id);

    const result: AgentOut = {
      id: updated.id,
      tenant_id: updated.tenantId,
      email: updated.email,
      full_name: updated.fullName,
      role: updated.role,
      preferred_language: updated.preferredLanguage,
      is_online: updated.isOnline,
      max_concurrent_conversations: updated.maxConcurrentConversations,
      active_conversations_count: activeCount,
      created_at: updated.createdAt,
      email_verified_at: updated.emailVerifiedAt,
    };

    return reply.send(result);
  });

  // GET / — list all agents in the tenant (admin only)
  app.get("/", async (request, reply) => {
    const { requireAdmin } = await import("../middleware/auth.middleware.js");
    // Only admins can list all agents
    if (request.user.role !== "admin") {
      return reply.status(403).send({ detail: "Admin access required" });
    }

    const agents = await prisma.user.findMany({
      where: { tenantId: request.user.tenantId, isActive: true },
      select: { id: true, fullName: true, email: true, role: true, isOnline: true },
      orderBy: { fullName: "asc" },
    });

    return reply.send(
      agents.map((a) => ({
        id: a.id,
        full_name: a.fullName,
        email: a.email,
        role: a.role,
        is_online: a.isOnline,
      })),
    );
  });
}
