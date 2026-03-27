import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";
import { updateTenantSchema, updateIntegrationsSchema, updateAISettingsSchema } from "../schemas/tenant.schema.js";
import { getAiModeStatus } from "../services/business-hours.service.js";
import { checkAiTokenLimit } from "../services/ai-usage.service.js";

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);
  app.addHook("onRequest", requireAdmin);

  // GET /me — tenant info including billing + onboarding state
  app.get("/me", async (request) => {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: request.user.tenantId },
    });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      default_language: tenant.defaultLanguage,
      created_at: tenant.createdAt.toISOString(),
      // Billing
      plan: tenant.plan,
      plan_status: tenant.planStatus,
      trial_ends_at: tenant.trialEndsAt?.toISOString() ?? null,
      // Onboarding
      onboarding_step: tenant.onboardingStep,
    };
  });

  // PATCH /me — update tenant
  app.patch("/me", async (request, reply) => {
    const parsed = updateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.name) data.name = parsed.data.name;
    if (parsed.data.default_language) data.defaultLanguage = parsed.data.default_language;

    const tenant = await prisma.tenant.update({
      where: { id: request.user.tenantId },
      data,
    });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      default_language: tenant.defaultLanguage,
    };
  });

  // GET /me/integrations — masked integration status
  app.get("/me/integrations", async (request) => {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: request.user.tenantId },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: request.user.tenantId },
    });

    const safeDecryptMask = (value: string | null | undefined): string | null => {
      if (!value) return null;
      try { return maskApiKey(decrypt(value)); } catch { return "****"; }
    };

    const safeDecrypt = (value: string | null | undefined): string => {
      if (!value) return "";
      try { return decrypt(value); } catch { return ""; }
    };

    let evoTokenPreview: string | null = null;
    let evoTokenSet = !!settings?.evolutionInstanceToken;
    if (settings?.evolutionInstanceToken) {
      try {
        evoTokenPreview = maskApiKey(decrypt(settings.evolutionInstanceToken));
      } catch {
        evoTokenPreview = "****";
      }
    }

    return {
      whatsapp: {
        provider: settings?.whatsappProvider || "evolution",
        phone_number_id: settings?.whatsappPhoneNumberId || tenant.whatsappPhoneNumberId || null,
        business_account_id: settings?.whatsappBusinessAccountId || tenant.whatsappBusinessAccountId || null,
        api_token_set: !!settings?.whatsappApiToken,
        verify_token: settings?.whatsappVerifyToken || null,
        evolution_server_url: settings?.evolutionServerUrl || null,
        evolution_instance_token_set: evoTokenSet,
        evolution_instance_token_preview: evoTokenPreview,
        connected: settings?.whatsappConnected || false,
      },
      openai: {
        api_key_set: !!settings?.openaiApiKey,
        api_key_preview: safeDecryptMask(settings?.openaiApiKey),
      },
      deepl: {
        api_key_set: !!settings?.deeplApiKey,
        api_key_preview: safeDecryptMask(settings?.deeplApiKey),
      },
      staysnet: {
        client_secret_set: !!settings?.staysnetClientSecret,
        domain: settings?.staysnetDomain || null,
        website_url: settings?.staysnetWebsiteUrl || null,
      },
      checkin_base_url: settings?.checkinBaseUrl || null,
      instagram: {
        page_id: settings?.instagramPageId || tenant.instagramPageId || null,
        page_access_token_set: !!settings?.instagramPageAccessToken,
      },
      winker: {
        configured: !!(settings?.winkerApiToken && settings?.winkerPortalId),
        portal_id: settings?.winkerPortalId ?? null,
        token_set: !!settings?.winkerApiToken,
      },
    };
  });

  // PATCH /me/integrations — save API keys (encrypted)
  app.patch("/me/integrations", async (request, reply) => {
    const parsed = updateIntegrationsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.whatsapp_provider) data.whatsappProvider = parsed.data.whatsapp_provider;
    if (parsed.data.whatsapp_api_token) data.whatsappApiToken = encrypt(parsed.data.whatsapp_api_token);
    if (parsed.data.whatsapp_phone_number_id) data.whatsappPhoneNumberId = parsed.data.whatsapp_phone_number_id;
    if (parsed.data.whatsapp_business_account_id) data.whatsappBusinessAccountId = parsed.data.whatsapp_business_account_id;
    if (parsed.data.whatsapp_verify_token) data.whatsappVerifyToken = parsed.data.whatsapp_verify_token;
    if (parsed.data.evolution_server_url) data.evolutionServerUrl = parsed.data.evolution_server_url;
    if (parsed.data.evolution_instance_token) data.evolutionInstanceToken = encrypt(parsed.data.evolution_instance_token);
    if (parsed.data.openai_api_key) data.openaiApiKey = encrypt(parsed.data.openai_api_key);
    if (parsed.data.deepl_api_key) data.deeplApiKey = encrypt(parsed.data.deepl_api_key);
    if (parsed.data.staysnet_client_secret) data.staysnetClientSecret = encrypt(parsed.data.staysnet_client_secret);
    if (parsed.data.staysnet_domain) data.staysnetDomain = parsed.data.staysnet_domain;
    if (parsed.data.staysnet_website_url !== undefined) data.staysnetWebsiteUrl = parsed.data.staysnet_website_url || null;
    if (parsed.data.checkin_base_url !== undefined) data.checkinBaseUrl = parsed.data.checkin_base_url || null;
    if (parsed.data.instagram_page_access_token) data.instagramPageAccessToken = encrypt(parsed.data.instagram_page_access_token);
    if (parsed.data.instagram_page_id) data.instagramPageId = parsed.data.instagram_page_id;
    // Winker: if login+password provided, authenticate and store the JWT
    if (parsed.data.winker_login && parsed.data.winker_password) {
      const { WinkerAdapter } = await import("../adapters/winker/winker.adapter.js");
      const loginResult = await WinkerAdapter.login(parsed.data.winker_login, parsed.data.winker_password);
      if (!loginResult.ok) {
        return reply.status(400).send({ detail: `Falha no login Winker: ${loginResult.error.message}` });
      }
      data.winkerLogin = parsed.data.winker_login;
      data.winkerApiToken = encrypt(loginResult.value.token);
    } else if (parsed.data.winker_api_token) {
      // Fallback: allow direct token entry
      data.winkerApiToken = encrypt(parsed.data.winker_api_token);
    }
    if (parsed.data.winker_portal_id !== undefined) {
      data.winkerPortalId = parsed.data.winker_portal_id || null;
    }

    // Sync WhatsApp Phone Number ID to Tenant model for webhook resolution
    if (parsed.data.whatsapp_phone_number_id) {
      await prisma.tenant.update({
        where: { id: request.user.tenantId },
        data: { whatsappPhoneNumberId: parsed.data.whatsapp_phone_number_id },
      });
    }

    // Sync Instagram Page ID to Tenant model for webhook resolution
    if (parsed.data.instagram_page_id) {
      await prisma.tenant.update({
        where: { id: request.user.tenantId },
        data: { instagramPageId: parsed.data.instagram_page_id },
      });
    }

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId: request.user.tenantId },
      create: { tenantId: request.user.tenantId, ...data },
      update: data,
    });

    return {
      whatsapp: {
        provider: settings.whatsappProvider,
        phone_number_id: settings.whatsappPhoneNumberId,
        business_account_id: settings.whatsappBusinessAccountId,
        api_token_set: !!settings.whatsappApiToken,
        verify_token: settings.whatsappVerifyToken,
        evolution_server_url: settings.evolutionServerUrl,
        evolution_instance_token_set: !!settings.evolutionInstanceToken,
        connected: settings.whatsappConnected,
      },
      openai: {
        api_key_set: !!settings.openaiApiKey,
        api_key_preview: settings.openaiApiKey ? maskApiKey(decrypt(settings.openaiApiKey)) : null,
      },
      deepl: {
        api_key_set: !!settings.deeplApiKey,
        api_key_preview: settings.deeplApiKey ? maskApiKey(decrypt(settings.deeplApiKey)) : null,
      },
      staysnet: {
        client_secret_set: !!settings.staysnetClientSecret,
        domain: settings.staysnetDomain || null,
        website_url: settings.staysnetWebsiteUrl || null,
      },
      checkin_base_url: settings.checkinBaseUrl || null,
      instagram: {
        page_id: settings.instagramPageId,
        page_access_token_set: !!settings.instagramPageAccessToken,
      },
      winker: {
        configured: !!settings.winkerApiToken,
        login: settings.winkerLogin ?? null,
        portal_id: settings.winkerPortalId ?? null,
        token_set: !!settings.winkerApiToken,
      },
    };
  });

  // GET /me/integrations/winker/portals — decode JWT and return available portals
  app.get("/me/integrations/winker/portals", async (request, reply) => {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: request.user.tenantId },
      select: { winkerApiToken: true },
    });
    if (!settings?.winkerApiToken) {
      return reply.send({ portals: [] });
    }
    let token: string;
    try {
      token = decrypt(settings.winkerApiToken);
    } catch {
      return reply.send({ portals: [] });
    }
    const { parsePortalsFromToken } = await import("../adapters/winker/winker.adapter.js");
    const portals = parsePortalsFromToken(token);
    return reply.send({ portals });
  });

  // POST /me/integrations/winker/test — test Winker connection (GET /me)
  app.post("/me/integrations/winker/test", async (request, reply) => {
    try {
      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId: request.user.tenantId },
      });
      if (!settings?.winkerApiToken) {
        return reply.send({ success: false, message: "Winker não configurado. Conecte com login e senha primeiro." });
      }
      let apiToken: string;
      try {
        apiToken = decrypt(settings.winkerApiToken);
      } catch {
        return reply.send({ success: false, message: "Falha ao descriptografar o token da Winker." });
      }
      // Use default portal or any portal to test connection
      const portalId = settings.winkerPortalId ?? "0";
      const { WinkerAdapter } = await import("../adapters/winker/winker.adapter.js");
      const winker = new WinkerAdapter({ apiToken, portalId });
      const result = await winker.testConnection();
      if (!result.ok) {
        return reply.send({ success: false, message: result.error.message });
      }
      return reply.send({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      return reply.send({ success: false, message: msg });
    }
  });

  // GET /me/integrations/crm-test — test CRM connection
  app.get("/me/integrations/crm-test", async (request, reply) => {
    try {
      const { CrmAdapterFactory } = await import("../adapters/crm/crm.factory.js");
      const adapterResult = await CrmAdapterFactory.getAdapter(request.user.tenantId);
      
      if (!adapterResult.ok) {
        return reply.send({
          connected: false,
          error: adapterResult.error.message,
          detail: "CRM adapter could not be initialized. Check your Client ID, Secret and Domain in Integrations.",
        });
      }

      const adapter = adapterResult.value;
      const testResult = await adapter.testConnection();

      if (!testResult.ok) {
        return reply.send({
          connected: false,
          error: testResult.error.message,
          detail: "CRM adapter initialized but API request failed. Verify your credentials and domain.",
        });
      }

      return reply.send({
        connected: true,
        detail: "CRM connection successful! The API responded correctly.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return reply.status(500).send({
        connected: false,
        error: msg,
        detail: "Unexpected error testing CRM connection.",
      });
    }
  });

  // GET /me/ai-settings
  app.get("/me/ai-settings", async (request) => {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: request.user.tenantId },
    });
    
    // Check usage to return alongside settings
    const usageResult = await checkAiTokenLimit(request.user.tenantId);

    return {
      openai_model: settings?.openaiModel || "gpt-4.1-mini",
      ai_temperature: settings?.aiTemperature ?? 0.7,
      ai_system_prompt: settings?.aiSystemPrompt || "",
      ai_max_tokens: settings?.aiMaxTokens || 200,
      enable_auto_response: settings?.enableAutoResponse ?? false,
      auto_response_intents: settings?.autoResponseIntents
        ? JSON.parse(settings.autoResponseIntents)
        : [],
      auto_response_mode: settings?.autoResponseMode || "manual",
      business_hours_start: settings?.businessHoursStart || "08:00",
      business_hours_end: settings?.businessHoursEnd || "18:00",
      business_hours_days: settings?.businessHoursDays
        ? JSON.parse(settings.businessHoursDays)
        : [1, 2, 3, 4, 5],
      emergency_phone_number: settings?.emergencyPhoneNumber || null,
      use_global_ai_key: settings?.useGlobalAiKey ?? false,
      ai_monthly_token_limit: usageResult.limit,
      ai_monthly_token_usage: usageResult.usage,
      ai_provider_mode: usageResult.providerType,
    };
  });

  // PATCH /me/ai-settings
  app.patch("/me/ai-settings", async (request, reply) => {
    const parsed = updateAISettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.openai_model !== undefined) data.openaiModel = parsed.data.openai_model;
    if (parsed.data.ai_temperature !== undefined) data.aiTemperature = parsed.data.ai_temperature;
    if (parsed.data.ai_system_prompt !== undefined) data.aiSystemPrompt = parsed.data.ai_system_prompt ?? "";
    if (parsed.data.ai_max_tokens !== undefined) data.aiMaxTokens = parsed.data.ai_max_tokens;
    if (parsed.data.enable_auto_response !== undefined) data.enableAutoResponse = parsed.data.enable_auto_response;
    if (parsed.data.auto_response_intents !== undefined) data.autoResponseIntents = JSON.stringify(parsed.data.auto_response_intents);
    if (parsed.data.auto_response_mode !== undefined) data.autoResponseMode = parsed.data.auto_response_mode;
    if (parsed.data.business_hours_start !== undefined) data.businessHoursStart = parsed.data.business_hours_start;
    if (parsed.data.business_hours_end !== undefined) data.businessHoursEnd = parsed.data.business_hours_end;
    if (parsed.data.business_hours_days !== undefined) data.businessHoursDays = JSON.stringify(parsed.data.business_hours_days);
    if (parsed.data.emergency_phone_number !== undefined) data.emergencyPhoneNumber = parsed.data.emergency_phone_number;
    if (parsed.data.use_global_ai_key !== undefined) data.useGlobalAiKey = parsed.data.use_global_ai_key;

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId: request.user.tenantId },
      create: { tenantId: request.user.tenantId, ...data },
      update: data,
    });

    return {
      openai_model: settings.openaiModel,
      ai_temperature: settings.aiTemperature,
      ai_system_prompt: settings.aiSystemPrompt || "",
      ai_max_tokens: settings.aiMaxTokens,
      enable_auto_response: settings.enableAutoResponse,
      auto_response_intents: settings.autoResponseIntents
        ? JSON.parse(settings.autoResponseIntents)
        : [],
      auto_response_mode: settings.autoResponseMode,
      business_hours_start: settings.businessHoursStart,
      business_hours_end: settings.businessHoursEnd,
      business_hours_days: settings.businessHoursDays
        ? JSON.parse(settings.businessHoursDays)
        : [1, 2, 3, 4, 5],
      emergency_phone_number: settings.emergencyPhoneNumber,
      use_global_ai_key: settings.useGlobalAiKey,
    };
  });

  // GET /me/ai-mode-status — quick AI mode status for dashboard toggle
  app.get("/me/ai-mode-status", async (request) => {
    const status = await getAiModeStatus(request.user.tenantId);
    return {
      mode: status.mode,
      is_auto_response_active: status.isAutoResponseActive,
      business_hours_start: status.businessHoursStart,
      business_hours_end: status.businessHoursEnd,
      business_hours_days: status.businessHoursDays,
      timezone: status.timezone,
    };
  });

  // PATCH /me/ai-mode — quick toggle for dashboard
  app.patch("/me/ai-mode", async (request, reply) => {
    const body = request.body as { mode?: string };
    const mode = body.mode;

    if (!mode || !["manual", "auto", "scheduled"].includes(mode)) {
      return reply.status(422).send({ detail: "Invalid mode. Use: manual, auto, or scheduled" });
    }

    // Also sync legacy enableAutoResponse for backward compat
    const enableAutoResponse = mode === "auto";

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId: request.user.tenantId },
      create: {
        tenantId: request.user.tenantId,
        autoResponseMode: mode,
        enableAutoResponse,
      },
      update: {
        autoResponseMode: mode,
        enableAutoResponse,
      },
    });

    const status = await getAiModeStatus(request.user.tenantId);
    return {
      mode: settings.autoResponseMode,
      is_auto_response_active: status.isAutoResponseActive,
    };
  });

  // GET /me/agents — list all agents in tenant
  app.get("/me/agents", async (request) => {
    const agents = await prisma.user.findMany({
      where: { tenantId: request.user.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return agents.map((a) => ({
      id: a.id,
      email: a.email,
      full_name: a.fullName,
      role: a.role,
      is_online: a.isOnline,
      is_active: a.isActive,
      preferred_language: a.preferredLanguage,
      max_concurrent_conversations: a.maxConcurrentConversations,
      created_at: a.createdAt.toISOString(),
    }));
  });

  // POST /me/agents — create new agent
  app.post("/me/agents", async (request, reply) => {
    const body = request.body as {
      email: string;
      full_name: string;
      password: string;
      role?: string;
      preferred_language?: string;
    };

    if (!body.email || !body.full_name || !body.password) {
      return reply.status(422).send({ detail: "email, full_name, and password are required" });
    }

    const existing = await prisma.user.findFirst({
      where: { tenantId: request.user.tenantId, email: body.email },
    });
    if (existing) {
      return reply.status(409).send({ detail: "Agent with this email already exists" });
    }

    const passwordHash = await hashPassword(body.password);
    const agent = await prisma.user.create({
      data: {
        tenantId: request.user.tenantId,
        email: body.email,
        fullName: body.full_name,
        passwordHash,
        role: body.role || "agent",
        preferredLanguage: body.preferred_language || "en",
      },
    });

    return reply.status(201).send({
      id: agent.id,
      email: agent.email,
      full_name: agent.fullName,
      role: agent.role,
      is_online: agent.isOnline,
      is_active: agent.isActive,
      preferred_language: agent.preferredLanguage,
      max_concurrent_conversations: agent.maxConcurrentConversations,
      created_at: agent.createdAt.toISOString(),
    });
  });

  // PATCH /me/agents/:agentId — update agent
  app.patch<{ Params: { agentId: string } }>("/me/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params;
    const body = request.body as {
      full_name?: string;
      role?: string;
      is_active?: boolean;
      preferred_language?: string;
      max_concurrent_conversations?: number;
    };

    const agent = await prisma.user.findFirst({
      where: { id: agentId, tenantId: request.user.tenantId },
    });
    if (!agent) {
      return reply.status(404).send({ detail: "Agent not found" });
    }

    const data: Record<string, unknown> = {};
    if (body.full_name !== undefined) data.fullName = body.full_name;
    if (body.role !== undefined) data.role = body.role;
    if (body.is_active !== undefined) data.isActive = body.is_active;
    if (body.preferred_language !== undefined) data.preferredLanguage = body.preferred_language;
    if (body.max_concurrent_conversations !== undefined) data.maxConcurrentConversations = body.max_concurrent_conversations;

    const updated = await prisma.user.update({
      where: { id: agentId },
      data,
    });

    return {
      id: updated.id,
      email: updated.email,
      full_name: updated.fullName,
      role: updated.role,
      is_online: updated.isOnline,
      is_active: updated.isActive,
      preferred_language: updated.preferredLanguage,
      max_concurrent_conversations: updated.maxConcurrentConversations,
      created_at: updated.createdAt.toISOString(),
    };
  });

  // DELETE /me/agents/:agentId — soft delete (deactivate)
  app.delete<{ Params: { agentId: string } }>("/me/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params;

    if (agentId === request.user.id) {
      return reply.status(400).send({ detail: "Cannot deactivate yourself" });
    }

    const agent = await prisma.user.findFirst({
      where: { id: agentId, tenantId: request.user.tenantId },
    });
    if (!agent) {
      return reply.status(404).send({ detail: "Agent not found" });
    }

    await prisma.user.update({
      where: { id: agentId },
      data: { isActive: false, isOnline: false },
    });

    return reply.status(204).send();
  });

  // ── PATCH /me/onboarding — advance (or skip) the onboarding step ──────────
  // step: 1=WhatsApp 2=AI 3=Team 4=Done (also accepts "skip" to jump to 4)
  app.patch("/me/onboarding", async (request, reply) => {
    const body = request.body as { step?: number; skip?: boolean };

    let nextStep: number;
    if (body.skip) {
      nextStep = 4; // mark completed/skipped
    } else if (typeof body.step === "number" && body.step >= 1 && body.step <= 4) {
      nextStep = body.step;
    } else {
      return reply.status(422).send({ detail: "Invalid step value. Use 1–4 or skip:true." });
    }

    const tenant = await prisma.tenant.update({
      where: { id: request.user.tenantId },
      data: { onboardingStep: nextStep },
      select: { onboardingStep: true },
    });

    return reply.send({ onboarding_step: tenant.onboardingStep });
  });
}
