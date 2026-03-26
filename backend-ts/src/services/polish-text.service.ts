import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { logAiUsage } from "./usage-log.service.js";
import { logger } from "../lib/logger.js";

/**
 * Takes raw text from the operator and returns a polished version
 * with grammar corrections and improved professional communication.
 * Does NOT add new information — only refines what was written.
 */
export async function polishText(params: {
  tenantId: string;
  text: string;
  context?: string;
}): Promise<{ polishedText: string }> {
  const { tenantId, text, context } = params;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  const apiKey = settings?.openaiApiKey
    ? decrypt(settings.openaiApiKey)
    : config.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn(`[PolishText] No OpenAI API key for tenant ${tenantId}`);
    return { polishedText: text };
  }

  const openai = new OpenAI({ apiKey });
  const model = settings?.openaiModel || config.OPENAI_MODEL;

  const systemPrompt = `Você é um assistente de escrita profissional. Sua tarefa é:
1. Corrigir erros gramaticais e ortográficos
2. Melhorar a clareza e o tom profissional da comunicação
3. Manter o sentido original da mensagem EXATAMENTE como está
4. NÃO adicionar informações novas
5. NÃO mudar fatos ou dados mencionados
6. Manter o idioma original do texto
7. Manter um tom amigável e profissional, adequado para atendimento ao cliente

Retorne APENAS o texto corrigido, sem explicações ou comentários.`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `Contexto da conversa para referência (NÃO inclua isso na resposta):\n${context}`,
    });
  }

  messages.push({ role: "user", content: text });

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 500,
    });

    const usage = response.usage;
    if (usage) {
      await logAiUsage({
        tenantId,
        service: "polish_text",
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      });
    }

    const polished = response.choices[0]?.message?.content?.trim();
    if (!polished) {
      return { polishedText: text };
    }

    logger.info(`[PolishText] Polished text for tenant ${tenantId}: "${text.substring(0, 50)}..." → "${polished.substring(0, 50)}..."`);
    return { polishedText: polished };
  } catch (err) {
    logger.error({ err }, "[PolishText] OpenAI error");
    return { polishedText: text };
  }
}
