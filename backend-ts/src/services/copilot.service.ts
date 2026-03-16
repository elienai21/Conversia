import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { getRecentMessages } from "./message.service.js";
import { logAiUsage } from "./usage-log.service.js";
import { SocketService } from "./socket.service.js";

import { copilotQueue, type CopilotJobData } from "../lib/queue.js";
import { type Result, ok, fail } from "../lib/result.js";
import { AppError } from "../lib/errors.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

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
  // Get last 10 messages for context
  const recentMessages = await getRecentMessages(message.conversationId, 10);

  const conversationContext = recentMessages
    .reverse()
    .map((m) => ({
      role: m.senderType === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.originalText,
    }));

  const systemPrompt = `You are a helpful hotel customer service agent assistant.
Based on the conversation history, suggest a professional and helpful response.
Reply in ${agentLanguage}. Keep it concise and natural.`;

  const response = await openai.chat.completions.create({
    model: config.OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...conversationContext,
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  const usage = response.usage;
  if (usage) {
    await logAiUsage({
      tenantId,
      service: "copilot_suggestion",
      model: config.OPENAI_MODEL,
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
        wasUsed: suggestion.wasUsed
      }
    });

    return ok(suggestion);
  } catch (dbError) {
    return fail(new AppError("Failed to persist suggestion", 500));
  }
}
