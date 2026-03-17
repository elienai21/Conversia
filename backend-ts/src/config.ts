import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DEBUG: z.string().default("false").transform((v) => v === "true"),
  SECRET_KEY: z.string().min(1).default("change-me-in-production"),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(480),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/conversia"),
  REDIS_URL: z.string().default("redis://localhost:6379/0"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  DEEPL_API_KEY: z.string().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().default("conversia-webhook-verify"),
  WHATSAPP_API_TOKEN: z.string().default(""),
  WHATSAPP_API_URL: z.string().default("https://graph.facebook.com/v21.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  INSTAGRAM_VERIFY_TOKEN: z.string().default("conversia-ig-webhook-verify"),
});

export const config = envSchema.parse(process.env);
