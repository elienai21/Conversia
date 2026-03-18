import { config } from "../config.js";

export interface IncomingWhatsappMessage {
  from: string;
  messageId: string;
  text: string;
  displayName?: string;
  phoneNumberId: string;
}

export function parseIncomingMessage(
  body: Record<string, unknown>,
): IncomingWhatsappMessage | null {
  try {
    const entry = body.entry as Array<Record<string, unknown>> | undefined;
    if (!entry?.[0]) return null;

    const changes = entry[0].changes as Array<Record<string, unknown>> | undefined;
    if (!changes?.[0]) return null;

    const value = changes[0].value as Record<string, unknown>;
    const messages = value.messages as Array<Record<string, unknown>> | undefined;
    if (!messages?.[0]) return null;

    const msg = messages[0];
    const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
    const metadata = value.metadata as Record<string, unknown> | undefined;

    const textObj = msg.text as Record<string, unknown> | undefined;
    if (!textObj?.body) return null;

    return {
      from: msg.from as string,
      messageId: msg.id as string,
      text: textObj.body as string,
      displayName: contacts?.[0]?.profile
        ? ((contacts[0].profile as Record<string, unknown>).name as string)
        : undefined,
      phoneNumberId: (metadata?.phone_number_id as string) ?? "",
    };
  } catch {
    return null;
  }
}

export async function resolveTenant(phoneNumberId: string) {
  const { prisma } = await import("../lib/prisma.js");

  // Check Tenant model first (synced from TenantSettings)
  const tenant = await prisma.tenant.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId },
  });
  if (tenant) return tenant;

  // Fallback: check TenantSettings directly
  const settings = await prisma.tenantSettings.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId },
    include: { tenant: true },
  });
  return settings?.tenant || null;
}

export async function sendWhatsappMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  apiToken?: string,
): Promise<void> {
  const token = apiToken || config.WHATSAPP_API_TOKEN;
  if (!token) {
    console.log("[WhatsApp] No API token configured, skipping send");
    return;
  }

  const url = `${config.WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`WhatsApp send failed (${response.status}):`, body);
    }
  } catch (err) {
    console.error("WhatsApp send error:", err);
  }
}
