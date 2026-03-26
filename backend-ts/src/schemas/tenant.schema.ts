import { z } from "zod";

export const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  default_language: z.string().min(2).max(5).optional(),
});

export const updateIntegrationsSchema = z.object({
  whatsapp_provider: z.enum(["evolution", "official"]).optional(),
  whatsapp_api_token: z.string().optional(),
  whatsapp_phone_number_id: z.string().optional(),
  whatsapp_business_account_id: z.string().optional(),
  whatsapp_verify_token: z.string().optional(),
  evolution_server_url: z.string().optional(),
  evolution_instance_token: z.string().optional(),
  openai_api_key: z.string().optional(),
  deepl_api_key: z.string().optional(),
  staysnet_client_secret: z.string().optional(),
  staysnet_domain: z.string().optional(),
  instagram_page_access_token: z.string().optional(),
  instagram_page_id: z.string().optional(),
});

export const updateAISettingsSchema = z.object({
  openai_model: z.string().optional(),
  ai_temperature: z.number().min(0).max(2).optional(),
  ai_system_prompt: z.string().max(4000).nullable().optional(),
  ai_max_tokens: z.number().int().min(50).max(2000).optional(),
  enable_auto_response: z.boolean().optional(),
  auto_response_intents: z.array(z.string()).optional(),
  auto_response_mode: z.enum(["manual", "auto", "scheduled"]).optional(),
  business_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  business_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  business_hours_days: z.array(z.number().int().min(0).max(6)).optional(),
  emergency_phone_number: z.string().nullable().optional(),
});
