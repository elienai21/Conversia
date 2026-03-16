import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  parseIncomingMessage,
  resolveTenant,
  sendWhatsappMessage,
} from "../services/whatsapp.service.js";
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

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
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

  // WhatsApp incoming message — 11-step pipeline
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

    // Step 5: Detect language
    const detectedLang = detectLanguage(incoming.text);

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
      text: incoming.text,
      detectedLanguage: detectedLang,
      externalId: incoming.messageId,
    });

    // Step 8: Detect intent
    const intent = await detectIntent(tenant.id, incoming.text);
    console.log(`[Webhook] Intent detected: ${intent}`);

    // Step 9: Translate to tenant default language if different
    const tenantLang = tenant.defaultLanguage;
    if (detectedLang !== tenantLang) {
      const { translatedText, provider } = await translateText(
        tenant.id,
        incoming.text,
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

    return reply.send({ status: "processed" });
  });
}
