import OpenAI from "openai";
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
      console.log(`[Copilot] Job ${job.id} enqueued via Redis`);
      return ok({ jobId: job.id! });
    } catch (error) {
      console.warn("[Copilot] Redis enqueue failed, falling back to sync:", error);
    }
  }

  // Fallback: execute directly (fire-and-forget) when Redis is unavailable
  const fallbackJobId = `sync-${Date.now()}`;
  console.log(`[Copilot] Redis unavailable — executing job ${fallbackJobId} synchronously`);

  // Fire-and-forget: don't await, let it run in background
  generateSuggestionWorker(jobData).then(
    () => console.log(`[Copilot] Sync job ${fallbackJobId} completed`),
    (err) => console.error(`[Copilot] Sync job ${fallbackJobId} failed:`, err),
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
  const apiKey = tenantSettings?.openaiApiKey
    ? decrypt(tenantSettings.openaiApiKey)
    : config.OPENAI_API_KEY;
  const openai = new OpenAI({ apiKey });

  // 6. Get last 10 messages for context
  const recentMessages = await getRecentMessages(message.conversationId, 10);
  const conversationContext = recentMessages
    .reverse()
    .map((m) => ({
      role: m.senderType === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.originalText,
    }));

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
    console.error("OpenAI Execution Error in Copilot:", openaiErr);
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
    console.error(`[Copilot] DB Persistence Error:`, dbError);
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
