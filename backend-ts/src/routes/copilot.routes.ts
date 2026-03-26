import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  suggestionRequestSchema,
  type SuggestionOut,
} from "../schemas/suggestion.schema.js";
import { enqueueSuggestionJob } from "../services/copilot.service.js";

import { polishText } from "../services/polish-text.service.js";
import { getRecentMessages } from "../services/message.service.js";

export async function copilotRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/suggestion",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;

      const parsed = suggestionRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "Invalid message_id" });
      }

      // Verify conversation belongs to agent's tenant
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: user.tenantId },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // Agents can only get suggestions for their assigned conversations
      if (
        user.role === "agent" &&
        conversation.assignedAgentId !== user.id
      ) {
        return reply
          .status(403)
          .send({ detail: "Not assigned to this conversation" });
      }

      // Verify message belongs to this conversation
      const message = await prisma.message.findFirst({
        where: {
          id: parsed.data.message_id,
          conversationId,
        },
      });

      if (!message) {
        return reply.status(404).send({ detail: "Message not found" });
      }

      const queueResult = await enqueueSuggestionJob(
        user.tenantId,
        message,
        user.id,
        user.preferredLanguage,
      );

      if (!queueResult.ok) {
        return reply.status(queueResult.error.statusCode).send({ 
          detail: queueResult.error.message 
        });
      }

      // Explicit pattern: AI endpoints respond with 202 Accepted and a job reference
      return reply.status(202).send({ 
        status: "processing", 
        job_id: queueResult.value.jobId,
        detail: "Suggestion request has been queued."
      });

      // Note: Full suggestion body is no longer returned instantly
    },
  );

  // POST /:conversationId/polish-text — polish/correct agent text before sending
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/polish-text",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;
      const body = request.body as { text?: string };

      if (!body.text?.trim()) {
        return reply.status(422).send({ detail: "Text is required" });
      }

      // Verify conversation belongs to agent's tenant
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: user.tenantId },
      });

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // Get recent messages for context
      const recentMessages = await getRecentMessages(conversationId, 6);
      const context = recentMessages
        .reverse()
        .map((m) => `[${m.senderType}]: ${m.originalText}`)
        .join("\n");

      const result = await polishText({
        tenantId: user.tenantId,
        text: body.text.trim(),
        context: context || undefined,
      });

      return reply.send({ polished_text: result.polishedText });
    },
  );
}
