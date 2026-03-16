import { prisma } from "../lib/prisma.js";

export async function saveMessage(params: {
  conversationId: string;
  senderType: string;
  senderId?: string;
  text: string;
  detectedLanguage?: string;
  externalId?: string;
}) {
  return prisma.message.create({
    data: {
      conversationId: params.conversationId,
      senderType: params.senderType,
      senderId: params.senderId ?? null,
      originalText: params.text,
      detectedLanguage: params.detectedLanguage ?? null,
      externalId: params.externalId ?? null,
    },
  });
}

export async function saveTranslation(params: {
  messageId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  provider: string;
}) {
  return prisma.messageTranslation.create({
    data: {
      messageId: params.messageId,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      translatedText: params.translatedText,
      provider: params.provider,
    },
  });
}

export async function getConversationMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    include: { translations: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getRecentMessages(
  conversationId: string,
  limit = 10,
) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
