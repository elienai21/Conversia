import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import {
  IWhatsAppProvider,
  IncomingWhatsappMessage,
  type MediaPayload,
  type MessageAttachmentInput,
} from "./provider.interface.js";
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
      const type = (msg.type as string | undefined) ?? "text";
      const attachments = extractOfficialAttachments(msg, type);
      const text = extractOfficialText(msg, type, attachments);

      if (!text && attachments.length === 0) return [];

      return [{
        from: msg.from as string,
        messageId: msg.id as string,
        text,
        displayName: contacts?.[0]?.profile
          ? ((contacts[0].profile as Record<string, unknown>).name as string)
          : undefined,
        providerId: (metadata?.phone_number_id as string) ?? "",
        attachments,
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
      logger.warn("[Official WhatsApp] Missing token or phoneNumberId, skipping send");
      return;
    }

    const url = `${config.WHATSAPP_API_URL}/${phoneNumberId}/messages`;

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
      throw new Error(`WhatsApp Official send failed (${response.status}): ${body}`);
    }
  }

  async sendMedia(tenantId: string, to: string, media: MediaPayload): Promise<void> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });
    const token = settings?.whatsappApiToken || config.WHATSAPP_API_TOKEN;
    const phoneNumberId = settings?.whatsappPhoneNumberId;

    if (!token || !phoneNumberId) {
      logger.warn("[Official WhatsApp] Missing token or phoneNumberId, skipping sendMedia");
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
          type: media.type,
          [media.type]: {
            link: media.url,
            caption: media.caption || undefined,
            filename: media.fileName || undefined,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(`WhatsApp Official sendMedia failed (${response.status}): ${body}`);
      }
    } catch (err) {
      logger.error({ err }, "WhatsApp Official sendMedia error");
    }
  }
}

function extractOfficialText(
  msg: Record<string, unknown>,
  type: string,
  attachments: MessageAttachmentInput[],
): string {
  if (type === "text") {
    const textObj = msg.text as Record<string, unknown> | undefined;
    return (textObj?.body as string | undefined) ?? "";
  }

  const typedPayload = msg[type] as Record<string, unknown> | undefined;
  const caption = typedPayload?.caption as string | undefined;
  if (caption) {
    return caption;
  }

  if (attachments.length > 0) {
    return `[${attachments[0].type}]`;
  }

  return "";
}

function extractOfficialAttachments(
  msg: Record<string, unknown>,
  type: string,
): MessageAttachmentInput[] {
  if (!["image", "video", "audio", "document"].includes(type)) {
    return [];
  }

  const typedPayload = msg[type] as Record<string, unknown> | undefined;
  if (!typedPayload?.id) {
    return [];
  }

  return [{
    type: type as MessageAttachmentInput["type"],
    providerMediaId: typedPayload.id as string,
    mimeType: typedPayload.mime_type as string | undefined,
    fileName: typedPayload.filename as string | undefined,
  }];
}
