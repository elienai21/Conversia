import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";

const approveTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  app.get("/daily", async (request, reply) => {
    const { prisma } = request.server.deps;
    const user = request.user;

    const tasks = await prisma.taskQueue.findMany({
      where: {
        tenantId: user.tenantId,
        status: "pending",
      },
      orderBy: { scheduledFor: "asc" },
    });

    return reply.send(tasks);
  });

  app.post("/approve", async (request, reply) => {
    const { prisma, services, socket } = request.server.deps;
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

      // Force to active state if it was queued/closed
      if (conversation.status !== "active") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: "active" },
        });
      }

      // Assign agent if not assigned
      if (!conversation.assignedAgentId) {
        await services.assignConversationToAgent(conversation.id, user.id);
      }

      // 3. Persist the Chat Message Systemically
      const message = await services.saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        senderId: user.id,
        text: task.messagePayload,
        detectedLanguage: user.preferredLanguage || "en",
      });

      // 4. Broker the WhatsApp sending sequence
      await services.sendWhatsappMessage(user.tenantId, customer.phone, task.messagePayload);

      // 5. Update Task
      await prisma.taskQueue.update({
        where: { id: task.id },
        data: { status: "sent" },
      });

      // 6. Broadcast Realtime UX
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
}
