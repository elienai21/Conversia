import OpenAI from "openai";
import { config } from "../config.js";
import { logAiUsage } from "./usage-log.service.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const VALID_INTENTS = [
  "greeting",
  "reservation",
  "complaint",
  "inquiry",
  "checkout",
  "room_service",
  "feedback",
  "other",
] as const;

export type Intent = (typeof VALID_INTENTS)[number];

export async function detectIntent(
  tenantId: string,
  text: string,
): Promise<Intent> {
  if (!config.OPENAI_API_KEY) {
    return "other";
  }

  try {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `Classify the customer message into exactly one intent: ${VALID_INTENTS.join(", ")}. Reply with ONLY the intent word.`,
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

    const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? "other";
    const intent = VALID_INTENTS.find((i) => i === raw);
    return intent ?? "other";
  } catch (err) {
    console.error("Intent detection failed:", err);
    return "other";
  }
}
