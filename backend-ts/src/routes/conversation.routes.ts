import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import OpenAI from "openai";
import { sendEmail } from "../services/email.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  conversationAssignSchema,
  conversationStatusUpdateSchema,
  type ConversationOut,
} from "../schemas/conversation.schema.js";
import {
  updateConversationStatus,
} from "../services/conversation.service.js";
import { config } from "../config.js";
import { decrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

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
        ? { phone: c.customer.phone, name: c.customer.name, email: c.customer.email, profile_picture_url: c.customer.profilePictureUrl }
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

  // Delete a conversation and all its messages
  app.delete<{ Params: { conversationId: string } }>(
    "/:conversationId",
    async (request, reply) => {
      const { prisma, socket } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: user.tenantId },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // Delete in order: translations -> suggestions -> attachments -> messages -> reads -> conversation
      await prisma.messageTranslation.deleteMany({
        where: { message: { conversationId } },
      });
      await prisma.aISuggestion.deleteMany({
        where: { message: { conversationId } },
      });
      await prisma.messageAttachment.deleteMany({
        where: { message: { conversationId } },
      });
      await prisma.message.deleteMany({
        where: { conversationId },
      });
      await prisma.conversationRead.deleteMany({
        where: { conversationId },
      });
      await prisma.conversation.delete({
        where: { id: conversationId },
      });

      socket.emitToTenant(user.tenantId, "conversation.updated", {
        type: "deleted",
        conversationId,
      });

      return reply.status(204).send();
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

  // Send email from conversation context
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/send-email",
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;
      const body = request.body as { to?: string; subject: string; body: string };

      if (!body.subject?.trim() || !body.body?.trim()) {
        return reply.status(422).send({ detail: "subject and body are required" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: user.tenantId },
        include: { customer: true },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const to = body.to?.trim() || conversation.customer?.email;
      if (!to) {
        return reply.status(422).send({ detail: "No email address. Provide 'to' or add email to the customer profile." });
      }

      const html = body.body.replace(/\n/g, "<br/>");

      try {
        const result = await sendEmail({ to, subject: body.subject.trim(), html });
        return reply.send({ success: true, email_id: result.id, to });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(502).send({ detail: msg });
      }
    },
  );

  // Suggest email subject + body using AI based on conversation history
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/suggest-email",
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: user.tenantId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 30,
            select: { senderType: true, originalText: true },
          },
          customer: { select: { name: true } },
        },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // Detect email address mentioned in any message
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      let detectedEmail: string | null = null;
      for (const msg of [...conversation.messages].reverse()) {
        const match = msg.originalText?.match(emailRegex);
        if (match) { detectedEmail = match[0]; break; }
      }

      // Resolve tenant OpenAI key with fallback to global
      const tenantSettings = await prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } });
      let apiKey = config.OPENAI_API_KEY;
      if (tenantSettings?.openaiApiKey) {
        try { apiKey = decrypt(tenantSettings.openaiApiKey); } catch { /* fallback */ }
      }

      if (!apiKey) {
        return reply.status(503).send({ detail: "OpenAI API key not configured" });
      }

      // Build readable conversation history
      const history = conversation.messages
        .filter((m) => m.originalText?.trim())
        .map((m) => `${m.senderType === "customer" ? "Cliente" : "Atendente"}: ${m.originalText}`)
        .join("\n");

      const customerName = conversation.customer?.name || "cliente";

      try {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: tenantSettings?.openaiModel || config.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Você é um assistente de atendimento ao cliente. Analise a conversa de WhatsApp fornecida e redija um email profissional de follow-up em português. Responda APENAS com JSON válido no formato: {\"subject\": \"...\", \"body\": \"...\"}. O campo \"body\" deve ser texto simples (sem HTML). O email deve ser cordial, profissional e dar continuidade ao que foi tratado na conversa.",
            },
            {
              role: "user",
              content: `Conversa com ${customerName}:\n\n${history}`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 600,
          temperature: 0.7,
        });

        let subject = "";
        let body = "";
        try {
          const parsed = JSON.parse(completion.choices[0].message.content || "{}");
          subject = parsed.subject || "";
          body = parsed.body || "";
        } catch { /* leave empty */ }

        return reply.send({ subject, body, detectedEmail });
      } catch (err: unknown) {
        logger.error({ err }, "[SuggestEmail] OpenAI error");
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(502).send({ detail: msg });
      }
    },
  );
}
