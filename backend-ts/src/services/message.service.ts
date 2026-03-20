import { prisma } from "../lib/prisma.js";

export async function saveMessage(params: {
  conversationId: string;
  senderType: string;
  senderId?: string;
  text: string;
  detectedLanguage?: string;
  externalId?: string;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      senderType: params.senderType,
      senderId: params.senderId ?? null,
      originalText: params.text,
      detectedLanguage: params.detectedLanguage ?? null,
      externalId: params.externalId ?? null,
    },
  });

  // Torna a Fila de Chats Orgânica (puxa pro topo ao chegar nova msg)
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() }
  });

  return message;
}

export async function saveAttachment(params: {
  messageId: string;
  type: string;
  mimeType?: string;
  fileName?: string;
  fileSizeBytes?: number;
  sourceUrl?: string;
  providerMediaId?: string;
}) {
  return prisma.messageAttachment.create({
    data: {
      messageId: params.messageId,
      type: params.type,
      mimeType: params.mimeType ?? null,
      fileName: params.fileName ?? null,
      fileSizeBytes: params.fileSizeBytes ?? null,
      sourceUrl: params.sourceUrl ?? null,
      providerMediaId: params.providerMediaId ?? null,
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
    where: { conversationId, deletedAt: null },
    include: { translations: true, attachments: true },
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
