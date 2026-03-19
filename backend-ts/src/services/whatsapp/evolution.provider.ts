import {
  IWhatsAppProvider,
  IncomingWhatsappMessage,
  type MessageAttachmentInput,
} from "./provider.interface.js";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/encryption.js";

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
  parseWebhooks(body: Record<string, unknown>): IncomingWhatsappMessage[] {
    try {
      if (body.event !== "messages.upsert") return [];

      const data = body.data as Record<string, unknown> | undefined;
      if (!data) return [];

      let msgData = data;
      // evolution v1 vs v2 differences sometimes put it in data.message
      if (data.message && typeof (data.message as any).key === 'object') {
        msgData = data.message as Record<string, unknown>;
      } else if (Array.isArray(data.messages) && data.messages.length > 0) {
        msgData = data.messages[0];
      }

      const key = msgData.key as Record<string, unknown> | undefined;
      const messageContent = msgData.message as Record<string, unknown> | undefined;

      if (!key?.remoteJid || !messageContent) return [];
      
      // Ignore messages sending by the agent/instance itself
      if (key.fromMe) return [];

      let text = "";
      if (typeof messageContent.conversation === "string") {
        text = messageContent.conversation;
      } else if (messageContent.extendedTextMessage) {
        text = (messageContent.extendedTextMessage as Record<string, unknown>).text as string;
      }

      const attachments = extractEvolutionAttachments(messageContent);
      if (!text && attachments.length > 0) {
        text = `[${attachments[0].type}]`;
      }

      if (!text) return [];

      let from = key.remoteJid as string;
      // Strip WhatsApp suffixes
      from = from.split("@")[0];

      return [
        {
          from,
          messageId: key.id as string,
          text,
          displayName: msgData.pushName as string | undefined,
          providerId: body.instance as string,
          attachments,
        },
      ];
    } catch (err) {
      console.error("Evolution parseWebhook error:", err);
      return [];
    }
  }

  async sendMessage(tenantId: string, to: string, text: string): Promise<void> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const rawUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const instanceName = settings?.evolutionInstanceName;
    const rawToken = settings?.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (!rawUrl || !instanceName || !apikey) {
      console.error("[Evolution] Missing serverUrl, instanceName, or apikey for sending message.");
      return;
    }

    let serverUrl = rawUrl.trim().replace(/\/+$/, '');
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      serverUrl = `https://${serverUrl}`;
    }

    const url = `${serverUrl}/message/sendText/${instanceName}`;
    const formattedTo = to.includes("@") ? to : `${to}@s.whatsapp.net`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apikey,
        },
        body: JSON.stringify({
          number: formattedTo,
          text: text,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        console.error(`Evolution send failed (${response.status}):`, bodyText);
      }
    } catch (err) {
      console.error("Evolution send error:", err);
    }
  }

  async sendMedia(tenantId: string, to: string, media: MediaPayload): Promise<void> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const rawUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const instanceName = settings?.evolutionInstanceName;
    const rawToken = settings?.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (!rawUrl || !instanceName || !apikey) {
      console.error("[Evolution] Missing config for sending media.");
      return;
    }

    let serverUrl = rawUrl.trim().replace(/\/+$/, '');
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      serverUrl = `https://${serverUrl}`;
    }

    const formattedTo = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const url = `${serverUrl}/message/sendMedia/${instanceName}`;

    // Strip data URI prefix if present — Evolution expects raw base64 or URL
    let mediaData = media.url;
    if (mediaData.startsWith("data:")) {
      mediaData = mediaData.split(",")[1] || mediaData;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apikey,
        },
        body: JSON.stringify({
          number: formattedTo,
          mediatype: media.type,
          mimetype: media.mimeType || undefined,
          media: mediaData,
          caption: media.caption || "",
          fileName: media.fileName || undefined,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        console.error(`Evolution sendMedia failed (${response.status}):`, bodyText);
      } else {
        console.log(`[Evolution] Media sent successfully (${media.type}) to ${to}`);
      }
    } catch (err) {
      console.error("Evolution sendMedia error:", err);
    }
  }
}

export async function fetchEvolutionProfilePicture(
  tenantId: string,
  phone: string,
): Promise<string | undefined> {
  try {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const rawUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const instanceName = settings?.evolutionInstanceName;
    const rawToken = settings?.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (!rawUrl || !instanceName || !apikey) return undefined;

    let serverUrl = rawUrl.trim().replace(/\/+$/, "");
    if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
      serverUrl = `https://${serverUrl}`;
    }

    const formattedNumber = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
    const url = `${serverUrl}/chat/fetchProfilePictureUrl/${instanceName}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
      },
      body: JSON.stringify({ number: formattedNumber }),
    });

    if (!response.ok) return undefined;

    const data = await response.json() as Record<string, unknown>;
    const pictureUrl = (data.profilePictureUrl ?? data.profilePicUrl ?? data.url ?? data.imgUrl) as string | undefined;
    return pictureUrl || undefined;
  } catch (err) {
    console.warn("[Evolution] Failed to fetch profile picture:", err);
    return undefined;
  }
}

function extractEvolutionAttachments(
  messageContent: Record<string, unknown>,
): MessageAttachmentInput[] {
  const mappings: Array<{ key: string; type: MessageAttachmentInput["type"] }> = [
    { key: "imageMessage", type: "image" },
    { key: "videoMessage", type: "video" },
    { key: "audioMessage", type: "audio" },
    { key: "documentMessage", type: "document" },
  ];

  for (const mapping of mappings) {
    const payload = messageContent[mapping.key] as Record<string, unknown> | undefined;
    if (!payload) continue;

    return [{
      type: mapping.type,
      mimeType: payload.mimetype as string | undefined,
      fileName: payload.fileName as string | undefined,
      sourceUrl:
        (payload.url as string | undefined)
        ?? (payload.mediaUrl as string | undefined)
        ?? (payload.directPath as string | undefined),
    }];
  }

  return [];
}

function extractEvolutionAttachments(
  messageContent: Record<string, unknown>,
): MessageAttachmentInput[] {
  const mappings: Array<{ key: string; type: MessageAttachmentInput["type"] }> = [
    { key: "imageMessage", type: "image" },
    { key: "videoMessage", type: "video" },
    { key: "audioMessage", type: "audio" },
    { key: "documentMessage", type: "document" },
  ];

  for (const mapping of mappings) {
    const payload = messageContent[mapping.key] as Record<string, unknown> | undefined;
    if (!payload) continue;

    return [{
      type: mapping.type,
      mimeType: payload.mimetype as string | undefined,
      fileName: payload.fileName as string | undefined,
      sourceUrl:
        (payload.url as string | undefined)
        ?? (payload.mediaUrl as string | undefined)
        ?? (payload.directPath as string | undefined),
    }];
  }

  return [];
}
