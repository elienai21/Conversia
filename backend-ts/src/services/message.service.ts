import { prisma } from "../lib/prisma.js";

export async function saveMessage(params: {
  conversationId: string;
  senderType: string;
  senderId?: string;
  text: string;
  detectedLanguage?: string;
  externalId?: string;
  senderPhone?: string;
  senderName?: string;
  isInternal?: boolean;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      senderType: params.senderType,
      senderId: params.senderId ?? null,
      originalText: params.text,
      detectedLanguage: params.detectedLanguage ?? null,
      externalId: params.externalId ?? null,
      senderPhone: params.senderPhone ?? null,
      senderName: params.senderName ?? null,
      isInternal: params.isInternal ?? false,
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
  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    include: {
      translations: true,
      attachments: true,
      forwardedFrom: { select: { id: true, originalText: true, senderType: true, senderName: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Resolve agent full names for messages sent by agents (senderId is the User.id)
  const agentIds = [
    ...new Set(
      messages
        .filter((m) => m.senderType === "agent" && m.senderId)
        .map((m) => m.senderId!),
    ),
  ];

  if (agentIds.length === 0) return messages;

  const agents = await prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, fullName: true },
  });
  const agentNameMap = new Map(agents.map((a) => [a.id, a.fullName]));

  return messages.map((m) => {
    if (m.senderType === "agent" && m.senderId && agentNameMap.has(m.senderId)) {
      return { ...m, senderName: agentNameMap.get(m.senderId) ?? m.senderName };
    }
    return m;
  });
}

export async function getRecentMessages(
  conversationId: string,
  limit = 15,
) {
  return prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { attachments: true },
  });
}
