import OpenAI from "openai";
import { config } from "../config.js";
import { logAiUsage } from "./usage-log.service.js";
import { logger } from "../lib/logger.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const VALID_INTENTS = [
  "pergunta",
  "agendamento",
  "reclamação",
  "humano",
  "parceria",
  "avaliacao",
  "vendas",
  "emergencia",
  "outro",
] as const;

export type Intent = (typeof VALID_INTENTS)[number];

export async function detectIntent(
  tenantId: string,
  text: string,
): Promise<Intent> {
  if (!config.OPENAI_API_KEY) {
    return "outro";
  }

  try {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `Classify the customer message into exactly one intent: ${VALID_INTENTS.join(", ")}. Reply with ONLY the intent word (lowercase, exact match).
- Use "parceria" if the user wants to offer an apartment, hire property administration, or become a partner.
- Use "avaliacao" if the user is giving a rating (e.g., numbers 1 to 5, or phrases like "foi nota 10", "detestei").
- Use "vendas" if the user is interested in buying additional services, upgrades, or asking about prices for purchasing.
- Use "emergencia" if the user reports an urgent issue (e.g., water leak, no power, locked out, broken item that requires immediate attention).
- Use "pergunta" for general questions, "agendamento" for booking related matters, and "reclamação" for non-urgent complaints.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.0,
      max_tokens: 10,
    });

    const usage = response.usage;
    if (usage) {
      await logAiUsage({
        tenantId,
        service: "intent_detection",
        model: config.OPENAI_MODEL,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      });
    }

    const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? "outro";
    const intent = VALID_INTENTS.find((i) => i === raw);
    return intent ?? "outro";
  } catch (err) {
    logger.error({ err }, "Intent detection failed");
    return "outro";
  }
}
