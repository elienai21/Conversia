import * as deepl from "deepl-node";
import OpenAI from "openai";
import { config } from "../config.js";
import { logAiUsage } from "./usage-log.service.js";
import { logger } from "../lib/logger.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

// DeepL uses different language codes for some languages
const DEEPL_LANG_MAP: Record<string, string> = {
  en: "en-US",
  pt: "pt-BR",
};

function toDeepLLang(lang: string): string {
  return DEEPL_LANG_MAP[lang] ?? lang;
}

export async function translateText(
  tenantId: string,
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ translatedText: string; provider: string }> {
  // Try DeepL first
  if (config.DEEPL_API_KEY) {
    try {
      const translator = new deepl.Translator(config.DEEPL_API_KEY);
      const result = await translator.translateText(
        text,
        null,
        toDeepLLang(targetLang) as deepl.TargetLanguageCode,
      );

      const translated = Array.isArray(result) ? result[0].text : result.text;

      await logAiUsage({
        tenantId,
        service: "translation",
        model: "deepl",
      });

      return { translatedText: translated, provider: "deepl" };
    } catch (err) {
      logger.warn({ err }, "DeepL translation failed, falling back to OpenAI");
    }
  }

  // Fallback to OpenAI
  if (config.OPENAI_API_KEY) {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `Translate the following text from ${sourceLang} to ${targetLang}. Return ONLY the translated text.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const usage = response.usage;
    if (usage) {
      await logAiUsage({
        tenantId,
        service: "translation",
        model: config.OPENAI_MODEL,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      });
    }

    const translated = response.choices[0]?.message?.content?.trim() ?? text;
    return { translatedText: translated, provider: "openai" };
  }

  return { translatedText: text, provider: "none" };
}
