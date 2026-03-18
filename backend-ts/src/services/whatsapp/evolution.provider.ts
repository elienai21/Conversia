import { IWhatsAppProvider, IncomingWhatsappMessage } from "./provider.interface.js";
import { prisma } from "../../lib/prisma.js";

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

      if (!text) return []; // If there is no text parsed e.g., an image without caption or audio

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

    const serverUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const instanceName = settings?.evolutionInstanceName;
    const apikey = settings?.evolutionInstanceToken || process.env.EVOLUTION_API_KEY;

    if (!serverUrl || !instanceName || !apikey) {
      console.error("[Evolution] Missing serverUrl, instanceName, or apikey for sending message.");
      return;
    }

    const url = `${serverUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`;
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
}
