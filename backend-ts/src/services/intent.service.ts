import OpenAI from "openai";
import { config } from "../config.js";
import { logAiUsage } from "./usage-log.service.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const VALID_INTENTS = [
  "pergunta",
  "agendamento",
  "reclamação",
  "humano",
  "parceria",
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
          content: `Classify the customer message into exactly one intent: ${VALID_INTENTS.join(", ")}. Reply with ONLY the intent word (lowercase, exact match). Pay special attention to "parceria" if the user wants to offer an apartment, hire property administration, or become a partner.`,
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
    console.error("Intent detection failed:", err);
    return "outro";
  }
}
