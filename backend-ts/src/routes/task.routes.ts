import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { runDailyTaskSync } from "../workers/task.worker.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";

const approveTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()),
});

const editTaskSchema = z.object({
  messagePayload: z.string().min(1).max(2000),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // GET /tasks/daily — list pending tasks + last sync timestamp
  app.get("/daily", async (request, reply) => {
    const user = request.user;

    const [tasks, settings] = await Promise.all([
      prisma.taskQueue.findMany({
        where: { tenantId: user.tenantId, status: "pending" },
        orderBy: { scheduledFor: "asc" },
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
        select: { lastTaskSyncAt: true },
      }),
    ]);

    return reply.send({
      tasks,
      lastSyncAt: settings?.lastTaskSyncAt?.toISOString() ?? null,
    });
  });

  // POST /tasks/sync — force sync and return summary
  app.post("/sync", async (request, reply) => {
    try {
      const summary = await runDailyTaskSync();
      return reply.send({ success: true, summary });
    } catch (err) {
      logger.error({ err }, "[TaskRoutes] Sync error");
      return reply.status(500).send({ detail: "Falha ao forçar sincronização" });
    }
  });

  // GET /tasks/debug — returns raw CRM data for diagnostics (first 3 reservations)
  app.get("/debug", async (request, reply) => {
    const user = request.user;

    const adapterRes = await CrmAdapterFactory.getAdapter(user.tenantId);
    if (!adapterRes.ok) {
      return reply.status(400).send({ detail: adapterRes.error.message });
    }

    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 3);

    const searchRes = await adapterRes.value.searchActiveReservations({
      from: today.toISOString().split("T")[0],
      to: future.toISOString().split("T")[0],
    });

    if (!searchRes.ok) {
      return reply.status(502).send({ detail: searchRes.error.message });
    }

    const reservations = searchRes.value;
    const sample = reservations.slice(0, 3);

    return reply.send({
      total: reservations.length,
      sample: sample.map((r) => ({
        keys: Object.keys(r as object),
        data: r,
      })),
    });
  });

  // PATCH /tasks/:id — edit message before approval
  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const parsed = editTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const task = await prisma.taskQueue.findFirst({
      where: { id, tenantId: user.tenantId, status: "pending" },
    });

    if (!task) {
      return reply.status(404).send({ detail: "Task não encontrada ou já enviada" });
    }

    const updated = await prisma.taskQueue.update({
      where: { id },
      data: { messagePayload: parsed.data.messagePayload },
    });

    return reply.send(updated);
  });

  // POST /tasks/approve — approve and send tasks
  app.post("/approve", async (request, reply) => {
    const { services, socket } = request.server.deps;
    const user = request.user;

    const parsed = approveTasksSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const tasks = await prisma.taskQueue.findMany({
      where: {
        id: { in: parsed.data.taskIds },
        tenantId: user.tenantId,
        status: "pending",
      },
    });

    for (const task of tasks) {
      // 1. Resolve Customer by Phone
      let customer = await prisma.customer.findFirst({
        where: { tenantId: user.tenantId, phone: task.customerPhone },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            tenantId: user.tenantId,
            phone: task.customerPhone,
            name: task.customerName,
          },
        });
      }

      // 2. Resolve Conversation
      const { conversation, isNew } = await services.findOrCreateConversation(
        user.tenantId,
        customer.id,
        "whatsapp"
      );

      if (conversation.status !== "active") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: "active" },
        });
      }

      if (!conversation.assignedAgentId) {
        await services.assignConversationToAgent(conversation.id, user.id);
      }

      // 3. Persist the Chat Message
      const message = await services.saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        senderId: user.id,
        text: task.messagePayload,
        detectedLanguage: user.preferredLanguage || "pt",
      });

      // 4. Send via WhatsApp
      await services.sendWhatsappMessage(user.tenantId, customer.phone, task.messagePayload);

      // 5. Mark task as sent
      await prisma.taskQueue.update({
        where: { id: task.id },
        data: { status: "sent" },
      });

      // 6. Broadcast realtime events
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
    }

    return reply.status(200).send({ success: true, processed: tasks.length });
  });

  // DELETE /tasks/:id — cancel a task
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const task = await prisma.taskQueue.findFirst({
      where: { id, tenantId: user.tenantId, status: "pending" },
    });

    if (!task) {
      return reply.status(404).send({ detail: "Task não encontrada" });
    }

    await prisma.taskQueue.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return reply.send({ success: true });
  });
}
