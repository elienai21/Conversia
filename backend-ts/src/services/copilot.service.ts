import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { getRecentMessages } from "./message.service.js";
import { logAiUsage } from "./usage-log.service.js";
import { SocketService } from "./socket.service.js";

import { copilotQueue, isRedisAvailable, type CopilotJobData } from "../lib/queue.js";
import { type Result, ok, fail } from "../lib/result.js";
import { AppError } from "../lib/errors.js";

import { crmTools } from "./ai-tools.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";
import { generateEmbedding } from "./embedding.service.js";
import { logger } from "../lib/logger.js";

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
      logger.warn("[Copilot] Redis enqueue failed, falling back to sync:", error);
    }
  }

  // Fallback: execute directly (fire-and-forget) when Redis is unavailable
  const fallbackJobId = `sync-${Date.now()}`;
  logger.info(`[Copilot] Redis unavailable — executing job ${fallbackJobId} synchronously`);

  // Fire-and-forget: don't await, let it run in background
  generateSuggestionWorker(jobData).then(
    () => logger.info(`[Copilot] Sync job ${fallbackJobId} completed`),
    (err) => logger.error(`[Copilot] Sync job ${fallbackJobId} failed:`, err),
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
  const model = tenantSettings?.openaiModel || config.OPENAI_MODEL;
  const temperature = tenantSettings?.aiTemperature ?? 0.7;
  const maxTokens = tenantSettings?.aiMaxTokens ?? 200;
  const customSystemPrompt = tenantSettings?.aiSystemPrompt;

  // 5. Resolve API key (tenant-specific encrypted → global env)
  let apiKey = config.OPENAI_API_KEY;
  if (tenantSettings?.openaiApiKey) {
    try {
      apiKey = decrypt(tenantSettings.openaiApiKey);
    } catch (decryptErr) {
      logger.error({ err: decryptErr }, "[Copilot] Failed to decrypt OpenAI API key — falling back to global env key. Please re-save the key in Settings.");
      // Fallback to global key already set above
    }
  }

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
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${b64}`, detail: "low" },
          });
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
  let systemPrompt = customSystemPrompt
    ? `${customSystemPrompt}${knowledgeContext}\n\nReply in ${agentLanguage}.`
    : `You are a helpful customer service agent assistant.
Your job is to provide the human agent with a professional and helpful suggested response based on the conversation history and the hotel knowledge base.${knowledgeContext}
IMPORTANT INTENT: Se o cliente quiser oferecer um imóvel para sua empresa administrar (Intenção de Parceria), a resposta sempre deve focar em agendar uma reunião comercial de apresentação, solicitando horário.
Use as ferramentas disponíveis para buscar CRM DATA (Disponibilidade, Preço, ou Reservas) automaticamente.
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
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        tools: crmTools,
        tool_choice: "auto",
      });

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
            const adapterResult = await CrmAdapterFactory.getAdapter(tenantId);
            
            if (!adapterResult.ok) {
              resultJson = JSON.stringify({ error: adapterResult.error.message });
            } else {
              const adapter = adapterResult.value;
              const fnName = toolCall.function.name;

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
  } catch (openaiErr) {
    logger.error("OpenAI Execution Error in Copilot:", openaiErr);
    // Silent fail over to default generic text if OpenAI strictly crashes at networking level
    suggestionText = "A error occurred communicating with AI. Please check settings.";
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

  // 10. Save the final suggestion to database
  try {
    const suggestion = await prisma.aISuggestion.create({
      data: {
        messageId: message.id,
        agentId,
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
    logger.error(`[Copilot] DB Persistence Error:`, dbError);
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
