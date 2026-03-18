import { config } from "../../config.js";
import { IWhatsAppProvider, IncomingWhatsappMessage } from "./provider.interface.js";
import { prisma } from "../../lib/prisma.js";

export class OfficialWhatsAppProvider implements IWhatsAppProvider {
  parseWebhooks(body: Record<string, unknown>): IncomingWhatsappMessage[] {
    try {
      const entry = body.entry as Array<Record<string, unknown>> | undefined;
      if (!entry?.[0]) return [];

      const changes = entry[0].changes as Array<Record<string, unknown>> | undefined;
      if (!changes?.[0]) return [];

      const value = changes[0].value as Record<string, unknown>;
      const messages = value.messages as Array<Record<string, unknown>> | undefined;
      if (!messages?.[0]) return [];

      const msg = messages[0];
      const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
      const metadata = value.metadata as Record<string, unknown> | undefined;

      const textObj = msg.text as Record<string, unknown> | undefined;
      if (!textObj?.body) return [];

      return [{
        from: msg.from as string,
        messageId: msg.id as string,
        text: textObj.body as string,
        displayName: contacts?.[0]?.profile
          ? ((contacts[0].profile as Record<string, unknown>).name as string)
          : undefined,
        providerId: (metadata?.phone_number_id as string) ?? "",
      }];
    } catch {
      return [];
    }
  }

  async sendMessage(tenantId: string, to: string, text: string): Promise<void> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId }
    });
    const token = settings?.whatsappApiToken || config.WHATSAPP_API_TOKEN;
    const phoneNumberId = settings?.whatsappPhoneNumberId;

    if (!token || !phoneNumberId) {
      console.log("[Official WhatsApp] Missing token or phoneNumberId, skipping send");
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
        console.error(`WhatsApp Official send failed (${response.status}):`, body);
      }
    } catch (err) {
      console.error("WhatsApp Official send error:", err);
    }
  }
}
