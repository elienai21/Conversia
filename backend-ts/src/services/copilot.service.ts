import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { getRecentMessages } from "./message.service.js";
import { logAiUsage } from "./usage-log.service.js";
import { SocketService } from "./socket.service.js";

/**
 * Validates actual image magic bytes to detect encrypted/corrupt data.
 *
 * WhatsApp CDN bytes are AES-encrypted. When the Evolution API fails to
 * decrypt them and we fall back to a direct CDN download, the raw bytes
 * stored in the data URI are NOT valid images — they look like random binary
 * data and OpenAI Vision will reject them with a 400 error even if the
 * declared MIME type is "image/jpeg".
 *
 * Supported magic byte signatures:
 *   JPEG  : FF D8 FF
 *   PNG   : 89 50 4E 47 0D 0A 1A 0A
 *   GIF   : 47 49 46 38 (GIF8)
 *   WebP  : 52 49 46 46 __ __ __ __ 57 45 42 50 (RIFF....WEBP)
 */
function hasValidImageMagicBytes(b64: string): boolean {
  try {
    // Decode only first 16 bytes (24 base64 chars) — enough for all signatures
    const buf = Buffer.from(b64.slice(0, 24), "base64");
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
    // WebP (RIFF....WEBP)
    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) return true;
    return false;
  } catch {
    return false;
  }
}

import { copilotQueue, isRedisAvailable, type CopilotJobData } from "../lib/queue.js";
import { type Result, ok, fail } from "../lib/result.js";
import { AppError } from "../lib/errors.js";

import { crmTools } from "./ai-tools.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";
import { generateEmbedding } from "./embedding.service.js";
import { logger } from "../lib/logger.js";

/**
 * Calls an OpenAI completion with automatic retry on 429 (rate limit).
 *
 * Strategy: exponential backoff — 3 s, 6 s, 12 s (max 2 retries).
 * Respects the `Retry-After` header when present.
 * Does NOT retry on 400 / 401 / 404 — those are permanent errors.
 */
async function openaiWithRetry(
  fn: () => Promise<OpenAI.Chat.Completions.ChatCompletion>,
  maxRetries = 2,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const e = err as Record<string, unknown>;
      const status = Number(e?.status ?? 0);
      // Only retry on 429; surface everything else immediately
      if (status !== 429 || attempt >= maxRetries) throw err;

      // Respect Retry-After header if the SDK exposes it, otherwise use backoff
      const retryAfterHeader =
        (e?.headers as Record<string, string> | undefined)?.["retry-after"];
      const delaySec = retryAfterHeader
        ? Math.min(Number(retryAfterHeader), 30)
        : 3 * Math.pow(2, attempt); // 3 s → 6 s → 12 s

      logger.warn(`[Copilot] Rate limited (429) — retrying in ${delaySec}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delaySec * 1_000));
    }
  }
  throw lastErr;
}

// The public sync function just enqueues the request (Event-Driven AI)
export async function enqueueSuggestionJob(
  tenantId: string,
  message: { id: string; conversationId: string; originalText: string },
  agentId: string,
  agentLanguage: string,
): Promise<Result<{ jobId: string }>> {
  const jobData: CopilotJobData = { tenantId, message, agentId, agentLanguage };

  // If Redis is available, use the BullMQ queue (Event-Driven pattern)
  if (isRedisAvailable()) {
    try {
      const job = await copilotQueue.add("generate", jobData);
      logger.info(`[Copilot] Job ${job.id} enqueued via Redis`);
      return ok({ jobId: job.id! });
    } catch (error) {
      logger.warn({ err: error }, "[Copilot] Redis enqueue failed, falling back to sync");
    }
  }

  // Fallback: execute directly (fire-and-forget) when Redis is unavailable
  const fallbackJobId = `sync-${Date.now()}`;
  logger.info(`[Copilot] Redis unavailable — executing job ${fallbackJobId} synchronously`);

  // Fire-and-forget: don't await, let it run in background
  generateSuggestionWorker(jobData).then(
    () => logger.info(`[Copilot] Sync job ${fallbackJobId} completed`),
    (err) => logger.error({ err }, `[Copilot] Sync job ${fallbackJobId} failed`),
  );

  return ok({ jobId: fallbackJobId });
}

// The background WebWorker process actually runs the AI prompt
export async function generateSuggestionWorker(
  jobData: CopilotJobData
): Promise<Result<any>> {
  const { tenantId, message, agentId, agentLanguage } = jobData;

  // 1. Get tenant-specific settings
  const tenantSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  // 2. Semantic Search (RAG) for KB Context
  let contextDocs: Array<{ title: string; content: string; category: string }> = [];
  const queryEmbedding = await generateEmbedding(tenantId, message.originalText);

  if (queryEmbedding && queryEmbedding.length > 0) {
    // Pinecone/pgvector cosine distance
    const embeddingString = `[${queryEmbedding.join(",")}]`;
    const results = await prisma.$queryRaw<
      Array<{ title: string; content: string; category: string }>
    >`
      SELECT title, content, category 
      FROM knowledge_base 
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true 
      ORDER BY embedding <=> ${embeddingString}::vector 
      LIMIT 5
    `;
    contextDocs = results;
  } else {
    // Fallback exactly as before if embedding fails
    contextDocs = await prisma.knowledgeBase.findMany({
      where: { tenantId, isActive: true },
      select: { title: true, content: true, category: true },
      take: 5,
    });
  }

  // 3. Build knowledge context
  const knowledgeContext = contextDocs.length > 0
    ? `\n\nHotel Knowledge Base:\n${contextDocs.map((kb) => `[${kb.category.toUpperCase()}] ${kb.title}:\n${kb.content}`).join("\n\n")}`
    : "";

  // 4. Resolve settings (tenant-specific → global fallback)
  const rawModel = tenantSettings?.openaiModel || config.OPENAI_MODEL || "gpt-4o-mini";
  // Normalize legacy/typo model names to a supported equivalent
  const model = rawModel === "gpt-4.1-mini" ? "gpt-4o-mini"
              : rawModel === "gpt-4.1"      ? "gpt-4o"
              : rawModel;
  const temperature = tenantSettings?.aiTemperature ?? 0.7;
  const maxTokens = tenantSettings?.aiMaxTokens ?? 200;
  const customSystemPrompt = tenantSettings?.aiSystemPrompt;

  // 5. Resolve API key (tenant-specific encrypted → global env)
  let apiKey = config.OPENAI_API_KEY;
  let keySource = "global_env";
  if (tenantSettings?.openaiApiKey) {
    try {
      apiKey = decrypt(tenantSettings.openaiApiKey);
      keySource = "tenant_settings";
    } catch (decryptErr) {
      logger.error({ err: decryptErr }, "[Copilot] Failed to decrypt tenant OpenAI API key — falling back to global env. Re-save the key in Settings → Integrations.");
      // Fallback to global key already set above
    }
  }
  logger.info(`[Copilot] Using API key source="${keySource}", model="${model}" for tenant ${tenantId}`);

  if (!apiKey) {
    logger.error("[Copilot] No OpenAI API key available. Aborting suggestion.");
    SocketService.emitToConversation(message.conversationId, "suggestion.ready", {
      messageId: message.id,
      suggestion: {
        id: `err-${Date.now()}`,
        suggestionText: "⚠️ Chave da OpenAI não configurada. Acesse Configurações → Integrações para salvar sua chave.",
        wasUsed: false,
      },
    });
    return fail(new AppError("OpenAI API key not configured", 400));
  }

  const openai = new OpenAI({ apiKey });

  // Vision is supported by gpt-4o, gpt-4-turbo, gpt-4-vision, and gpt-4.1 family
  const visionEnabled = /gpt-4o|gpt-4-turbo|gpt-4-vision|gpt-4\.1/.test(model);

  // 6. Get last 10 messages for context (with attachments)
  const recentMessages = await getRecentMessages(message.conversationId, 10);

  const conversationContext: OpenAI.ChatCompletionMessageParam[] = [];
  for (const m of recentMessages.reverse()) {
    const role = m.senderType === "customer" ? ("user" as const) : ("assistant" as const);
    const contentParts: OpenAI.ChatCompletionContentPart[] = [];

    // Base text (skip placeholder tags like [image])
    const baseText = m.originalText?.match(/^\[(image|video|audio|document)\]$/) ? "" : m.originalText;
    if (baseText) contentParts.push({ type: "text", text: baseText });

    // Process attachments for vision/audio
    for (const att of m.attachments ?? []) {
      if (!att.sourceUrl) continue;
      const dataMatch = att.sourceUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!dataMatch) continue;
      const [, mimeType, b64] = dataMatch;

      if (att.type === "image") {
        if (visionEnabled) {
          // OpenAI Vision only accepts: png, jpeg, gif, webp
          const supportedMimes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
          const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
          const mimeOk = supportedMimes.includes(normalizedMime);
          // Also validate actual bytes — encrypted CDN fallback data has a valid MIME
          // declaration but the bytes are AES-encrypted garbage that OpenAI rejects (400).
          const bytesOk = mimeOk && hasValidImageMagicBytes(b64);
          if (bytesOk) {
            contentParts.push({
              type: "image_url",
              image_url: { url: `data:${normalizedMime};base64,${b64}`, detail: "low" },
            });
          } else {
            const reason = !mimeOk ? `formato não suportado (${mimeType})` : "bytes inválidos/criptografados";
            logger.info(`[Copilot] Skipping image for Vision API — ${reason}`);
            contentParts.push({ type: "text", text: `[O cliente enviou uma imagem (${reason})]` });
          }
        } else {
          // Non-vision model: describe as text so the AI knows an image arrived
          contentParts.push({ type: "text", text: "[O cliente enviou uma imagem]" });
        }
      } else if (att.type === "audio") {
        try {
          const ext = mimeType.split("/")[1]?.split(";")[0] || "ogg";
          const audioFile = await toFile(Buffer.from(b64, "base64"), att.fileName || `audio.${ext}`, { type: mimeType });
          const transcription = await openai.audio.transcriptions.create({ file: audioFile, model: "whisper-1" });
          if (transcription.text) {
            contentParts.push({ type: "text", text: `[Áudio transcrito: "${transcription.text}"]` });
          }
        } catch (whisperErr) {
          logger.error({ err: whisperErr }, "[Copilot] Whisper transcription failed");
          contentParts.push({ type: "text", text: "[Áudio não transcrito]" });
        }
      }
    }

    if (contentParts.length === 0) contentParts.push({ type: "text", text: m.originalText || "" });

    // Assistant messages only support string content in OpenAI SDK
    const hasMedia = contentParts.some((p) => p.type === "image_url");
    if (role === "assistant" || !hasMedia) {
      const text = contentParts.filter((p) => p.type === "text").map((p) => (p as OpenAI.ChatCompletionContentPartText).text).join(" ");
      conversationContext.push({ role, content: text });
    } else {
      conversationContext.push({ role: "user", content: contentParts });
    }
  }

  // 7. Build system prompt
  const checkoutLinkInstruction = `
REGRA DE LINKS: Sempre que apresentar imóveis disponíveis (após search_available_listings), chame generate_checkout_link para cada imóvel e inclua o link gerado na resposta ao atendente no formato: 🔗 [Nome do Imóvel](URL) ou "Link de reserva: URL". Isso permite que o atendente envie o link diretamente ao cliente.`;

  let systemPrompt = customSystemPrompt
    ? `${customSystemPrompt}${knowledgeContext}${checkoutLinkInstruction}\n\nReply in ${agentLanguage}.`
    : `You are a helpful customer service agent assistant.
Your job is to provide the human agent with a professional and helpful suggested response based on the conversation history and the hotel knowledge base.${knowledgeContext}
IMPORTANT INTENT: Se o cliente quiser oferecer um imóvel para sua empresa administrar (Intenção de Parceria), a resposta sempre deve focar em agendar uma reunião comercial de apresentação, solicitando horário.
Use as ferramentas disponíveis para buscar CRM DATA (Disponibilidade, Preço, ou Reservas) automaticamente.${checkoutLinkInstruction}
Reply in ${agentLanguage}. Keep it concise, natural and friendly.`;

  // 8. AI Execution Loop (Function Calling)
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationContext,
  ];

  let suggestionText = "I'll be happy to help you.";
  let finalUsage = { prompt_tokens: 0, completion_tokens: 0 };

  try {
    // We allow up to 5 loop iterations to prevent infinite loops if tools misbehave
    for (let i = 0; i < 5; i++) {
      const response = await openaiWithRetry(() =>
        openai.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          tools: crmTools,
          tool_choice: "auto",
        })
      );

      if (response.usage) {
        finalUsage.prompt_tokens += response.usage.prompt_tokens;
        finalUsage.completion_tokens += response.usage.completion_tokens;
      }

      const responseMessage = response.choices[0]?.message;
      if (!responseMessage) break;

      messages.push(responseMessage); // Important: always append the assistant's response

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Tool Call Execution Phase
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type !== "function") continue;
          
          let resultJson = "";
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const fnName = toolCall.function.name;

            if (fnName === "generate_checkout_link") {
              // Does NOT need the CRM adapter — just the tenant's Stays domain
              const staysDomain = tenantSettings?.staysnetDomain;
              if (!staysDomain) {
                resultJson = JSON.stringify({ error: "Stays.net domain não configurado para este tenant." });
              } else {
                // Stays.net checkout URL pattern (confirmed):
                // https://{domain}/customer/pt/booking?id={listingId}&from={from}&to={to}&persons={guests}
                const checkoutUrl =
                  `https://${staysDomain}/customer/pt/booking` +
                  `?id=${encodeURIComponent(args.listingId)}` +
                  `&from=${encodeURIComponent(args.from)}` +
                  `&to=${encodeURIComponent(args.to)}` +
                  `&persons=${encodeURIComponent(args.guests)}`;
                resultJson = JSON.stringify({ checkoutUrl, listingId: args.listingId });
                logger.info(`[Copilot] Generated checkout link for listing ${args.listingId}: ${checkoutUrl}`);
              }
            } else {
              // All other tools require the CRM adapter
              const adapterResult = await CrmAdapterFactory.getAdapter(tenantId);

              if (!adapterResult.ok) {
                resultJson = JSON.stringify({ error: adapterResult.error.message });
              } else {
                const adapter = adapterResult.value;

                if (fnName === "search_available_listings") {
                  const res = await adapter.searchListings({ from: args.from, to: args.to, guests: args.guests });
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else if (fnName === "calculate_price") {
                  const res = await adapter.calculatePrice({ listingIds: args.listingIds, from: args.from, to: args.to, guests: args.guests });
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else if (fnName === "get_reservation_details") {
                  const res = await adapter.getReservation(args.reservationCode);
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else if (fnName === "fetch_checkin_details") {
                  const res = await adapter.getCheckinDetails(args.reservationCode);
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else if (fnName === "get_all_properties") {
                  const res = await adapter.getProperties();
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else if (fnName === "get_listing_details") {
                  const res = await adapter.getListing(args.listingId);
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else if (fnName === "get_house_rules") {
                  const res = await adapter.getHouseRules(args.listingId);
                  resultJson = JSON.stringify(res.ok ? res.value : { error: res.error.message });
                } else {
                  resultJson = JSON.stringify({ error: `Unknown tool: ${fnName}` });
                }
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            resultJson = JSON.stringify({ error: `Execution error: ${msg}` });
          }

          // Return result to the LLM
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: resultJson,
          });
        }
        // Continue the loop: LLM reads the tool messages and decides the next action
      } else {
        // No more tool calls, we have our final text
        suggestionText = responseMessage.content?.trim() || suggestionText;
        break; 
      }
    }
  } catch (openaiErr: unknown) {
    // Extract a useful error message from the OpenAI SDK error
    let openaiErrMsg = "Erro desconhecido";
    let httpStatus = 0;
    if (openaiErr && typeof openaiErr === "object") {
      const e = openaiErr as Record<string, unknown>;
      // OpenAI SDK wraps errors with .status / .error / .message
      openaiErrMsg = String(e.message ?? e.error ?? e.status ?? "unknown");
      httpStatus = Number(e.status ?? 0);
    }
    logger.error(
      { err: openaiErr, model, keySource, tenantId, httpStatus, openaiErrMsg },
      `[Copilot] OpenAI API error (status=${httpStatus}): ${openaiErrMsg}`
    );

    // Build a user-friendly but informative error message
    let userMsg = `⚠️ Erro OpenAI (${model}): ${openaiErrMsg}`;
    if (httpStatus === 401) {
      userMsg = `⚠️ Chave da OpenAI inválida (fonte: ${keySource}). Verifique em Configurações → Integrações.`;
    } else if (httpStatus === 404) {
      userMsg = `⚠️ Modelo "${model}" não encontrado. Altere o modelo em Configurações → IA.`;
    } else if (httpStatus === 429) {
      // Distinguish between rate limit (temporary) and quota exhausted (needs top-up)
      const isQuotaExhausted = openaiErrMsg.toLowerCase().includes("quota") ||
                               openaiErrMsg.toLowerCase().includes("exceeded your current");
      if (isQuotaExhausted) {
        userMsg = `⚠️ Cota de uso da OpenAI esgotada. Acesse platform.openai.com → Billing para adicionar créditos.`;
      } else {
        userMsg = `⚠️ Limite de requisições/min da OpenAI atingido (já tentei 3x). Aguarde ~30s e tente novamente.`;
      }
    } else if (httpStatus === 400) {
      userMsg = `⚠️ Requisição inválida para OpenAI: ${openaiErrMsg}`;
    }

    // Don't persist error text — emit socket event and bail out.
    // This lets the next job retry cleanly (no stale "error" suggestion in DB).
    SocketService.emitToConversation(message.conversationId, "suggestion.ready", {
      messageId: message.id,
      suggestion: {
        id: `err-${Date.now()}`,
        suggestionText: userMsg,
        wasUsed: false,
      },
    });
    return fail(new AppError(`OpenAI error: ${openaiErrMsg}`, 500));
  }

  // 9. Log final cumulative token usage
  if (finalUsage.prompt_tokens > 0) {
    await logAiUsage({
      tenantId,
      service: "copilot_suggestion",
      model,
      inputTokens: finalUsage.prompt_tokens,
      outputTokens: finalUsage.completion_tokens,
    });
  }

  // 10. Save the final suggestion to database (upsert guards against rare duplicate job race)
  try {
    const suggestion = await prisma.aISuggestion.upsert({
      where: { messageId: message.id },
      create: {
        messageId: message.id,
        agentId,
        suggestionText,
        suggestionLanguage: agentLanguage,
      },
      update: {
        suggestionText,
        suggestionLanguage: agentLanguage,
      },
    });

    // Fire Real-Time Event to the Frontend through WebSockets
    SocketService.emitToConversation(message.conversationId, "suggestion.ready", {
      messageId: message.id,
      suggestion: {
        id: suggestion.id,
        suggestionText: suggestion.suggestionText,
        wasUsed: suggestion.wasUsed,
      },
    });

    return ok(suggestion);
  } catch (dbError) {
    logger.error({ err: dbError }, "[Copilot] DB Persistence Error");
    // Even if DB fails, we emit the event so the UI stops loading and shows the error text we have
    SocketService.emitToConversation(message.conversationId, "suggestion.ready", {
      messageId: message.id,
      suggestion: {
        id: `err-${Date.now()}`,
        suggestionText,
        wasUsed: false,
      },
    });
    return ok({ id: "error", suggestionText } as any);
  }
}
