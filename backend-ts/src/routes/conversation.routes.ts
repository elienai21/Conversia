import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  conversationAssignSchema,
  conversationStatusUpdateSchema,
  type ConversationOut,
} from "../schemas/conversation.schema.js";
import {
  updateConversationStatus,
} from "../services/conversation.service.js";
import {
  assignConversationToAgent,
} from "../services/assignment.service.js";

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // List conversations (filtered by role)
  app.get("/", async (request, reply) => {
    const user = request.user;

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
    };

    // Agents only see their assigned conversations
    if (user.role === "agent") {
      where.assignedAgentId = user.id;
    }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { customer: true },
    });

    const result: ConversationOut[] = conversations.map((c) => ({
      id: c.id,
      tenant_id: c.tenantId,
      customer_id: c.customerId,
      assigned_agent_id: c.assignedAgentId,
      channel: c.channel,
      status: c.status,
      detected_language: c.detectedLanguage,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      customer: c.customer ? { phone: c.customer.phone, name: c.customer.name } : null,
    }));

    return reply.send(result);
  });

  // Get single conversation
  app.get<{ Params: { conversationId: string } }>(
    "/:conversationId",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;

      const where: Record<string, unknown> = {
        id: conversationId,
        tenantId: user.tenantId,
      };

      if (user.role === "agent") {
        where.assignedAgentId = user.id;
      }

      const conversation = await prisma.conversation.findFirst({
        where,
        include: { customer: true },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const result: ConversationOut = {
        id: conversation.id,
        tenant_id: conversation.tenantId,
        customer_id: conversation.customerId,
        assigned_agent_id: conversation.assignedAgentId,
        channel: conversation.channel,
        status: conversation.status,
        detected_language: conversation.detectedLanguage,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
        customer: conversation.customer ? { phone: conversation.customer.phone, name: conversation.customer.name } : null,
      };

      return reply.send(result);
    },
  );

  // Assign agent to conversation (admin only)
  app.patch<{ Params: { conversationId: string } }>(
    "/:conversationId/assign",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;

      if (user.role !== "admin") {
        return reply.status(403).send({ detail: "Admin access required" });
      }

      const parsed = conversationAssignSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "Invalid agent_id" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: user.tenantId },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      await assignConversationToAgent(conversationId, parsed.data.agent_id);

      const updated = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      return reply.send(updated);
    },
  );

  // Update conversation status
  app.patch<{ Params: { conversationId: string } }>(
    "/:conversationId/status",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;

      const parsed = conversationStatusUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "Invalid status" });
      }

      const result = await updateConversationStatus(
        conversationId,
        user.tenantId,
        parsed.data.status,
      );

      if (!result.ok) {
        return reply.status(result.error.statusCode).send({
          detail: result.error.message,
        });
      }

      return reply.send(result.value);
    },
  );
}
