import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DEBUG: z.string().default("false").transform((v) => v === "true"),
  SECRET_KEY: z.string().min(1).default("change-me-in-production"),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(480),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/conversia"),
  REDIS_URL: z.string().default("redis://localhost:6379/0"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().default(""),
  SUPABASE_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  DEEPL_API_KEY: z.string().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().default("conversia-webhook-verify"),
  WHATSAPP_API_TOKEN: z.string().default(""),
  WHATSAPP_API_URL: z.string().default("https://graph.facebook.com/v21.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  INSTAGRAM_VERIFY_TOKEN: z.string().default("conversia-ig-webhook-verify"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  PASSWORD_RESET_EXPIRE_MINUTES: z.coerce.number().default(60),
  REFRESH_TOKEN_EXPIRE_DAYS: z.coerce.number().default(30),
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@conversia.app"),
  // AES-256-GCM salt used to derive encryption key from SECRET_KEY.
  // MUST be set in production. Changing this value makes all encrypted
  // API keys (OpenAI, WhatsApp, Stays) unreadable — never rotate without migration.
  ENCRYPTION_SALT: z.string().default("conversia-salt-124b"),
  // Optional secret for Evolution API webhook validation.
  // Set this to the apikey configured in Evolution API webhook settings.
  // If empty, signature validation is skipped (backward compatible).
  EVOLUTION_WEBHOOK_SECRET: z.string().default(""),
});

export const config = envSchema.parse(process.env);

// Block startup if SECRET_KEY is insecure in production; warn in development
if (config.SECRET_KEY === "change-me-in-production") {
  if (config.NODE_ENV === "production") {
    // Use process.stderr directly here — logger depends on config, avoid circular imports
    process.stderr.write("FATAL: SECRET_KEY must be changed in production. Set a strong, unique SECRET_KEY environment variable.\n");
    process.exit(1);
  } else {
    process.stderr.write("WARNING: Using default SECRET_KEY. This is insecure — set a strong SECRET_KEY before going to production.\n");
  }
}

// Parse ALLOWED_ORIGINS into array for CORS
export const allowedOrigins = config.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
