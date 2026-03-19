import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  sendMessageRequestSchema,
  type AttachmentOut,
  type MessageOut,
  type TranslationOut,
} from "../schemas/message.schema.js";
export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // List messages in a conversation
  app.get<{ Params: { conversationId: string } }>(
    "/:conversationId/messages",
    async (request, reply) => {
      const { prisma, services } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;

      // Verify access
      const conversation = await getAgentConversation(
        prisma,
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // Mark conversation as read for this user
      await prisma.conversationRead.upsert({
        where: {
          userId_conversationId: { userId: user.id, conversationId },
        },
        update: { lastReadAt: new Date() },
        create: { userId: user.id, conversationId, lastReadAt: new Date() },
      });

      const messages = await services.getConversationMessages(conversationId);

      const result: MessageOut[] = messages.map((m: any) => ({
        id: m.id,
        conversation_id: m.conversationId,
        sender_type: m.senderType,
        sender_id: m.senderId,
        original_text: m.originalText,
        detected_language: m.detectedLanguage,
        status: m.status || "sent",
        created_at: m.createdAt,
        translations: (m.translations ?? []).map(
          (t: any): TranslationOut => ({
            target_language: t.targetLanguage,
            translated_text: t.translatedText,
            provider: t.provider,
          }),
        ),
        attachments: (m.attachments ?? []).map(
          (attachment: any): AttachmentOut => ({
            id: attachment.id,
            type: attachment.type,
            mime_type: attachment.mimeType,
            file_name: attachment.fileName,
            file_size_bytes: attachment.fileSizeBytes,
            source_url: buildAttachmentSourceUrl(
              request,
              conversationId,
              m.id,
              attachment,
            ),
            provider_media_id: attachment.providerMediaId,
          }),
        ),
      }));

      return reply.send(result);
    },
  );

  app.get<{ Params: { conversationId: string; messageId: string; attachmentId: string } }>(
    "/:conversationId/messages/:messageId/attachments/:attachmentId",
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const user = request.user;
      const { conversationId, messageId, attachmentId } = request.params;

      const conversation = await getAgentConversation(
        prisma,
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        include: { attachments: true },
      });

      const attachment = message?.attachments?.find((item: any) => item.id === attachmentId);
      if (!attachment) {
        return reply.status(404).send({ detail: "Attachment not found" });
      }

      if (attachment.sourceUrl) {
        return reply.redirect(attachment.sourceUrl);
      }

      if (!attachment.providerMediaId) {
        return reply.status(404).send({ detail: "Attachment source unavailable" });
      }

      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
      });
      const token = settings?.whatsappApiToken || config.WHATSAPP_API_TOKEN;

      if (!token) {
        return reply.status(404).send({ detail: "Attachment source unavailable" });
      }

      const metadataResponse = await fetch(
        `${config.WHATSAPP_API_URL}/${attachment.providerMediaId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!metadataResponse.ok) {
        return reply.status(404).send({ detail: "Attachment source unavailable" });
      }

      const metadata = await metadataResponse.json() as { url?: string };
      if (!metadata.url) {
        return reply.status(404).send({ detail: "Attachment source unavailable" });
      }

      const mediaResponse = await fetch(metadata.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mediaResponse.ok) {
        return reply.status(404).send({ detail: "Attachment source unavailable" });
      }

      const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
      reply.header("content-type", attachment.mimeType || mediaResponse.headers.get("content-type") || "application/octet-stream");
      if (attachment.fileName) {
        reply.header("content-disposition", `inline; filename="${attachment.fileName}"`);
      }

      return reply.send(mediaBuffer);
    },
  );

  // Agent sends a reply
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/messages",
    async (request, reply) => {
      const { prisma, services, socket } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;

      const parsed = sendMessageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "Invalid message" });
      }

      const conversation = await getAgentConversation(
        prisma,
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      // 1. Save agent message
      const message = await services.saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        senderId: user.id,
        text: parsed.data.text,
        detectedLanguage: user.preferredLanguage,
      });

      // 2. Translate if target_language is explicitly set, or auto-detect from conversation
      const explicitTarget = parsed.data.target_language;
      const customerLang = conversation.detectedLanguage;
      const agentLang = user.preferredLanguage;
      const translations: TranslationOut[] = [];

      // "Auto / Original" should send the typed message without translation.
      const effectiveTargetLang = explicitTarget ?? null;

      let outboundText = parsed.data.text;

      if (effectiveTargetLang) {
        const { translatedText, provider } = await services.translateText(
          user.tenantId,
          parsed.data.text,
          agentLang,
          effectiveTargetLang,
        );

        await services.saveTranslation({
          messageId: message.id,
          sourceLanguage: agentLang,
          targetLanguage: effectiveTargetLang,
          translatedText,
          provider,
        });

        translations.push({
          target_language: effectiveTargetLang,
          translated_text: translatedText,
          provider,
        });

        outboundText = translatedText;
      }

      // 3. Emit socket events (after translation so translated text is included)
      socket.emitToConversation(conversation.id, "message.new", {
        id: message.id,
        conversation_id: message.conversationId,
        sender_type: message.senderType,
        original_text: message.originalText,
        detected_language: message.detectedLanguage,
        created_at: message.createdAt,
        translations,
      });

      socket.emitToTenant(user.tenantId, "conversation.updated", {
        type: "replied",
        conversationId: conversation.id,
      });

      // 4. Send via the appropriate channel
      if (conversation.customer) {
        const settings = await prisma.tenantSettings.findUnique({
          where: { tenantId: user.tenantId },
        });
        const tenant = await prisma.tenant.findUnique({
          where: { id: user.tenantId },
        });

        if (conversation.channel === "whatsapp") {
          await services.sendWhatsappMessage(user.tenantId, conversation.customer.phone, outboundText);
        } else if (conversation.channel === "instagram") {
          if (settings?.instagramPageAccessToken) {
            const igToken = services.decrypt(settings.instagramPageAccessToken);
            const igsid = conversation.customer.phone.replace(/^ig:/, "");
            await services.sendInstagramMessage(igToken, igsid, outboundText);
          }
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
        status: (message as any).status || "sent",
        created_at: message.createdAt,
        translations,
        attachments: [],
      };

      return reply.send(result);
    },
  );

  // Delete a message (soft delete)
  app.delete<{ Params: { conversationId: string; messageId: string } }>(
    "/:conversationId/messages/:messageId",
    async (request, reply) => {
      const user = request.user;
      const { conversationId, messageId } = request.params;
      const { prisma } = request.server.deps;

      const conversation = await getAgentConversation(
        prisma,
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const message = await prisma.message.findFirst({
        where: { id: messageId, conversationId },
      });

      if (!message || message.deletedAt) {
        return reply.status(404).send({ detail: "Message not found" });
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      request.server.deps.socket.emitToConversation(conversationId, "message.deleted", {
        messageId,
        conversationId,
      });

      return reply.status(204).send();
    },
  );

  // Send media message
  app.post<{ Params: { conversationId: string } }>(
    "/:conversationId/messages/media",
    async (request, reply) => {
      const { prisma, services, socket } = request.server.deps;
      const user = request.user;
      const { conversationId } = request.params;

      const conversation = await getAgentConversation(
        prisma,
        conversationId,
        user.tenantId,
        user.role === "agent" ? user.id : undefined,
      );

      if (!conversation) {
        return reply.status(404).send({ detail: "Conversation not found" });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(422).send({ detail: "No file uploaded" });
      }

      const buffer = await data.toBuffer();
      const base64 = buffer.toString("base64");
      const mimeType = data.mimetype;
      const fileName = data.filename;
      const fileSizeBytes = buffer.length;

      // Determine media type from mime
      let mediaType: "image" | "video" | "audio" | "document" = "document";
      if (mimeType.startsWith("image/")) mediaType = "image";
      else if (mimeType.startsWith("video/")) mediaType = "video";
      else if (mimeType.startsWith("audio/")) mediaType = "audio";

      const caption = (request.body as any)?.caption || "";

      // Save message in DB
      const message = await services.saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        senderId: user.id,
        text: caption || `[${mediaType}]`,
        detectedLanguage: user.preferredLanguage,
      });

      // Save attachment metadata
      const attachment = await services.saveAttachment({
        messageId: message.id,
        type: mediaType,
        mimeType,
        fileName,
        fileSizeBytes,
        sourceUrl: `data:${mimeType};base64,${base64.substring(0, 100)}...`,
      });

      // Send via WhatsApp
      if (conversation.customer && conversation.channel === "whatsapp") {
        const mediaUrl = `data:${mimeType};base64,${base64}`;
        await services.sendWhatsappMedia(user.tenantId, conversation.customer.phone, {
          type: mediaType,
          url: mediaUrl,
          caption: caption || undefined,
          fileName,
          mimeType,
        });
      }

      // Emit socket events
      socket.emitToConversation(conversation.id, "message.new", {
        id: message.id,
        conversation_id: message.conversationId,
        sender_type: message.senderType,
        original_text: message.originalText,
        detected_language: message.detectedLanguage,
        created_at: message.createdAt,
        translations: [],
        attachments: [{
          id: attachment.id,
          type: attachment.type,
          mime_type: attachment.mimeType,
          file_name: attachment.fileName,
          source_url: attachment.sourceUrl,
        }],
      });

      socket.emitToTenant(user.tenantId, "conversation.updated", {
        type: "replied",
        conversationId: conversation.id,
      });

      return reply.send({
        id: message.id,
        conversation_id: message.conversationId,
        sender_type: message.senderType,
        original_text: message.originalText,
        created_at: message.createdAt,
        translations: [],
        attachments: [{
          id: attachment.id,
          type: attachment.type,
          mime_type: attachment.mimeType,
          file_name: attachment.fileName,
          source_url: attachment.sourceUrl,
        }],
      });
    },
  );
}

function buildAttachmentSourceUrl(
  _request: unknown,
  conversationId: string,
  messageId: string,
  attachment: {
    id: string;
    sourceUrl?: string | null;
    providerMediaId?: string | null;
  },
) {
  if (attachment.sourceUrl) {
    return attachment.sourceUrl;
  }

  if (!attachment.providerMediaId) {
    return null;
  }

  return `/api/v1/conversations/${conversationId}/messages/${messageId}/attachments/${attachment.id}`;
}

function buildAttachmentSourceUrl(
  _request: unknown,
  conversationId: string,
  messageId: string,
  attachment: {
    id: string;
    sourceUrl?: string | null;
    providerMediaId?: string | null;
  },
) {
  if (attachment.sourceUrl) {
    return attachment.sourceUrl;
  }

  if (!attachment.providerMediaId) {
    return null;
  }

  return `/api/v1/conversations/${conversationId}/messages/${messageId}/attachments/${attachment.id}`;
}

async function getAgentConversation(
  prisma: FastifyInstance["deps"]["prisma"],
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
