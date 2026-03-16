import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  sendMessageRequestSchema,
  type MessageOut,
  type TranslationOut,
} from "../schemas/message.schema.js";
import {
  getConversationMessages,
  saveMessage,
  saveTranslation,
} from "../services/message.service.js";
import { translateText } from "../services/translation.service.js";
import { sendWhatsappMessage } from "../services/whatsapp.service.js";

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // List messages in a conversation
  app.get<{ Params: { conversationId: string } }>(
    "/:conversationId/messages",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;

      // Verify access
      const conversation = await getAgentConversation(
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const messages = await getConversationMessages(conversationId);

      const result: MessageOut[] = messages.map((m) => ({
        id: m.id,
        conversation_id: m.conversationId,
        sender_type: m.senderType,
        sender_id: m.senderId,
        original_text: m.originalText,
        detected_language: m.detectedLanguage,
        created_at: m.createdAt,
        translations: m.translations.map(
          (t): TranslationOut => ({
            target_language: t.targetLanguage,
            translated_text: t.translatedText,
            provider: t.provider,
          }),
        ),
      }));

      return reply.send(result);
    },
  );

  // Agent sends a reply
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/messages",
    async (request, reply) => {
      const user = request.user;
      const { conversationId } = request.params;

      const parsed = sendMessageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "Invalid message" });
      }

      const conversation = await getAgentConversation(
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // 1. Save agent message
      const message = await saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        senderId: user.id,
        text: parsed.data.text,
        detectedLanguage: user.preferredLanguage,
      });

      // 2. Translate to customer language if different
      const customerLang = conversation.detectedLanguage;
      const agentLang = user.preferredLanguage;
      const translations: TranslationOut[] = [];

      let outboundText = parsed.data.text;

      if (customerLang && customerLang !== agentLang) {
        const { translatedText, provider } = await translateText(
          user.tenantId,
          parsed.data.text,
          agentLang,
          customerLang,
        );

        await saveTranslation({
          messageId: message.id,
          sourceLanguage: agentLang,
          targetLanguage: customerLang,
          translatedText,
          provider,
        });

        translations.push({
          target_language: customerLang,
          translated_text: translatedText,
          provider,
        });

        outboundText = translatedText;
      }

      // 3. Send via WhatsApp
      if (conversation.channel === "whatsapp" && conversation.customer) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: user.tenantId },
        });

        if (tenant?.whatsappPhoneNumberId) {
          await sendWhatsappMessage(
            tenant.whatsappPhoneNumberId,
            conversation.customer.phone,
            outboundText,
          );
        }
      }

      // 4. Mark suggestion as used if provided
      if (parsed.data.suggestion_id) {
        await prisma.aISuggestion.updateMany({
          where: {
            id: parsed.data.suggestion_id,
            agentId: user.id,
          },
          data: {
            wasUsed: true,
            finalText: parsed.data.text,
          },
        });
      }

      const result: MessageOut = {
        id: message.id,
        conversation_id: message.conversationId,
        sender_type: message.senderType,
        sender_id: message.senderId,
        original_text: message.originalText,
        detected_language: message.detectedLanguage,
        created_at: message.createdAt,
        translations,
      };

      return reply.send(result);
    },
  );
}

async function getAgentConversation(
  conversationId: string,
  tenantId: string,
  agentId?: string,
) {
  const where: Record<string, unknown> = {
    id: conversationId,
    tenantId,
  };

  if (agentId) {
    where.assignedAgentId = agentId;
  }

  return prisma.conversation.findFirst({
    where,
    include: { customer: true },
  });
}
