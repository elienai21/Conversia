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
  app.get<{ Querystring: { scope?: string } }>("/", async (request, reply) => {
    const { prisma } = request.server.deps;
    const user = request.user;
    const { scope } = request.query;

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      deletedAt: null, // exclude soft-deleted conversations
    };

    // Agents only see their assigned conversations
    if (user.role === "agent") {
      where.assignedAgentId = user.id;
    }

    // scope=operations: show STAFF/GROUP_STAFF conversations (role=staff)
    // scope=owners: show OWNER conversations (role=owner)
    // default: show GUEST + LEAD conversations (role=guest OR role=lead)
    if (scope === "operations") {
      where.customer = { role: "staff" };
    } else if (scope === "owners") {
      where.customer = { role: "owner" };
    } else {
      where.customer = { role: { in: ["guest", "lead"] } };
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
    const conversationIds = conversations.map((c: { id: string }) => c.id);
    const unreadCounts = conversationIds.length > 0
      ? await prisma.$queryRaw<{ conversation_id: string; count: bigint }[]>(
          Prisma.sql`SELECT m.conversation_id, COUNT(*)::bigint as count
           FROM messages m
           LEFT JOIN conversation_reads cr
             ON cr.conversation_id = m.conversation_id AND cr.user_id = ${user.id}::uuid
           WHERE m.conversation_id IN (${Prisma.join(conversationIds.map((id: string) => Prisma.sql`${id}::uuid`))})
             AND m.deleted_at IS NULL
             AND m.sender_type = 'customer'
             AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
           GROUP BY m.conversation_id`,
        )
      : [];

    const unreadMap = new Map(unreadCounts.map((r) => [r.conversation_id, Number(r.count)]));

    const result: ConversationOut[] = conversations.map((c: Record<string, unknown> & { id: string; tenantId: string; customerId: string; assignedAgentId: string | null; channel: string; status: string; priority?: string; detectedLanguage: string | null; createdAt: Date; updatedAt: Date; customer: { phone: string; name: string | null; email?: string | null; profilePictureUrl?: string | null; tag?: string | null; role: string } | null; messages: { originalText: string | null }[] }) => ({
      id: c.id,
      tenant_id: c.tenantId,
      customer_id: c.customerId,
      assigned_agent_id: c.assignedAgentId,
      channel: c.channel,
      status: c.status,
      priority: (c as unknown as { priority?: string }).priority ?? "normal",
      detected_language: c.detectedLanguage,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      customer: c.customer
        ? { phone: c.customer.phone, name: c.customer.name, email: c.customer.email, profile_picture_url: c.customer.profilePictureUrl, tag: c.customer.tag, role: c.customer.role }
        : null,
      unread_count: unreadMap.get(c.id) || 0,
      last_message_preview: c.messages[0]?.originalText?.substring(0, 80) || null,
    }));

    return reply.send(result);
  });

  // GET /conversations/unread-summary
  // Returns unread counts for all scopes in one query.
  // Replaces 3 separate API calls from DashboardLayout (main + operations + owners).
  app.get("/unread-summary", async (request, reply) => {
    const { prisma } = request.server.deps;
    const user = request.user;

    const rows = await prisma.$queryRaw<{ scope: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN cu.role = 'staff'  THEN 'operations'
          WHEN cu.role = 'owner'  THEN 'owners'
          ELSE 'main'
        END AS scope,
        COUNT(DISTINCT c.id)::bigint AS count
      FROM conversations c
      JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN conversation_reads cr
        ON cr.conversation_id = c.id AND cr.user_id = ${user.id}::uuid
      WHERE c.tenant_id = ${user.tenantId}::uuid
        AND c.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_type = 'customer'
            AND m.deleted_at IS NULL
            AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
        )
      GROUP BY scope
    `;

    const result = { main: 0, operations: 0, owners: 0 };
    for (const row of rows) {
      if (row.scope in result) result[row.scope as keyof typeof result] = Number(row.count);
    }
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
        customer: conversation.customer ? { phone: conversation.customer.phone, name: conversation.customer.name, role: conversation.customer.role } : null,
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

      // Soft-delete: mark as deleted instead of hard-removing.
      // This preserves audit trail and avoids cascading FK errors.
      // Hard delete is available via admin tooling if needed.
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { deletedAt: new Date() },
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
      customer: { phone: customer.phone, name: customer.name, role: customer.role },
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
        // Use gpt-4o-mini explicitly — guaranteed JSON mode support regardless of tenant model
        logger.info(`[SuggestEmail] calling OpenAI for conversation ${conversationId}, msgs=${conversation.messages.length}`);
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
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

        const raw = completion.choices[0].message.content || "{}";
        logger.info(`[SuggestEmail] raw response: ${raw.slice(0, 200)}`);

        let subject = "";
        let body = "";
        try {
          const parsed = JSON.parse(raw);
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

  // Suggest service order (O.S.) fields using AI based on conversation history
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/suggest-os",
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
          customer: { select: { name: true, phone: true } },
        },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const tenantSettings = await prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } });
      let apiKey = config.OPENAI_API_KEY;
      if (tenantSettings?.openaiApiKey) {
        try { apiKey = decrypt(tenantSettings.openaiApiKey); } catch { /* fallback */ }
      }

      if (!apiKey) {
        return reply.status(503).send({ detail: "OpenAI API key not configured" });
      }

      const history = conversation.messages
        .filter((m) => m.originalText?.trim())
        .map((m) => `${m.senderType === "customer" ? "Cliente" : "Atendente"}: ${m.originalText}`)
        .join("\n");

      const customerName = conversation.customer?.name || "cliente";

      try {
        const openai = new OpenAI({ apiKey });
        logger.info(`[SuggestOS] calling OpenAI for conversation ${conversationId}, msgs=${conversation.messages.length}`);

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Você é um especialista em operações de hospedagem. Analise a conversa e preencha os campos de uma Ordem de Serviço (O.S.) em JSON.

Responda APENAS com JSON válido neste formato exato:
{
  "location": "unidade/apartamento/local mencionado (string)",
  "category": "limpeza|manutenção|vistoria|enxoval|check-in|check-out|suporte|reposição|emergência|outro",
  "description": "descrição resumida do problema ou demanda (máx 100 chars)",
  "priority": "low|medium|high|urgent",
  "origin": "hóspede|proprietário|limpeza|vistoria|equipe_interna",
  "impactOnStay": "none|partial|blocks_checkin",
  "guestName": "nome do hóspede se mencionado, senão vazio",
  "paymentResponsible": "guest|vivare|owner",
  "notes": "observações adicionais relevantes (máx 200 chars)"
}

Regras:
- priority "urgent" apenas para emergências reais (vazamento, incêndio, acidente)
- priority "high" para problemas que afetam a estadia atual
- priority "medium" para manutenções programáveis
- priority "low" para melhorias e limpezas de rotina
- Se não tiver informação suficiente para um campo, use o valor padrão mais razoável`,
            },
            {
              role: "user",
              content: `Conversa com ${customerName}:\n\n${history}`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 400,
          temperature: 0.3,
        });

        const raw = completion.choices[0].message.content || "{}";
        logger.info(`[SuggestOS] raw response: ${raw.slice(0, 300)}`);

        let suggestion: Record<string, string> = {};
        try { suggestion = JSON.parse(raw); } catch { /* leave empty */ }

        return reply.send({
          location: suggestion.location || "",
          category: suggestion.category || "outro",
          description: suggestion.description || "",
          priority: suggestion.priority || "medium",
          origin: suggestion.origin || "hóspede",
          impactOnStay: suggestion.impactOnStay || "none",
          guestName: suggestion.guestName || customerName,
          paymentResponsible: suggestion.paymentResponsible || "vivare",
          notes: suggestion.notes || "",
        });
      } catch (err: unknown) {
        logger.error({ err }, "[SuggestOS] OpenAI error");
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(502).send({ detail: msg });
      }
    },
  );
}
