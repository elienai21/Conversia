import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  conversationAssignSchema,
  conversationStatusUpdateSchema,
  type ConversationOut,
} from "../schemas/conversation.schema.js";
import {
  updateConversationStatus,
} from "../services/conversation.service.js";

const startConversationSchema = z.object({
  customer_id: z.string().uuid(),
  channel: z.enum(["whatsapp", "instagram"]).default("whatsapp"),
  message: z.string().min(1),
});

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // List conversations (filtered by role)
  app.get("/", async (request, reply) => {
    const { prisma } = request.server.deps;
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
      include: {
        customer: true,
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { originalText: true },
        },
      },
    });

    // Get unread counts per conversation for this user
    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts = conversationIds.length > 0
      ? await prisma.$queryRaw<{ conversation_id: string; count: bigint }[]>(
          Prisma.sql`SELECT m.conversation_id, COUNT(*)::bigint as count
           FROM messages m
           LEFT JOIN conversation_reads cr
             ON cr.conversation_id = m.conversation_id AND cr.user_id = ${user.id}::uuid
           WHERE m.conversation_id IN (${Prisma.join(conversationIds.map(id => Prisma.sql`${id}::uuid`))})
             AND m.deleted_at IS NULL
             AND m.sender_type = 'customer'
             AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
           GROUP BY m.conversation_id`,
        )
      : [];

    const unreadMap = new Map(unreadCounts.map((r) => [r.conversation_id, Number(r.count)]));

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
      customer: c.customer
        ? { phone: c.customer.phone, name: c.customer.name, profile_picture_url: c.customer.profilePictureUrl }
        : null,
      unread_count: unreadMap.get(c.id) || 0,
      last_message_preview: c.messages[0]?.originalText?.substring(0, 80) || null,
    }));

    return reply.send(result);
  });

  // Get single conversation
  app.get<{ Params: { conversationId: string } }>(
    "/:conversationId",
    async (request, reply) => {
      const { prisma } = request.server.deps;
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
      const { prisma, services, socket } = request.server.deps;
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

      await services.assignConversationToAgent(conversationId, parsed.data.agent_id);

      socket.emitToTenant(user.tenantId, "conversation.updated", {
        type: "assigned",
        conversationId: conversationId,
        agentId: parsed.data.agent_id,
      });

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
      const { services, socket } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;

      const parsed = conversationStatusUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "Invalid status" });
      }

      const result = await services.updateConversationStatus(
        conversationId,
        user.tenantId,
        parsed.data.status,
      );

      if (!result.ok) {
        return reply.status(result.error.statusCode).send({
          detail: result.error.message,
        });
      }

      socket.emitToTenant(user.tenantId, "conversation.updated", {
        type: "status_changed",
        conversationId: conversationId,
        status: parsed.data.status,
      });

      return reply.send(result.value);
    },
  );

  // Start a new outbound conversation
  app.post("/", async (request, reply) => {
    const { prisma, services, socket } = request.server.deps;
    const user = request.user;

    const parsed = startConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    // Verify customer belongs to this tenant
    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customer_id, tenantId: user.tenantId },
    });
    if (!customer) {
      return reply.status(404).send({ detail: "Customer not found" });
    }

    // Find or create conversation
    const { conversation, isNew } = await services.findOrCreateConversation(
      user.tenantId,
      customer.id,
      parsed.data.channel,
    );

    // Assign to current agent and set active
    if (!conversation.assignedAgentId) {
      await services.assignConversationToAgent(conversation.id, user.id);
    }
    if (conversation.status === "queued") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "active" },
      });
    }

    // Save the first message
    const message = await services.saveMessage({
      conversationId: conversation.id,
      senderType: "agent",
      senderId: user.id,
      text: parsed.data.message,
      detectedLanguage: user.preferredLanguage,
    });

    // Send via WhatsApp
    if (parsed.data.channel === "whatsapp") {
      await services.sendWhatsappMessage(user.tenantId, customer.phone, parsed.data.message);
    }

    // Emit socket events
    socket.emitToTenant(user.tenantId, "conversation.updated", {
      type: isNew ? "new" : "replied",
      conversationId: conversation.id,
    });

    socket.emitToConversation(conversation.id, "message.new", {
      id: message.id,
      conversation_id: message.conversationId,
      sender_type: message.senderType,
      original_text: message.originalText,
      detected_language: message.detectedLanguage,
      created_at: message.createdAt,
      translations: [],
    });

    // Return conversation with customer data
    const result: ConversationOut = {
      id: conversation.id,
      tenant_id: conversation.tenantId,
      customer_id: conversation.customerId,
      assigned_agent_id: user.id,
      channel: conversation.channel,
      status: "active",
      detected_language: conversation.detectedLanguage,
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt,
      customer: { phone: customer.phone, name: customer.name },
    };

    return reply.status(201).send(result);
  });
}
