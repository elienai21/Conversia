import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { getRecentMessages } from "./message.service.js";
import { logAiUsage } from "./usage-log.service.js";
import { SocketService } from "./socket.service.js";

import { copilotQueue, type CopilotJobData } from "../lib/queue.js";
import { type Result, ok, fail } from "../lib/result.js";
import { AppError } from "../lib/errors.js";

// The public sync function just enqueues the request (Event-Driven AI)
export async function enqueueSuggestionJob(
  tenantId: string,
  message: { id: string; conversationId: string; originalText: string },
  agentId: string,
  agentLanguage: string,
): Promise<Result<{ jobId: string }>> {
  try {
    const job = await copilotQueue.add("generate", {
      tenantId,
      message,
      agentId,
      agentLanguage,
    });
    return ok({ jobId: job.id! });
  } catch (error) {
    return fail(new AppError("Failed to queue AI job", 500));
  }
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

  // 2. Get active knowledge base entries
  const kbEntries = await prisma.knowledgeBase.findMany({
    where: { tenantId, isActive: true },
    select: { title: true, content: true, category: true },
  });

  // 3. Build knowledge context
  const knowledgeContext = kbEntries.length > 0
    ? `\n\nHotel Knowledge Base:\n${kbEntries.map((kb) => `[${kb.category.toUpperCase()}] ${kb.title}:\n${kb.content}`).join("\n\n")}`
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

  // 6b. Get past conversations for this customer (returning customer context)
  let pastConversationsContext = "";
  try {
    const currentConversation = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: { customerId: true },
    });
    if (currentConversation?.customerId) {
      const pastConversations = await prisma.conversation.findMany({
        where: {
          customerId: currentConversation.customerId,
          tenantId,
          status: "closed",
          id: { not: message.conversationId },
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
        include: {
          messages: {
            select: { senderType: true, originalText: true },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      });
      if (pastConversations.length > 0) {
        const summaries = pastConversations.map((pc) => {
          const snippets = pc.messages
            .reverse()
            .map((m) => `${m.senderType}: ${m.originalText.slice(0, 100)}`)
            .join(" | ");
          return `- ${pc.channel} conversation (${pc.updatedAt.toISOString().slice(0, 10)}): ${snippets}`;
        });
        pastConversationsContext = `\n\nPrevious interactions with this customer (${pastConversations.length} past conversations):\n${summaries.join("\n")}`;
      }
    }
  } catch {
    // Non-critical — continue without past context
  }

  // 7. Build system prompt
  const systemPrompt = customSystemPrompt
    ? `${customSystemPrompt}${knowledgeContext}${pastConversationsContext}\n\nReply in ${agentLanguage}.`
    : `You are a helpful hotel customer service agent assistant.
Based on the conversation history and the hotel knowledge base below, suggest a professional and helpful response.${knowledgeContext}${pastConversationsContext}
Reply in ${agentLanguage}. Keep it concise and natural.`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...conversationContext,
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const usage = response.usage;
  if (usage) {
    await logAiUsage({
      tenantId,
      service: "copilot_suggestion",
      model,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
    });
  }

  const suggestionText =
    response.choices[0]?.message?.content?.trim() ?? "I'll be happy to help you.";

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
    return fail(new AppError("Failed to persist suggestion", 500));
  }
}
