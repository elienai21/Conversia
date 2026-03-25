import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { logger } from "../lib/logger.js";
import { saveMessage } from "../services/message.service.js";
import { sendWhatsappMessage } from "../services/whatsapp.service.js";

interface CreateServiceOrderBody {
  conversationId?: string;
  location: string;
  origin?: string;
  category?: string;
  subcategory?: string;
  description: string;
  priority?: string;
  impactOnStay?: string;
  guestName?: string;
  reservationCode?: string;
  paymentResponsible?: string;
  assignedTo?: string;
  assignedPhone?: string;
  dueDate?: string;
  notes?: string;
}

interface UpdateServiceOrderBody {
  status?: string;
  assignedTo?: string;
  location?: string;
  category?: string;
  description?: string;
  priority?: string;
  impactOnStay?: string;
  paymentResponsible?: string;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  problems?: string;
  guestName?: string;
  reservationCode?: string;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "URGENTE",
};

const PRIORITY_EMOJI: Record<string, string> = {
  low: "🟢",
  medium: "🔵",
  high: "🟡",
  urgent: "🔴",
};

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
    const {
      conversationId,
      location,
      origin,
      category,
      subcategory,
      description,
      priority = "medium",
      impactOnStay,
      guestName,
      reservationCode,
      paymentResponsible,
      assignedTo,
      assignedPhone,
      dueDate,
      notes,
    } = request.body;

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
        origin: origin ?? null,
        category: category ?? null,
        subcategory: subcategory ?? null,
        description,
        priority,
        impactOnStay: impactOnStay ?? null,
        guestName: guestName ?? null,
        reservationCode: reservationCode ?? null,
        paymentResponsible: paymentResponsible ?? null,
        assignedTo: assignedTo ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes ?? null,
        status: "pending",
      },
    });

    logger.info(`[ServiceOrder] #${nextNumber} criada para tenant ${tenantId} | cat=${category} | prio=${priority}`);

    // If linked to a conversation, insert a system card message
    if (conversationId) {
      const prioEmoji = PRIORITY_EMOJI[priority] ?? "🔵";
      const prioLabel = PRIORITY_LABEL[priority] ?? priority;
      const cardText = [
        `🚨 *NOVA ORDEM DE SERVIÇO #${nextNumber}*`,
        `📍 Local: ${location}`,
        category ? `📂 Categoria: ${category}` : "",
        `🔧 Tarefa: ${description}`,
        `${prioEmoji} Prioridade: ${prioLabel}`,
        assignedTo ? `👷 Responsável: ${assignedTo}` : "",
        notes ? `📝 Obs: ${notes}` : "",
        `\nResponda "Iniciar" quando começar e envie a foto quando terminar.`,
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
      const prioEmoji = PRIORITY_EMOJI[priority] ?? "🔵";
      const whatsappText = [
        `🚨 NOVA ORDEM DE SERVIÇO #${nextNumber}`,
        `${prioEmoji} Prioridade: ${PRIORITY_LABEL[priority] ?? priority}`,
        `Local: ${location}`,
        category ? `Categoria: ${category}` : "",
        `Tarefa: ${description}`,
        notes ? `Obs: ${notes}` : "",
        `\nPor favor, responda "Iniciar" quando começar e envie a foto quando terminar.`,
      ]
        .filter(Boolean)
        .join("\n");

      try {
        await sendWhatsappMessage(tenantId, assignedPhone, whatsappText);
        logger.info(`[ServiceOrder] WhatsApp enviado para ${assignedPhone}`);
      } catch (err) {
        logger.warn({ err }, `[ServiceOrder] Falha ao enviar WhatsApp para ${assignedPhone}`);
      }
    }

    return reply.status(201).send(order);
  });

  // Update a service order (Kanban drag, assign, execution details, etc.)
  app.patch<{ Params: { id: string }; Body: UpdateServiceOrderBody }>(
    "/:id",
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const tenantId = request.user.tenantId;
      const { id } = request.params;

      const existing = await prisma.serviceOrder.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.status(404).send({ detail: "Ordem de serviço não encontrada." });
      }

      const {
        status,
        assignedTo,
        location,
        category,
        description,
        priority,
        impactOnStay,
        paymentResponsible,
        dueDate,
        startedAt,
        completedAt,
        notes,
        problems,
        guestName,
        reservationCode,
      } = request.body;

      const data: Record<string, unknown> = {};
      if (status !== undefined) data.status = status;
      if (assignedTo !== undefined) data.assignedTo = assignedTo;
      if (location !== undefined) data.location = location;
      if (category !== undefined) data.category = category;
      if (description !== undefined) data.description = description;
      if (priority !== undefined) data.priority = priority;
      if (impactOnStay !== undefined) data.impactOnStay = impactOnStay;
      if (paymentResponsible !== undefined) data.paymentResponsible = paymentResponsible;
      if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
      if (startedAt !== undefined) data.startedAt = startedAt ? new Date(startedAt) : null;
      if (completedAt !== undefined) data.completedAt = completedAt ? new Date(completedAt) : null;
      if (notes !== undefined) data.notes = notes;
      if (problems !== undefined) data.problems = problems;
      if (guestName !== undefined) data.guestName = guestName;
      if (reservationCode !== undefined) data.reservationCode = reservationCode;

      // Auto-set timestamps on status transitions
      if (status === "in_progress" && !existing.startedAt) {
        data.startedAt = new Date();
      }
      if (status === "done" && !existing.completedAt) {
        data.completedAt = new Date();
      }

      const updated = await prisma.serviceOrder.update({ where: { id }, data });

      logger.info(`[ServiceOrder] #${existing.sequentialNumber} → status=${updated.status}`);

      return reply.send(updated);
    },
  );
}
