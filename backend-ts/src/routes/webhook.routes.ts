import type { FastifyInstance } from "fastify";
import type { Conversation } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { config } from "../config.js";
import {
  parseIncomingMessage,
  resolveTenant,
  sendWhatsappMessage,
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
import { fetchEvolutionProfilePicture, fetchEvolutionMediaBase64 } from "../services/whatsapp/evolution.provider.js";
import { detectLanguage } from "../services/language.service.js";
import { detectIntent } from "../services/intent.service.js";
import { translateText } from "../services/translation.service.js";
import { enqueueConversation } from "../services/queue.service.js";
import {
  findAvailableAgent,
  assignConversationToAgent,
} from "../services/assignment.service.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { SocketService } from "../services/socket.service.js";
import { tryAutoResponse } from "../services/auto-response.service.js";
import { uploadMediaToStorage } from "../lib/storage.js";
import { notifyAgentsNewMessage } from "../services/push.service.js";
import { redisClient, isRedisAvailable } from "../lib/redis-client.js";

/** Strip codec/parameter info from MIME types like "audio/ogg; codecs=opus" → "audio/ogg" */
function normalizeMime(mime: string): string {
  return mime.split(";")[0].trim();
}

/**
 * Dedup check for incoming messages — two-tier:
 *
 * Tier 1 (Redis, preferred): SET NX EX 60 → atomic, survives process restarts.
 *   Returns true if the key already existed (= duplicate).
 *
 * Tier 2 (in-memory Map, fallback when Redis is unavailable): same TTL logic.
 *   Works because Node.js is single-threaded — the check is atomic within
 *   one process. Lost on restart, but that's acceptable without Redis.
 */
const _dedupFallback = new Map<string, number>();
const DEDUP_TTL_MS = 60_000;
const DEDUP_TTL_SEC = 60;

async function checkAndMarkDuplicate(conversationId: string, externalId: string): Promise<boolean> {
  const dedupKey = `${conversationId}:${externalId}`;
  
  if (isRedisAvailable()) {
    // SET key "1" EX 60 NX → returns "OK" if set (new), null if already existed (duplicate)
    const result = await redisClient.set(`dedup:msg:${dedupKey}`, "1", "EX", DEDUP_TTL_SEC, "NX");
    return result === null; // null = already existed = duplicate
  }

  // In-memory fallback
  const now = Date.now();
  for (const [key, ts] of _dedupFallback) {
    if (now - ts > DEDUP_TTL_MS) _dedupFallback.delete(key);
  }
  if (_dedupFallback.has(dedupKey)) return true;
  _dedupFallback.set(dedupKey, now);
  return false;
}

// Shared pipeline (steps 5-11) used by both WhatsApp and Instagram
async function processIncomingMessage(params: {
  tenant: { id: string; defaultLanguage: string };
  conversation: Conversation;
  text: string;
  externalMessageId: string;
  isNewConversation: boolean;
  attachments?: MessageAttachmentInput[];
  /** Original WhatsApp message key – used for active media download */
  whatsappMessageKey?: Record<string, unknown>;
  /** Full WhatsApp message data object – used by Evolution API for media decryption */
  whatsappMessageData?: Record<string, unknown>;
}): Promise<void> {
  const { tenant, conversation, text, externalMessageId, isNewConversation, attachments = [], whatsappMessageKey, whatsappMessageData } = params;

  // Step 5: Detect language
  const detectedLang = text.startsWith("[") && text.endsWith("]") ? null : detectLanguage(text);

  // Step 6: Update conversation language if not set
  if (!conversation.detectedLanguage) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { detectedLanguage: detectedLang ?? tenant.defaultLanguage },
    });
  }

  // Step 7: Save message — three-layer dedup strategy:
  //   Layer 1: Redis SET NX (atomic, survives restarts) or in-memory Map fallback
  //   Layer 2: DB findFirst (handles cases where Redis TTL expired between events)
  //   Layer 3: P2002 unique-violation catch (last resort for concurrent inserts)
  if (externalMessageId && await checkAndMarkDuplicate(conversation.id, externalMessageId)) {
    logger.info(`[Webhook] Duplicate message skipped (dedup): conv=${conversation.id} ext=${externalMessageId}`);
    return;
  }
  
  if (externalMessageId) {
    const existing = await prisma.message.findFirst({ 
      where: { 
        conversationId: conversation.id, 
        externalId: externalMessageId 
      } 
    });
    if (existing) {
      logger.info(`[Webhook] Duplicate message skipped: conv=${conversation.id} ext=${externalMessageId}`);
      return;
    }
  }
  let message: Awaited<ReturnType<typeof saveMessage>>;
  try {
    message = await saveMessage({
      conversationId: conversation.id,
      senderType: "customer",
      text,
      detectedLanguage: detectedLang ?? undefined,
      externalId: externalMessageId,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.info(`[Webhook] Duplicate message skipped (race condition P2002): conv=${conversation.id} ext=${externalMessageId}`);
      return;
    }
    throw err;
  }

  logger.info(`[Webhook] processIncomingMessage: attachments received=${attachments.length}, types=${attachments.map(a => a.type).join(',')}`);
  const savedAttachments = [];
  for (const attachment of attachments) {
    let sourceUrl = attachment.sourceUrl;
    
    // If no sourceUrl but we have the WhatsApp message key, fetch media actively
    if (!sourceUrl && whatsappMessageKey) {
      logger.info(`[Webhook] Attachment has no sourceUrl, fetching from Evolution API...`);
      const mediaResult = await fetchEvolutionMediaBase64(tenant.id, whatsappMessageKey, whatsappMessageData);
      if (mediaResult) {
        const uploadedUrl = await uploadMediaToStorage(mediaResult.base64, normalizeMime(mediaResult.mimeType), attachment.fileName);
        if (uploadedUrl) {
          sourceUrl = uploadedUrl;
        } else {
          sourceUrl = `data:${normalizeMime(mediaResult.mimeType)};base64,${mediaResult.base64}`;
        }
        logger.info(`[Webhook] Fetched media successfully: mimeType=${mediaResult.mimeType}, base64Len=${mediaResult.base64.length}`);
      } else {
        logger.error(`[Webhook] Failed to fetch media from Evolution API`);
      }
    } else if (sourceUrl && sourceUrl.startsWith('data:')) {
      // If the webhook payload already came with base64, also upload it to storage
      const match = sourceUrl.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        const mimeType = match[1];
        const base64 = match[2];
        const uploadedUrl = await uploadMediaToStorage(base64, mimeType, attachment.fileName);
        if (uploadedUrl) {
          sourceUrl = uploadedUrl;
        }
      }
    } else if (sourceUrl && sourceUrl.startsWith('http')) {
      // WhatsApp CDN serves ENCRYPTED bytes — must use Evolution API first to get decrypted media.
      // Only fall back to direct CDN download if Evolution API is unavailable.
      let fetchedViaEvolution = false;
      if (whatsappMessageKey) {
        logger.info(`[Webhook] Fetching media via Evolution API (decrypted)...`);
        try {
          const mediaResult = await fetchEvolutionMediaBase64(tenant.id, whatsappMessageKey, whatsappMessageData);
          if (mediaResult) {
            const uploadedUrl = await uploadMediaToStorage(mediaResult.base64, normalizeMime(mediaResult.mimeType), attachment.fileName);
            sourceUrl = uploadedUrl || `data:${mediaResult.mimeType};base64,${mediaResult.base64}`;
            fetchedViaEvolution = true;
            logger.info(`[Webhook] Evolution API media fetched: mimeType=${mediaResult.mimeType}, base64Len=${mediaResult.base64.length}`);
          } else {
            logger.warn(`[Webhook] Evolution API returned null, falling back to direct CDN download...`);
          }
        } catch (err) {
          logger.error({ err }, '[Webhook] Evolution API fetch error, falling back to CDN');
        }
      }

      // Fallback: direct CDN download (encrypted bytes — last resort only)
      if (!fetchedViaEvolution && sourceUrl && sourceUrl.startsWith('http')) {
        logger.info(`[Webhook] Attempting direct CDN download as last resort...`);
        try {
          const mediaResponse = await fetch(sourceUrl);
          if (mediaResponse.ok) {
            const arrayBuffer = await mediaResponse.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            const cdnMime = mediaResponse.headers.get('content-type')?.split(';')[0].trim() || '';
            const typeFallback = attachment.type === 'image' ? 'image/jpeg'
              : attachment.type === 'video' ? 'video/mp4'
              : attachment.type === 'audio' ? 'audio/mpeg'
              : 'application/octet-stream';
            const contentType = (attachment.mimeType && attachment.mimeType !== 'application/octet-stream')
              ? attachment.mimeType
              : (cdnMime && cdnMime !== 'application/octet-stream')
                ? cdnMime
                : typeFallback;
            const uploadedUrl = await uploadMediaToStorage(base64, contentType, attachment.fileName);
            if (uploadedUrl) {
              sourceUrl = uploadedUrl;
            } else {
              sourceUrl = `data:${contentType};base64,${base64}`;
            }
            logger.info(`[Webhook] CDN fallback stored: mimeType=${contentType}, len=${base64.length}`);
          } else {
            logger.warn(`[Webhook] CDN download failed (${mediaResponse.status}), keeping original URL`);
          }
        } catch (err) {
          logger.error({ err }, '[Webhook] CDN fallback download error');
        }
      }
    }
    
    const sourceUrlLen = sourceUrl?.length ?? 0;
    logger.info(`[Webhook] Saving attachment: type=${attachment.type}, hasSourceUrl=${!!sourceUrl}, sourceUrlLen=${sourceUrlLen}`);
    
    try {
      const saved = await saveAttachment({
        messageId: message.id,
        type: attachment.type,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        fileSizeBytes: attachment.fileSizeBytes,
        sourceUrl: sourceUrl,
        providerMediaId: attachment.providerMediaId,
      });
      logger.info(`[Webhook] Attachment saved successfully: id=${saved.id}`);
      savedAttachments.push(saved);
    } catch (err) {
      logger.error({ err }, `[Webhook] FAILED to save attachment: type=${attachment.type}`);
    }
  }

  // Push notification to agents (fire-and-forget — never blocks the webhook response)
  // customerName is resolved lazily inside notifyAgentsNewMessage
  notifyAgentsNewMessage(tenant.id, {
    conversationId: conversation.id,
    customerName: null,
    messagePreview: text || "[mídia]",
  });

  // Emit real-time event for the new message
  SocketService.emitToConversation(conversation.id, "message.new", {
    id: message.id,
    conversation_id: message.conversationId,
    sender_type: message.senderType,
    original_text: message.originalText,
    detected_language: message.detectedLanguage,
    created_at: message.createdAt,
    attachments: savedAttachments.map((saved) => {
      let finalSourceUrl: string | null = null;
      if (saved.sourceUrl || saved.providerMediaId) {
        // Always use the proxy URL – never send data URIs over the socket
        finalSourceUrl = `/api/v1/conversations/${conversation.id}/messages/${message.id}/attachments/${saved.id}`;
      }

      return {
        id: saved.id,
        type: saved.type,
        mime_type: saved.mimeType ?? null,
        file_name: saved.fileName ?? null,
        file_size_bytes: saved.fileSizeBytes ?? null,
        source_url: finalSourceUrl,
        provider_media_id: saved.providerMediaId ?? null,
      };
    }),
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
  logger.info(`[Webhook] Intent detected: ${intent}`);

  const customer = await prisma.customer.findUnique({ where: { id: conversation.customerId } });
  
  // ---> Roteamento Inteligente (Primeira Qualificação)
  if (isNewConversation && customer?.role === "lead") {
    const welcomeMsg = "Olá! Sou a assistente virtual. Como posso te ajudar hoje?";
    logger.info(`[Webhook] Enviando mensagem de boas-vindas para o Lead ${customer.id}`);
    
    // Fire-and-forget sending welcome message
    void (async () => {
      try {
        await sendWhatsappMessage(tenant.id, customer.phone, welcomeMsg);
        await saveMessage({
          conversationId: conversation.id,
          senderType: "agent",
          text: welcomeMsg,
        });
      } catch (err) {
        logger.error({ err }, "[Webhook] Erro ao enviar boas-vindas");
      }
    })();
  } else if (!isNewConversation && customer?.role === "lead") {
    // Se não for novo, mas ainda é lead, vamos tentar classificar based on intent
    const isOwnerIntent = intent === "parceria";
    const isGuestIntent = intent === "pergunta" || intent === "agendamento" || intent === "vendas" || intent === "emergencia" || intent === "reclamação";
    
    if (isOwnerIntent || isGuestIntent) {
      const newRole = isOwnerIntent ? "owner" : "guest";
      logger.info(`[Webhook] Atualizando Lead ${customer.id} para Role ${newRole} baseado no intento ${intent}`);
      await prisma.customer.update({
        where: { id: customer.id },
        data: { role: newRole },
      });
      customer.role = newRole; // atualiza objeto local
    }
  }

  // ---> NEW LOGIC: Intelligent Review Funnel & Emergency Routing
  if (intent === "avaliacao" && customer?.phone) {
    const isNegative = text.match(/\b(1|2|3)\b/) || text.toLowerCase().includes("ruim") || text.toLowerCase().includes("péssim") || text.toLowerCase().includes("pessim");
    const isPositive = text.match(/\b(4|5)\b/) || text.toLowerCase().includes("bom") || text.toLowerCase().includes("ótimo") || text.toLowerCase().includes("otimo") || text.toLowerCase().includes("excelente");
    
    if (isNegative) {
      const apologyMsg = "Poxa, sinto muito que sua experiência não foi perfeita. Já acionei nosso gerente e ele entrará em contato em instantes para entender o que houve e como podemos melhorar.";
      await sendWhatsappMessage(tenant.id, customer.phone, apologyMsg);
      await saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        text: apologyMsg,
      });

      await prisma.conversation.update({ where: { id: conversation.id }, data: { priority: "urgent", status: "queued" } });
      SocketService.emitToTenant(tenant.id, "conversation.updated", { type: "queued", conversationId: conversation.id });
      notifyAgentsNewMessage(tenant.id, { conversationId: conversation.id, customerName: customer.name || customer.phone, messagePreview: "🚨 Avaliação Negativa: " + text });
      return; 
    } else if (isPositive) {
      const reviewLink = process.env.REVIEW_LINK || "https://airbnb.com/review";
      const reviewMsg = `Que maravilha! Você nos ajudaria muito clicando neste link e deixando essa mesma nota no nosso Airbnb/Google? ${reviewLink}`;
      await sendWhatsappMessage(tenant.id, customer.phone, reviewMsg);
      await saveMessage({
        conversationId: conversation.id,
        senderType: "agent",
        text: reviewMsg,
      });
      return; 
    }
  }

  if (intent === "emergencia") {
     await prisma.conversation.update({ where: { id: conversation.id }, data: { priority: "urgent", status: "queued" } });
     SocketService.emitToTenant(tenant.id, "conversation.updated", { type: "queued", conversationId: conversation.id });
     notifyAgentsNewMessage(tenant.id, { conversationId: conversation.id, customerName: customer?.name || customer?.phone || "cliente", messagePreview: "🚨 EMERGÊNCIA: " + text });

     // Enhanced: auto-reply + emergency phone alert when in auto-response mode
     const { resolveAutoResponseEnabled } = await import("../services/business-hours.service.js");
     const autoSettings = await prisma.tenantSettings.findUnique({ where: { tenantId: tenant.id } });
     const isAutoMode = resolveAutoResponseEnabled({
       autoResponseMode: autoSettings?.autoResponseMode || "manual",
       enableAutoResponse: autoSettings?.enableAutoResponse ?? false,
       timezone: autoSettings?.timezone || "America/Sao_Paulo",
       businessHoursStart: autoSettings?.businessHoursStart || "08:00",
       businessHoursEnd: autoSettings?.businessHoursEnd || "18:00",
       businessHoursDays: autoSettings?.businessHoursDays || "[1,2,3,4,5]",
     });

     if (isAutoMode && customer?.phone) {
       const emergencyMsg = "🚨 Entendi que se trata de uma emergência. Estou acionando o gerente de plantão imediatamente. Aguarde, por favor.";
       void (async () => {
         try {
           await sendWhatsappMessage(tenant.id, customer.phone, emergencyMsg);
           await saveMessage({ conversationId: conversation.id, senderType: "system", text: emergencyMsg });
         } catch (err) { logger.error({ err }, "[Webhook] Erro ao enviar resposta de emergência"); }
       })();
     }

     // Send alert to configured emergency phone number
     const emergencyPhone = autoSettings?.emergencyPhoneNumber;
     if (emergencyPhone) {
       void sendWhatsappMessage(tenant.id, emergencyPhone, `🚨 EMERGÊNCIA! Cliente ${customer?.name || customer?.phone || "desconhecido"} reportou:\n"${text}"\nAcesse o painel para responder.`).catch((err) => logger.error({ err }, "[Webhook] Erro ao enviar alerta de emergência"));
     } else if (process.env.MAINTENANCE_WHATSAPP_ID && customer?.phone) {
       await sendWhatsappMessage(tenant.id, process.env.MAINTENANCE_WHATSAPP_ID, `🚨 Alerta de Manutenção! Cliente ${customer.name || customer.phone} informou uma urgência:\n"${text}"\nAcesse o painel para responder.`);
     }
  }

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
      logger.info(`[Webhook] Auto-response handled conversation ${conversation.id}`);
      return;
    }
  } catch (err) {
    logger.warn({ err }, "[Webhook] Auto-response failed, falling through to agent");
  }

  // Step 10: Try to assign an agent
  if (!conversation.assignedAgentId) {
    const agentId = await findAvailableAgent(tenant.id);
    if (agentId) {
      await assignConversationToAgent(conversation.id, agentId);
      logger.info(`[Webhook] Assigned agent ${agentId}`);
      SocketService.emitToTenant(tenant.id, "conversation.updated", {
        type: "assigned",
        conversationId: conversation.id,
        agentId,
      });
    } else {
      // Step 11: Enqueue if no agent available
      await enqueueConversation(tenant.id, conversation.id);
      logger.info(`[Webhook] Enqueued conversation ${conversation.id}`);
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
    logger.info(`[WhatsApp WEBHOOK] bodyKeys=${Object.keys(body).join(',')}, event=${body.event ?? 'N/A'}`);

    // Step 1: Parse incoming message
    const parsed = parseIncomingMessage(body);
    if (!parsed || parsed.messages.length === 0) {
      return reply.send({ status: "ignored" });
    }

    // Respond imediatamente para evitar timeout do webhook
    void reply.send({ status: "accepted" });

    // Processar em background (não bloqueia o webhook)
    void (async () => {
      for (const incoming of parsed.messages) {
        try {
          const tenant = await resolveTenant(incoming.providerId, parsed.providerName);
          if (!tenant) {
            logger.warn(`No tenant for providerId: ${incoming.providerId}`);
            continue;
          }
          const customer = await findOrCreateCustomer(tenant.id, incoming.from, incoming.displayName);
          const { conversation, isNew } = await findOrCreateConversation(tenant.id, customer.id, "whatsapp");
          await processIncomingMessage({
            tenant, conversation, text: incoming.text,
            externalMessageId: incoming.messageId, isNewConversation: isNew,
            attachments: incoming.attachments,
            whatsappMessageKey: incoming.whatsappMessageKey,
            whatsappMessageData: incoming.whatsappMessageData,
          });
        } catch (err) {
          request.server.log.error(err, "[WhatsApp Webhook] Background processing error");
        }
      }
    })();
  });

  // ─── Evolution API Webhook ─────────────────────────────
  app.post("/evolution", async (request, reply) => {
    // Webhook signature validation.
    // When EVOLUTION_WEBHOOK_SECRET is set, the Evolution API instance must be
    // configured to send that same value in the "apikey" header. Any request
    // that doesn't carry the correct key is rejected immediately — preventing
    // spoofed webhook events from external sources.
    // Security: Evolution API does NOT send an apikey header in outgoing webhooks.
    // Instead, we rely on two complementary layers:
    //   1. Railway internal network isolation (100.64.0.0/10) — only services
    //      within the same Railway project can call each other via internal IPs.
    //   2. Optional EVOLUTION_WEBHOOK_SECRET checked against query ?secret= param
    //      (useful if the webhook URL is publicly exposed and you want extra protection).
    //
    // If the request comes from a Railway internal IP, it is trusted unconditionally.
    // External requests require the secret query param to match EVOLUTION_WEBHOOK_SECRET.
    const srcIp = request.ip ?? "";
    const isRailwayInternal =
      srcIp.startsWith("100.64.") ||   // RFC 6598 — Railway Wireguard mesh
      srcIp.startsWith("10.") ||        // RFC 1918
      srcIp.startsWith("172.16.") ||
      srcIp.startsWith("172.17.") ||
      srcIp.startsWith("172.18.") ||
      srcIp.startsWith("172.19.") ||
      srcIp.startsWith("172.2") ||      // 172.20–172.31
      srcIp.startsWith("172.3") ||
      srcIp.startsWith("192.168.") ||
      srcIp === "127.0.0.1" ||
      srcIp === "::1";

    if (!isRailwayInternal && config.EVOLUTION_WEBHOOK_SECRET) {
      const secretParam = (request.query as Record<string, string>)["secret"] ?? "";
      if (secretParam !== config.EVOLUTION_WEBHOOK_SECRET) {
        logger.warn(`[Evolution WEBHOOK] Rejected external request (ip=${srcIp}): missing or wrong secret param`);
        return reply.status(401).send({ detail: "Unauthorized" });
      }
    }

    if (isRailwayInternal) {
      logger.debug(`[Evolution WEBHOOK] Trusted internal request from ip=${srcIp}`);
    }

    const body = request.body as Record<string, unknown>;

    // === TOP-LEVEL DEBUG: Log EVERY webhook event ===
    logger.info(`[Evolution WEBHOOK] event="${body.event}", instance="${body.instance}", bodyKeys=${Object.keys(body).join(',')}`);
    if (body.data && typeof body.data === 'object') {
      const data = body.data as Record<string, unknown>;
      logger.info(`[Evolution WEBHOOK] data.keys=${Object.keys(data).join(',')}`);
    }
    // === END TOP-LEVEL DEBUG ===

    // Handle message status updates (delivery/read receipts)
    if (body.event === "messages.update") {
      const data = body.data as Record<string, unknown> | undefined;
      if (data) {
        const key = data.key as Record<string, unknown> | undefined;
        const update = data.update as Record<string, unknown> | undefined;
        const externalId = key?.id as string | undefined;
        const statusCode = update?.status as number | undefined;
        const instanceName = body.instance as string | undefined;

        if (externalId && statusCode !== undefined && instanceName) {
          // Evolution status codes: 2 = delivered, 3 = read, 4 = played
          let newStatus: string | null = null;
          if (statusCode === 2) newStatus = "delivered";
          else if (statusCode >= 3) newStatus = "read";

          if (newStatus) {
            const message = await prisma.message.findFirst({
              where: { externalId },
              select: { id: true, conversationId: true, status: true },
            });

            if (message) {
              // Only upgrade status (sent -> delivered -> read), never downgrade
              const statusOrder = ["sent", "delivered", "read"];
              if (statusOrder.indexOf(newStatus) > statusOrder.indexOf(message.status)) {
                await prisma.message.update({
                  where: { id: message.id },
                  data: { status: newStatus },
                });

                SocketService.emitToConversation(message.conversationId, "message.status", {
                  messageId: message.id,
                  status: newStatus,
                });
              }
            }
          }
        }
      }
      return reply.send({ status: "processed" });
    }

    // Step 1: Parse incoming message (factory auto-detects Evolution)
    const parsed = parseIncomingMessage(body);
    if (!parsed || parsed.messages.length === 0) {
      return reply.send({ status: "ignored" });
    }

    // Responde imediatamente à Evolution para evitar timeout do webhook
    void reply.send({ status: "accepted" });

    // Processar em background (Evolution API + OpenAI podem demorar)
    void (async () => {
      for (const incoming of parsed.messages) {
        try {
          const tenant = await resolveTenant(incoming.providerId, parsed.providerName);
          if (!tenant) {
            logger.warn(`[Evolution Webhook] No tenant for instance: ${incoming.providerId}`);
            continue;
          }

          let profilePicUrl: string | undefined;
          try {
            profilePicUrl = await fetchEvolutionProfilePicture(tenant.id, incoming.from);
          } catch {
            // Ignore – profile picture é opcional
          }

          const customer = await findOrCreateCustomer(tenant.id, incoming.from, incoming.displayName, profilePicUrl);
          const { conversation, isNew } = await findOrCreateConversation(tenant.id, customer.id, "whatsapp");
          await processIncomingMessage({
            tenant, conversation, text: incoming.text,
            externalMessageId: incoming.messageId, isNewConversation: isNew,
            attachments: incoming.attachments,
            whatsappMessageKey: incoming.whatsappMessageKey,
            whatsappMessageData: incoming.whatsappMessageData,
          });
        } catch (err) {
          request.server.log.error(err, "[Evolution Webhook] Background processing error");
        }
      }
    })();
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
      logger.warn(`No tenant for Instagram pageId: ${incoming.pageId}`);
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

    // Responde imediatamente ao Instagram
    void reply.send({ status: "accepted" });

    // Processar em background
    void processIncomingMessage({
      tenant, conversation,
      text: incoming.text,
      externalMessageId: incoming.messageId,
      isNewConversation: isNew,
      attachments: incoming.attachments,
    }).catch((err) => {
      request.server.log.error(err, "[Instagram Webhook] Background processing error");
    });
  });
}
