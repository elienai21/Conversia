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
import { saveMessage, saveTranslation } from "../services/message.service.js";
import { detectLanguage } from "../services/language.service.js";
import { detectIntent } from "../services/intent.service.js";
import { translateText } from "../services/translation.service.js";
import { enqueueConversation } from "../services/queue.service.js";
import {
  findAvailableAgent,
  assignConversationToAgent,
} from "../services/assignment.service.js";
import { prisma } from "../lib/prisma.js";

// Shared pipeline (steps 5-11) used by both WhatsApp and Instagram
async function processIncomingMessage(params: {
  tenant: { id: string; defaultLanguage: string };
  conversation: Conversation;
  text: string;
  externalMessageId: string;
}): Promise<void> {
  const { tenant, conversation, text, externalMessageId } = params;

  // Step 5: Detect language
  const detectedLang = detectLanguage(text);

  // Step 6: Update conversation language if not set
  if (!conversation.detectedLanguage) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { detectedLanguage: detectedLang },
    });
  }

  // Step 7: Save message
  const message = await saveMessage({
    conversationId: conversation.id,
    senderType: "customer",
    text,
    detectedLanguage: detectedLang,
    externalId: externalMessageId,
  });

  // Step 8: Detect intent
  const intent = await detectIntent(tenant.id, text);
  console.log(`[Webhook] Intent detected: ${intent}`);

  // Step 9: Translate to tenant default language if different
  const tenantLang = tenant.defaultLanguage;
  if (detectedLang !== tenantLang) {
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

  // Step 10: Try to assign an agent
  if (!conversation.assignedAgentId) {
    const agentId = await findAvailableAgent(tenant.id);
    if (agentId) {
      await assignConversationToAgent(conversation.id, agentId);
      console.log(`[Webhook] Assigned agent ${agentId}`);
    } else {
      // Step 11: Enqueue if no agent available
      await enqueueConversation(tenant.id, conversation.id);
      console.log(`[Webhook] Enqueued conversation ${conversation.id}`);
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

    if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(challenge);
    }

    return reply.status(403).send({ detail: "Verification failed" });
  });

  // WhatsApp incoming message
  app.post("/whatsapp", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Step 1: Parse incoming message
    const incoming = parseIncomingMessage(body);
    if (!incoming) {
      return reply.send({ status: "ignored" });
    }

    // Step 2: Resolve tenant by phone number ID
    const tenant = await resolveTenant(incoming.phoneNumberId);
    if (!tenant) {
      console.warn(`No tenant for phoneNumberId: ${incoming.phoneNumberId}`);
      return reply.send({ status: "no_tenant" });
    }

    // Step 3: Find or create customer
    const customer = await findOrCreateCustomer(
      tenant.id,
      incoming.from,
      incoming.displayName,
    );

    // Step 4: Find or create conversation
    const conversation = await findOrCreateConversation(
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
    });

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
    const conversation = await findOrCreateConversation(
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
    });

    return reply.send({ status: "processed" });
  });
}
