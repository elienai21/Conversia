import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadMediaToStorage } from "../lib/storage.js";
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

      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
      });

      // Special handling for remote sourceUrl (Evolution API)
      if (attachment.sourceUrl) {
        // Handle base64 data URIs – decode and stream the binary content
        if (attachment.sourceUrl.startsWith("data:")) {
          try {
            const commaIndex = attachment.sourceUrl.indexOf(",");
            if (commaIndex > -1) {
              const header = attachment.sourceUrl.substring(0, commaIndex);
              const b64 = attachment.sourceUrl.substring(commaIndex + 1);
              const buffer = Buffer.from(b64, "base64");
              
              const mimeMatch = header.match(/^data:([^;]+)/);
              const dataMime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
              
              reply.header("content-type", attachment.mimeType || dataMime);
              if (attachment.fileName) {
                reply.header("content-disposition", `inline; filename="${attachment.fileName}"`);
              }
              return reply.send(buffer);
            }
          } catch (e) {
            request.server.log.error(e as Error, "Failed to parse data URI");
          }
          return reply.status(404).send({ detail: "Invalid data URI" });
        }

        const tokenRaw = settings?.evolutionInstanceToken;
        const apikey = tokenRaw ? request.server.deps.services.decrypt(tokenRaw) : process.env.EVOLUTION_API_KEY;

        const headers: Record<string, string> = {};
        if (apikey) headers["apikey"] = apikey;

        try {
          const mediaResponse = await fetch(attachment.sourceUrl, { headers });
          if (!mediaResponse.ok) {
            request.server.log.warn(`[Proxy] Remote media fetch failed: ${mediaResponse.status} for ${attachment.sourceUrl}`);
            return reply.status(502).send({ detail: "Could not retrieve media from remote source" });
          }

          const mediaBuffer = Buffer.from(await mediaResponse.arrayBuffer());
          reply.header("content-type", attachment.mimeType || mediaResponse.headers.get("content-type") || "application/octet-stream");
          if (attachment.fileName) {
            reply.header("content-disposition", `inline; filename="${attachment.fileName}"`);
          }
          return reply.send(mediaBuffer);
        } catch (err) {
          request.server.log.error(err as Error, `[Proxy] Remote media fetch error for ${attachment.sourceUrl}`);
          return reply.status(502).send({ detail: "Could not retrieve media from remote source" });
        }
      }

      if (!attachment.providerMediaId) {
        return reply.status(404).send({ detail: "Attachment source unavailable" });
      }

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

        request.server.log.info(
          `[MSG_SEND] channel="${conversation.channel}" phone="${conversation.customer?.phone}" tenantId="${user.tenantId}" whatsappProvider="${settings?.whatsappProvider}" evolutionInstance="${settings?.evolutionInstanceName}"`
        );

        if (conversation.channel === "whatsapp") {
          try {
            await services.sendWhatsappMessage(user.tenantId, conversation.customer.phone, outboundText);
            request.server.log.info(`[MSG_SEND] ✅ WhatsApp delivered to "${conversation.customer.phone}"`);
          } catch (sendErr: any) {
            request.server.log.error(`[MSG_SEND] ❌ WhatsApp FAILED to "${conversation.customer.phone}": ${sendErr.message}`);
            // Rethrow to surface the error to the frontend
            throw sendErr;
          }
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

      // Try to upload to Supabase storage; fall back to full data URI
      let mediaSourceUrl: string;
      const storageUrl = await uploadMediaToStorage(base64, mimeType, fileName);
      if (storageUrl) {
        mediaSourceUrl = storageUrl;
      } else {
        mediaSourceUrl = `data:${mimeType};base64,${base64}`;
      }

      // Save attachment metadata
      const attachment = await services.saveAttachment({
        messageId: message.id,
        type: mediaType,
        mimeType,
        fileName,
        fileSizeBytes,
        sourceUrl: mediaSourceUrl,
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

      const attachmentProxyUrl = `/api/v1/conversations/${conversationId}/messages/${message.id}/attachments/${attachment.id}`;

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
          source_url: attachmentProxyUrl,
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
          source_url: attachmentProxyUrl,
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
  // Always use the proxy URL for data URIs – they are too large for JSON responses
  // and the proxy endpoint will decode and serve the binary content
  if (attachment.sourceUrl && attachment.sourceUrl.startsWith("data:")) {
    return `/api/v1/conversations/${conversationId}/messages/${messageId}/attachments/${attachment.id}`;
  }

  if (!attachment.sourceUrl && !attachment.providerMediaId) {
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
