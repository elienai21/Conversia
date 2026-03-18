import type { MessageAttachmentInput } from "./whatsapp/provider.interface.js";
import { config } from "../config.js";

export interface IncomingInstagramMessage {
  senderId: string;
  messageId: string;
  text: string;
  pageId: string;
  attachments?: MessageAttachmentInput[];
}

export function parseIncomingInstagramMessage(
  body: Record<string, unknown>,
): IncomingInstagramMessage | null {
  try {
    const entry = body.entry as Array<Record<string, unknown>> | undefined;
    if (!entry?.[0]) return null;

    const pageId = entry[0].id as string;

    const messaging = entry[0].messaging as
      | Array<Record<string, unknown>>
      | undefined;
    if (!messaging?.[0]) return null;

    const event = messaging[0];

    // Filter out echo messages (sent by us)
    const message = event.message as Record<string, unknown> | undefined;
    if (!message) return null;
    if (message.is_echo) return null;

    const attachments = extractInstagramAttachments(message);
    const text = (message.text as string | undefined) ?? (attachments[0] ? `[${attachments[0].type}]` : undefined);
    if (!text) return null;

    const sender = event.sender as Record<string, string> | undefined;
    if (!sender?.id) return null;

    return {
      senderId: sender.id,
      messageId: (message.mid as string) ?? "",
      text,
      pageId,
      attachments,
    };
  } catch {
    return null;
  }
}

export async function resolveInstagramTenant(pageId: string) {
  const { prisma } = await import("../lib/prisma.js");

  return prisma.tenant.findFirst({
    where: { instagramPageId: pageId },
  });
}

export function instagramCustomerId(igsid: string): string {
  return `ig:${igsid}`;
}

export async function sendInstagramMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const url = `${config.WHATSAPP_API_URL}/me/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Instagram send failed (${response.status}):`, body);
    }
  } catch (err) {
    console.error("Instagram send error:", err);
  }
}

function extractInstagramAttachments(
  message: Record<string, unknown>,
): MessageAttachmentInput[] {
  const attachments = message.attachments as Array<Record<string, unknown>> | undefined;
  if (!attachments?.length) {
    return [];
  }

  return attachments.flatMap((attachment) => {
      const type = attachment.type as MessageAttachmentInput["type"] | undefined;
      const payload = attachment.payload as Record<string, unknown> | undefined;
      if (!type || !["image", "video", "audio", "document"].includes(type)) {
        return [];
      }

      return [{
        type,
        sourceUrl: payload?.url as string | undefined,
      } satisfies MessageAttachmentInput];
    });
}
