import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { logger } from "../lib/logger.js";
import { saveMessage } from "../services/message.service.js";
import { sendWhatsappMessage } from "../services/whatsapp.service.js";

interface CreateServiceOrderBody {
  conversationId?: string;
  location: string;
  description: string;
  assignedTo?: string;
  assignedPhone?: string;
}

interface UpdateServiceOrderBody {
  status?: string;
  assignedTo?: string;
  location?: string;
  description?: string;
}

export async function serviceOrderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // List all service orders for the tenant
  app.get<{ Querystring: { status?: string } }>("/", async (request, reply) => {
    const { prisma } = request.server.deps;
    const tenantId = request.user.tenantId;
    const { status } = request.query;

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;

    const orders = await prisma.serviceOrder.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        conversation: {
          select: { id: true, customer: { select: { name: true, phone: true } } },
        },
      },
    });

    return reply.send(orders);
  });

  // Create a new service order
  app.post<{ Body: CreateServiceOrderBody }>("/", async (request, reply) => {
    const { prisma, socket } = request.server.deps;
    const tenantId = request.user.tenantId;
    const { conversationId, location, description, assignedTo, assignedPhone } = request.body;

    if (!location || !description) {
      return reply.status(400).send({ detail: "location e description são obrigatórios." });
    }

    // Auto-increment sequential number per tenant
    const lastOrder = await prisma.serviceOrder.findFirst({
      where: { tenantId },
      orderBy: { sequentialNumber: "desc" },
      select: { sequentialNumber: true },
    });
    const nextNumber = (lastOrder?.sequentialNumber ?? 0) + 1;

    const order = await prisma.serviceOrder.create({
      data: {
        tenantId,
        conversationId: conversationId ?? null,
        sequentialNumber: nextNumber,
        location,
        description,
        assignedTo: assignedTo ?? null,
        status: "pending",
      },
    });

    logger.info(`[ServiceOrder] #${nextNumber} criada para tenant ${tenantId}`);

    // If linked to a conversation, insert a system card message
    if (conversationId) {
      const cardText = [
        `🚨 *NOVA ORDEM DE SERVIÇO #${nextNumber}*`,
        `📍 Local: ${location}`,
        `🔧 Tarefa: ${description}`,
        assignedTo ? `👷 Responsável: ${assignedTo}` : "",
        `\nResponda "Iniciar" quando começar e envie a foto da nota fiscal quando terminar.`,
      ]
        .filter(Boolean)
        .join("\n");

      const message = await saveMessage({
        conversationId,
        senderType: "system",
        text: cardText,
      });

      socket.emitToConversation(conversationId, "message.new", {
        id: message.id,
        conversation_id: message.conversationId,
        sender_type: message.senderType,
        original_text: message.originalText,
        created_at: message.createdAt,
        translations: [],
        attachments: [],
      });
    }

    // If staff phone provided, dispatch WhatsApp message
    if (assignedPhone) {
      const whatsappText = [
        `🚨 NOVA ORDEM DE SERVIÇO #${nextNumber}`,
        `Local: ${location}`,
        `Tarefa: ${description}`,
        `\nPor favor, responda "Iniciar" quando começar e envie a foto da nota fiscal quando terminar.`,
      ].join("\n");

      try {
        await sendWhatsappMessage(tenantId, assignedPhone, whatsappText);
        logger.info(`[ServiceOrder] WhatsApp enviado para ${assignedPhone}`);
      } catch (err) {
        logger.warn({ err }, `[ServiceOrder] Falha ao enviar WhatsApp para ${assignedPhone}`);
      }
    }

    return reply.status(201).send(order);
  });

  // Update a service order (Kanban drag, assign, etc.)
  app.patch<{ Params: { id: string }; Body: UpdateServiceOrderBody }>(
    "/:id",
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const tenantId = request.user.tenantId;
      const { id } = request.params;
      const { status, assignedTo, location, description } = request.body;

      const existing = await prisma.serviceOrder.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.status(404).send({ detail: "Ordem de serviço não encontrada." });
      }

      const data: Record<string, unknown> = {};
      if (status) data.status = status;
      if (assignedTo !== undefined) data.assignedTo = assignedTo;
      if (location) data.location = location;
      if (description) data.description = description;

      const updated = await prisma.serviceOrder.update({
        where: { id },
        data,
      });

      logger.info(`[ServiceOrder] #${existing.sequentialNumber} atualizada para status=${updated.status}`);

      return reply.send(updated);
    },
  );
}

