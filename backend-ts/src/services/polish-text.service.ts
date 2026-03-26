import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { logAiUsage } from "./usage-log.service.js";
import { logger } from "../lib/logger.js";
import { chatCompletion } from "../lib/ai-client.js";

/**
 * Takes raw text from the operator and returns a polished version
 * with grammar corrections and improved professional communication.
 * Does NOT add new information — only refines what was written.
 *
 * Uses OpenAI with automatic Gemini fallback.
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
    : undefined; // ai-client will use global env as fallback

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

  const messages: Array<{ role: "system" | "user"; content: string }> = [
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
    const result = await chatCompletion({
      apiKey,
      model,
      messages,
      temperature: 0.3,
      maxTokens: 500,
    });

    if (result.inputTokens > 0) {
      await logAiUsage({
        tenantId,
        service: "polish_text",
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    }

    const polished = result.text;
    if (!polished) {
      return { polishedText: text };
    }

    logger.info(`[PolishText] via ${result.provider} (${result.model}): "${text.substring(0, 50)}..." → "${polished.substring(0, 50)}..."`);
    return { polishedText: polished };
  } catch (err) {
    logger.error({ err }, "[PolishText] AI error");
    return { polishedText: text };
  }
}
