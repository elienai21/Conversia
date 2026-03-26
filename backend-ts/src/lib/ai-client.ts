/**
 * ai-client.ts — Unified AI abstraction with OpenAI → Gemini fallback.
 *
 * Strategy:
 *   1. Try OpenAI first (tenant key → global env key).
 *   2. If OpenAI fails with 401/404/502/503 or no key exists, try Gemini.
 *   3. Return a standardized ChatResult.
 *
 * This keeps all AI provider logic in one place so copilot, auto-response,
 * and polish-text services don't need to know about provider switching.
 */

import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { logger } from "./logger.js";
import { checkAiTokenLimit, logAiUsage } from "../services/ai-usage.service.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer" | "function";
  content?: string | any[] | null | undefined;
  tool_call_id?: string;
  name?: string; // used by function/tool roles
}

export interface ChatResult {
  text: string;
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
  messageParams?: OpenAI.ChatCompletionMessageParam; // To easily push to history
  tool_calls?: any[]; // Raw tool_calls from OpenAI
}

interface ChatOptions {
  tenantId?: string;            // ID do tenant para controle de cotas SaaS
  serviceName?: string;         // Nome do serviço (copilot, auto-response, polish)
  apiKey?: string;              // Tenant-specific OpenAI key (already decrypted)
  model?: string;               // e.g. "gpt-4o-mini"
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: OpenAI.ChatCompletionTool[];  // Only used by OpenAI (copilot tool-calling)
}

/** Normalize legacy model names */
function normalizeModel(raw: string): string {
  if (raw === "gpt-4.1-mini") return "gpt-4o-mini";
  if (raw === "gpt-4.1") return "gpt-4o";
  return raw;
}

/** Check if an error is retryable via Gemini fallback */
function shouldFallbackToGemini(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const e = err as Record<string, unknown>;
  const status = Number(e.status ?? 0);
  // 401 = bad key, 404 = model not found, 429 = quota exhausted, 5xx = server error
  return [401, 404, 429, 500, 502, 503].includes(status);
}

/**
 * Primary entry point for simple (non-tool-calling) chat completions.
 * Tries OpenAI first, falls back to Gemini.
 */
export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  let openaiKey = opts.apiKey || config.OPENAI_API_KEY;
  let geminiKey = config.GEMINI_API_KEY;
  let isManagedKey = false;

  if (opts.tenantId) {
    const quota = await checkAiTokenLimit(opts.tenantId);
    if (!quota.allowed) {
      if (quota.providerType === "managed") {
        throw new Error(`AI Limit Exceeded: Você utilizou ${quota.usage} de ${quota.limit} tokens inclusos no seu plano.`);
      } else {
        throw new Error(`Você precisa configurar a sua chave da OpenAI nas Configurações, ou atualizar seu plano para habilitar a IA Inclusa.`);
      }
    }
    isManagedKey = quota.providerType === "managed";
    if (quota.providerType === "custom" && quota.apiKey) {
      openaiKey = quota.apiKey;
    } else if (isManagedKey) {
      openaiKey = config.OPENAI_API_KEY; // Force global base key
    }
  }

  const model = normalizeModel(opts.model || config.OPENAI_MODEL || "gpt-4o-mini");

  let result: ChatResult;

  // 1. Try OpenAI
  if (openaiKey) {
    try {
      result = await callOpenAI({ ...opts, apiKey: openaiKey, model });
    } catch (err) {
      if (geminiKey && shouldFallbackToGemini(err)) {
        logger.warn({ err }, `[AI Client] OpenAI failed (model=${model}), falling back to Gemini`);
        result = await callGemini(opts, geminiKey);
      } else {
        throw err; // No Gemini key or non-retryable error
      }
    }
  } else if (geminiKey) {
    // 2. Fallback to Gemini
    result = await callGemini(opts, geminiKey);
  } else {
    throw new Error("No AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.");
  }

  // 3. Log Token Usage for managed plans Let it run detached.
  if (opts.tenantId && isManagedKey) {
    logAiUsage({
      tenantId: opts.tenantId,
      service: opts.serviceName || "chat_completion",
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }).catch(e => logger.error({ err: e }, "[AI Client] Failed to log AI usage"));
  }

  return result;
}

/** Call OpenAI Chat Completions API */
async function callOpenAI(opts: ChatOptions & { apiKey: string; model: string }): Promise<ChatResult> {
  const openai = new OpenAI({ apiKey: opts.apiKey });

  const response = await openai.chat.completions.create({
    model: opts.model,
    messages: opts.messages as OpenAI.ChatCompletionMessageParam[],
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 500,
    ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" as const } : {}),
  });

  const responseMessage = response.choices[0]?.message;
  const text = responseMessage?.content?.trim() || "";
  const usage = response.usage;

  return {
    text,
    provider: "openai",
    model: opts.model,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    messageParams: responseMessage as OpenAI.ChatCompletionMessageParam,
    tool_calls: responseMessage?.tool_calls,
  };
}

/** Call Gemini via @google/genai SDK */
async function callGemini(opts: ChatOptions, apiKey: string): Promise<ChatResult> {
  const geminiModel = config.GEMINI_MODEL || "gemini-2.0-flash";
  const ai = new GoogleGenAI({ apiKey });

  // Convert messages to Gemini format
  // Gemini uses systemInstruction and contents[]
  const systemParts = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content))
    .join("\n\n");

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const msg of opts.messages) {
    if (msg.role === "system") continue;
    if (!msg.content) continue; // skip null
    
    let textToPush = "";
    if (typeof msg.content === "string") {
      textToPush = msg.content;
    } else if (Array.isArray(msg.content)) {
      textToPush = msg.content.map(p => p.text || (p.image_url ? "[Imagem omitida]" : "")).join(" ");
    }

    contents.push({
      role: (msg.role === "assistant" || msg.role === "model" as any) ? "model" : "user",
      parts: [{ text: textToPush }],
    });
  }

  // Ensure conversation starts with user role (Gemini requirement)
  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "..." }] });
  }

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents,
    config: {
      systemInstruction: systemParts || undefined,
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 500,
    },
  });

  const text = response.text?.trim() || "";
  const usage = response.usageMetadata;

  logger.info(`[AI Client] Gemini response (model=${geminiModel}): ${text.substring(0, 80)}...`);

  return {
    text,
    provider: "gemini",
    model: geminiModel,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}
