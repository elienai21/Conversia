import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { WhatsAppProviderFactory } from "./whatsapp/whatsapp.factory.js";
import type { IncomingWhatsappMessage } from "./whatsapp/provider.interface.js";

// Re-export this so webhook.routes.ts still imports it
export type { IncomingWhatsappMessage };

export function parseIncomingMessage(
  body: Record<string, unknown>,
): { messages: IncomingWhatsappMessage[]; providerName: string } | null {
  const providerName = WhatsAppProviderFactory.detectProviderFromPayload(body);
  if (providerName === "unknown") return null;

  const provider = WhatsAppProviderFactory.getProvider(providerName);
  const messages = provider.parseWebhooks(body);
  
  return { messages, providerName };
}

export async function resolveTenant(providerId: string, providerName: string) {
  if (providerName === "official") {
    // Check Tenant model first (synced from TenantSettings)
    const tenant = await prisma.tenant.findFirst({
      where: { whatsappPhoneNumberId: providerId },
    });
    if (tenant) return tenant;

    // Fallback: check TenantSettings directly
    const settings = await prisma.tenantSettings.findFirst({
      where: { whatsappPhoneNumberId: providerId },
      include: { tenant: true },
    });
    return settings?.tenant || null;
  } else if (providerName === "evolution") {
    const settings = await prisma.tenantSettings.findFirst({
      where: { evolutionInstanceName: providerId },
      include: { tenant: true },
    });
    return settings?.tenant || null;
  }

  return null;
}

export async function sendWhatsappMessage(
  tenantId: string,
  to: string,
  text: string,
): Promise<void> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId }
  });
  
  const providerName = settings?.whatsappProvider || "evolution";
  const provider = WhatsAppProviderFactory.getProvider(providerName);
  
  await provider.sendMessage(tenantId, to, text);
}
