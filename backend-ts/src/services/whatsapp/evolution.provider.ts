import {
  IWhatsAppProvider,
  IncomingWhatsappMessage,
  type MediaPayload,
  type MessageAttachmentInput,
} from "./provider.interface.js";
import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/encryption.js";
import { logger } from "../../lib/logger.js";

/** Always forces HTTPS for non-localhost URLs (Railway redirects http→https losing POST body) */
function normalizeEvolutionUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, "");
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  } else if (url.startsWith("http://") && !isLocal) {
    url = url.replace("http://", "https://");
  }
  return url;
}

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
  parseWebhooks(body: Record<string, unknown>): IncomingWhatsappMessage[] {
    try {
      if (body.event !== "messages.upsert") return [];

      const data = body.data as Record<string, unknown> | undefined;
      if (!data) return [];

      // === DEBUG: Log the full webhook structure ===
      const topKeys = Object.keys(body);
      const dataKeys = Object.keys(data);
      const dataHasBase64 = !!data.base64;
      const dataHasMessage = !!data.message;
      logger.debug(`[Evolution DEBUG] body.keys=${topKeys.join(",")}`);
      logger.debug(`[Evolution DEBUG] data.keys=${dataKeys.join(",")}, data.base64=${dataHasBase64}, data.message=${dataHasMessage}`);
      if (data.message && typeof data.message === "object") {
        const msgKeys = Object.keys(data.message as object);
        logger.debug(`[Evolution DEBUG] data.message.keys=${msgKeys.join(",")}`);
        const innerMsg = (data.message as Record<string, unknown>).message;
        if (innerMsg && typeof innerMsg === "object") {
          logger.debug(`[Evolution DEBUG] data.message.message.keys=${Object.keys(innerMsg as object).join(",")}`);
        }
      }
      // === END DEBUG ===

      let msgData = data;
      // evolution v1 vs v2 differences sometimes put it in data.message
      if (data.message && typeof (data.message as any).key === "object") {
        msgData = data.message as Record<string, unknown>;
      } else if (Array.isArray(data.messages) && data.messages.length > 0) {
        msgData = data.messages[0];
      }

      const key = msgData.key as Record<string, unknown> | undefined;
      const messageContent = msgData.message as Record<string, unknown> | undefined;

      if (!key?.remoteJid || !messageContent) return [];

      const fromMe = !!key.fromMe;

      let text = "";
      if (typeof messageContent.conversation === "string") {
        text = messageContent.conversation;
      } else if (messageContent.extendedTextMessage) {
        text = (messageContent.extendedTextMessage as Record<string, unknown>).text as string;
      }

      const attachments = extractEvolutionAttachments(messageContent, msgData);
      logger.info(`[Evolution] parseWebhooks: text="${text}", attachments=${attachments.length}, messageContentKeys=${Object.keys(messageContent).join(",")}`);
      if (!text && attachments.length > 0) {
        text = `[${attachments[0].type}]`;
      }

      if (!text) return [];

      let from = key.remoteJid as string;
      // Preserve @g.us suffix so findOrCreateCustomer can detect groups.
      // Only strip @s.whatsapp.net for individual contacts.
      if (from.includes("@s.whatsapp.net")) {
        from = from.split("@")[0];
      }
      // @g.us groups: keep the full JID (e.g. "120363...@g.us")

      // Extract actual participant if it's a group message
      const participantRaw = (key?.participant as string) || (msgData.participant as string);
      const participantPhone = participantRaw ? participantRaw.split("@")[0] : undefined;
      const participantName = msgData.pushName as string | undefined;

      return [
        {
          from,
          messageId: key.id as string,
          text,
          displayName: participantName, // Keep backward compatibility
          participantPhone,
          participantName,
          providerId: body.instance as string,
          attachments,
          whatsappMessageKey: key as Record<string, unknown>,
          whatsappMessageData: msgData as Record<string, unknown>,
          fromMe,
        },
      ];
    } catch (err) {
      logger.error({ err }, "Evolution parseWebhook error");
      return [];
    }
  }

  async createGroup(tenantId: string, subject: string, participants: string[]): Promise<string> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const rawUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const instanceName = settings?.evolutionInstanceName;
    const rawToken = settings?.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (!rawUrl || !instanceName || !apikey) {
      throw new Error("[Evolution] Missing config for creating group.");
    }

    const serverUrl = normalizeEvolutionUrl(rawUrl);
    const url = `${serverUrl}/group/create/${instanceName}`;

    // Format numbers: '5511999999999' -> '5511999999999@s.whatsapp.net'
    const formattedParticipants = participants.map(p => p.includes("@") ? p : `${p}@s.whatsapp.net`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apikey,
      },
      body: JSON.stringify({
        subject,
        participants: formattedParticipants,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Evolution createGroup failed (${response.status}): ${bodyText}`);
    }

    const result = await response.json() as { id?: string, groupMetadata?: { id?: string } };
    const groupId = result.id || result.groupMetadata?.id;
    
    if (!groupId) {
      throw new Error("Evolution API returned ok, but no group ID found in response");
    }

    return groupId;
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
      logger.error("[Evolution] Missing serverUrl, instanceName, or apikey for sending message.");
      return;
    }

    const serverUrl = normalizeEvolutionUrl(rawUrl);

    const url = `${serverUrl}/message/sendText/${instanceName}`;
    const formattedTo = to.includes("@") ? to : `${to}@s.whatsapp.net`;

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
      throw new Error(`Evolution send failed (${response.status}): ${bodyText}`);
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
      logger.error("[Evolution] Missing config for sending media.");
      return;
    }

    const serverUrl = normalizeEvolutionUrl(rawUrl);

    const formattedTo = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const url = `${serverUrl}/message/sendMedia/${instanceName}`;

    // Strip data URI prefix if present — Evolution expects raw base64 or URL
    let mediaData = media.url;
    if (mediaData.startsWith("data:")) {
      mediaData = mediaData.split(",")[1] || mediaData;
    }

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
      throw new Error(`Evolution sendMedia failed (${response.status}): ${bodyText}`);
    } else {
      logger.info(`[Evolution] Media sent successfully (${media.type}) to ${to}`);
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

    const serverUrl = normalizeEvolutionUrl(rawUrl);

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
    logger.warn({ err }, "[Evolution] Failed to fetch profile picture");
    return undefined;
  }
}

export function extractEvolutionAttachments(
  messageContent: Record<string, unknown>,
  msgData?: Record<string, unknown>,
): MessageAttachmentInput[] {
  const mappings: Array<{ key: string; type: MessageAttachmentInput["type"] }> = [
    { key: "imageMessage", type: "image" },
    { key: "videoMessage", type: "video" },
    { key: "audioMessage", type: "audio" },
    { key: "documentMessage", type: "document" },
  ];

  logger.info(`[Evolution] extractAttachments: messageContentKeys=${Object.keys(messageContent).join(",")}, msgDataKeys=${msgData ? Object.keys(msgData).join(",") : "null"}`);

  for (const mapping of mappings) {
    const payload = messageContent[mapping.key] as Record<string, unknown> | undefined;
    if (!payload) continue;

    let sourceUrl =
      (payload.url as string | undefined) ??
      (payload.mediaUrl as string | undefined) ??
      undefined; // Don't use directPath - it's not a valid URL

    // Evolution API may inject base64 natively if configured.
    // Check common paths for base64 injection in the webhook payload.
    const b64 =
      (payload.base64 as string) ||
      (messageContent.base64 as string) ||
      (msgData?.base64 as string);

    if (b64) {
      const mimeType = (payload.mimetype as string) || "application/octet-stream";
      sourceUrl = `data:${mimeType};base64,${b64}`;
    }

    logger.info(`[Evolution] extractAttachments: found ${mapping.type}, hasSourceUrl=${!!sourceUrl}, hasBase64=${!!b64}, sourceUrlLen=${sourceUrl?.length ?? 0}`);

    return [
      {
        type: mapping.type,
        mimeType: payload.mimetype as string | undefined,
        fileName: payload.fileName as string | undefined,
        sourceUrl,
      },
    ];
  }

  return [];
}

/**
 * Fetch media content as base64 from Evolution API.
 * Uses the /chat/getBase64FromMediaMessage/{instance} endpoint.
 */
export async function fetchEvolutionMediaBase64(
  tenantId: string,
  whatsappMessageKey: Record<string, unknown>,
  whatsappMessageData?: Record<string, unknown>,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const rawUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const instanceName = settings?.evolutionInstanceName;
    const rawToken = settings?.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (!rawUrl || !instanceName || !apikey) {
      logger.error("[Evolution] Missing config for fetchMediaBase64");
      return null;
    }

    const serverUrl = normalizeEvolutionUrl(rawUrl);

    const url = `${serverUrl}/chat/getBase64FromMediaMessage/${instanceName}`;
    logger.info(`[Evolution] Fetching media base64 from: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
      },
      body: JSON.stringify({
        // Evolution API expects the full WAMessage object in "message" field
        message: whatsappMessageData || { key: whatsappMessageKey },
        convertToMp4: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Evolution] fetchMediaBase64 failed: ${response.status} ${errorText}`);
      return null;
    }

    const result = await response.json() as Record<string, unknown>;
    const b64String = (result.base64 as string) || null;
    // Normalize MIME type: strip codec params like "audio/ogg; codecs=opus" → "audio/ogg"
    const rawMime = (result.mimetype as string) || "application/octet-stream";
    const mimeType = rawMime.split(";")[0].trim();

    if (!b64String) {
      logger.error("[Evolution] fetchMediaBase64: no base64 in response");
      return null;
    }

    logger.info(`[Evolution] fetchMediaBase64 success: mimeType=${mimeType}, base64Len=${b64String.length}`);
    return { base64: b64String, mimeType };
  } catch (err) {
    logger.error({ err }, "[Evolution] fetchMediaBase64 error");
    return null;
  }
}
