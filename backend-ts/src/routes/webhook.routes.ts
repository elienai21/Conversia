import type { FastifyInstance } from "fastify";
import type { Conversation } from "@prisma/client";
import { config } from "../config.js";
import {
  parseIncomingMessage,
  resolveTenant,
} from "../services/whatsapp.service.js";
import {
  parseIncomingInstagramMessage,
  resolveInstagramTenant,
  instagramCustomerId,
} from "../services/instagram.service.js";
import {
  findOrCreateCustomer,
  findOrCreateConversation,
} from "../services/conversation.service.js";
import { saveAttachment, saveMessage, saveTranslation } from "../services/message.service.js";
import type { MessageAttachmentInput } from "../services/whatsapp/provider.interface.js";
import { fetchEvolutionProfilePicture } from "../services/whatsapp/evolution.provider.js";
import { detectLanguage } from "../services/language.service.js";
import { detectIntent } from "../services/intent.service.js";
import { translateText } from "../services/translation.service.js";
import { enqueueConversation } from "../services/queue.service.js";
import {
  findAvailableAgent,
  assignConversationToAgent,
} from "../services/assignment.service.js";
import { prisma } from "../lib/prisma.js";
import { SocketService } from "../services/socket.service.js";
import { tryAutoResponse } from "../services/auto-response.service.js";

// Shared pipeline (steps 5-11) used by both WhatsApp and Instagram
async function processIncomingMessage(params: {
  tenant: { id: string; defaultLanguage: string };
  conversation: Conversation;
  text: string;
  externalMessageId: string;
  isNewConversation: boolean;
  attachments?: MessageAttachmentInput[];
}): Promise<void> {
  const { tenant, conversation, text, externalMessageId, isNewConversation, attachments = [] } = params;

  // Step 5: Detect language
  const detectedLang = text.startsWith("[") && text.endsWith("]") ? null : detectLanguage(text);

  // Step 6: Update conversation language if not set
  if (!conversation.detectedLanguage) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { detectedLanguage: detectedLang ?? tenant.defaultLanguage },
    });
  }

  // Step 7: Save message
  const message = await saveMessage({
    conversationId: conversation.id,
    senderType: "customer",
    text,
    detectedLanguage: detectedLang ?? undefined,
    externalId: externalMessageId,
  });

  for (const attachment of attachments) {
    await saveAttachment({
      messageId: message.id,
      type: attachment.type,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      fileSizeBytes: attachment.fileSizeBytes,
      sourceUrl: attachment.sourceUrl,
      providerMediaId: attachment.providerMediaId,
    });
  }

  // Emit real-time event for the new message
  SocketService.emitToConversation(conversation.id, "message.new", {
    id: message.id,
    conversation_id: message.conversationId,
    sender_type: message.senderType,
    original_text: message.originalText,
    detected_language: message.detectedLanguage,
    created_at: message.createdAt,
    attachments: attachments.map((attachment, index) => ({
      id: `${message.id}-attachment-${index}`,
      type: attachment.type,
      mime_type: attachment.mimeType ?? null,
      file_name: attachment.fileName ?? null,
      file_size_bytes: attachment.fileSizeBytes ?? null,
      source_url: attachment.sourceUrl ?? null,
      provider_media_id: attachment.providerMediaId ?? null,
    })),
  });

  // If new conversation, notify the tenant room so sidebar updates
  if (isNewConversation) {
    SocketService.emitToTenant(tenant.id, "conversation.updated", {
      type: "new",
      conversationId: conversation.id,
    });
  }

  // Step 8: Detect intent
  const intent = detectedLang ? await detectIntent(tenant.id, text) : "media";
  console.log(`[Webhook] Intent detected: ${intent}`);

  // Step 9: Translate to tenant default language if different
  const tenantLang = tenant.defaultLanguage;
  if (detectedLang && detectedLang !== tenantLang) {
    const { translatedText, provider } = await translateText(
      tenant.id,
      text,
      detectedLang,
      tenantLang,
    );

    await saveTranslation({
      messageId: message.id,
      sourceLanguage: detectedLang,
      targetLanguage: tenantLang,
      translatedText,
      provider,
    });
  }

  // Step 9.5: Try FAQ auto-response before assigning an agent
  try {
    const autoHandled = await tryAutoResponse({
      tenantId: tenant.id,
      conversationId: conversation.id,
      intent,
      detectedLang: detectedLang ?? tenant.defaultLanguage,
    });
    if (autoHandled) {
      console.log(`[Webhook] Auto-response handled conversation ${conversation.id}`);
      return;
    }
  } catch (err) {
    console.warn("[Webhook] Auto-response failed, falling through to agent:", err);
  }

  // Step 10: Try to assign an agent
  if (!conversation.assignedAgentId) {
    const agentId = await findAvailableAgent(tenant.id);
    if (agentId) {
      await assignConversationToAgent(conversation.id, agentId);
      console.log(`[Webhook] Assigned agent ${agentId}`);
      SocketService.emitToTenant(tenant.id, "conversation.updated", {
        type: "assigned",
        conversationId: conversation.id,
        agentId,
      });
    } else {
      // Step 11: Enqueue if no agent available
      await enqueueConversation(tenant.id, conversation.id);
      console.log(`[Webhook] Enqueued conversation ${conversation.id}`);
      SocketService.emitToTenant(tenant.id, "conversation.updated", {
        type: "queued",
        conversationId: conversation.id,
      });
    }
  }
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // ─── WhatsApp ───────────────────────────────────────────

  // WhatsApp webhook verification (challenge-response)
  app.get("/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode !== "subscribe") {
      return reply.status(403).send({ detail: "Verification failed" });
    }

    // Check env var first, then any TenantSettings verify token
    if (token === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(challenge);
    }

    const settingsMatch = await prisma.tenantSettings.findFirst({
      where: { whatsappVerifyToken: token },
    });
    if (settingsMatch) {
      return reply.send(challenge);
    }

    return reply.status(403).send({ detail: "Verification failed" });
  });

  // WhatsApp incoming message
  app.post("/whatsapp", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Step 1: Parse incoming message
    const parsed = parseIncomingMessage(body);
    if (!parsed || parsed.messages.length === 0) {
      return reply.send({ status: "ignored" });
    }

    // Process each message (usually only 1)
    for (const incoming of parsed.messages) {
      // Step 2: Resolve tenant by providerId
      const tenant = await resolveTenant(incoming.providerId, parsed.providerName);
      if (!tenant) {
        console.warn(`No tenant for providerId: ${incoming.providerId}`);
        continue;
      }

      // Step 3: Find or create customer
      const customer = await findOrCreateCustomer(
        tenant.id,
        incoming.from,
        incoming.displayName,
      );

      // Step 4: Find or create conversation
      const { conversation, isNew } = await findOrCreateConversation(
        tenant.id,
        customer.id,
        "whatsapp",
      );

      // Steps 5-11: Shared pipeline
      await processIncomingMessage({
        tenant,
        conversation,
        text: incoming.text,
        externalMessageId: incoming.messageId,
        isNewConversation: isNew,
        attachments: incoming.attachments,
      });
    }

    return reply.send({ status: "processed" });
  });

  // ─── Evolution API Webhook ─────────────────────────────
  app.post("/evolution", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Step 1: Parse incoming message (factory auto-detects Evolution)
    const parsed = parseIncomingMessage(body);
    if (!parsed || parsed.messages.length === 0) {
      return reply.send({ status: "ignored" });
    }

    // Process each message
    for (const incoming of parsed.messages) {
      // Step 2: Resolve tenant by instance name
      const tenant = await resolveTenant(incoming.providerId, parsed.providerName);
      if (!tenant) {
        console.warn(`[Evolution Webhook] No tenant for instance: ${incoming.providerId}`);
        continue;
      }

      // Step 2.5: Try to fetch profile picture from Evolution API (non-blocking)
      let profilePicUrl: string | undefined;
      try {
        profilePicUrl = await fetchEvolutionProfilePicture(tenant.id, incoming.from);
      } catch {
        // Ignore errors - profile picture is optional
      }

      // Step 3: Find or create customer
      const customer = await findOrCreateCustomer(
        tenant.id,
        incoming.from,
        incoming.displayName,
        profilePicUrl,
      );

      // Step 4: Find or create conversation
      const { conversation, isNew } = await findOrCreateConversation(
        tenant.id,
        customer.id,
        "whatsapp",
      );

      // Steps 5-11: Shared pipeline
      await processIncomingMessage({
        tenant,
        conversation,
        text: incoming.text,
        externalMessageId: incoming.messageId,
        isNewConversation: isNew,
        attachments: incoming.attachments,
      });
    }

    return reply.send({ status: "processed" });
  });

  // ─── Instagram DM ──────────────────────────────────────

  // Instagram webhook verification (challenge-response)
  app.get("/instagram", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token === config.INSTAGRAM_VERIFY_TOKEN) {
      return reply.send(challenge);
    }

    return reply.status(403).send({ detail: "Verification failed" });
  });

  // Instagram incoming message
  app.post("/instagram", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Verify this is an Instagram event
    if (body.object !== "instagram") {
      return reply.send({ status: "ignored" });
    }

    // Step 1: Parse incoming message
    const incoming = parseIncomingInstagramMessage(body);
    if (!incoming) {
      return reply.send({ status: "ignored" });
    }

    // Step 2: Resolve tenant by Instagram page ID
    const tenant = await resolveInstagramTenant(incoming.pageId);
    if (!tenant) {
      console.warn(`No tenant for Instagram pageId: ${incoming.pageId}`);
      return reply.send({ status: "no_tenant" });
    }

    // Step 3: Find or create customer (using ig: prefix for IGSID)
    const customer = await findOrCreateCustomer(
      tenant.id,
      instagramCustomerId(incoming.senderId),
      undefined,
    );

    // Step 4: Find or create conversation
    const { conversation, isNew } = await findOrCreateConversation(
      tenant.id,
      customer.id,
      "instagram",
    );

    // Steps 5-11: Shared pipeline
    await processIncomingMessage({
      tenant,
      conversation,
      text: incoming.text,
      externalMessageId: incoming.messageId,
      isNewConversation: isNew,
      attachments: incoming.attachments,
    });

    return reply.send({ status: "processed" });
  });
}
