import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { logger } from "../lib/logger.js";

function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = `https://${u}`;
  }
  return u;
}

// Endpoint to manage Integration with Evolution API from the Frontend Settings Page
export async function evolutionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // 1. Get Connection State
  app.get<{}>("/connection", async (request, reply) => {
    const user = request.user;
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!settings || settings.whatsappProvider !== "evolution") {
      return reply.send({ connected: false, state: "disabled" });
    }

    const instanceName = settings.evolutionInstanceName;
    const rawUrl = settings.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const rawToken = settings.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (!instanceName || !rawUrl || !apikey) {
      return reply.send({ connected: false, state: "unconfigured" });
    }

    const serverUrl = normalizeUrl(rawUrl);

    try {
      const fetchUrl = `${serverUrl}/instance/connectionState/${instanceName}`;
      const res = await fetch(fetchUrl, {
        headers: { apikey },
      });

      if (!res.ok) {
        // Instance might not exist on the server
        return reply.send({ connected: false, state: "disconnected" });
      }

      const data = await res.json() as { instance?: { state: string } };
      const state = data?.instance?.state || "disconnected";
      const connected = state === "open";

      // Keep DB synchronized
      if (settings.whatsappConnected !== connected) {
        await prisma.tenantSettings.update({
          where: { tenantId: user.tenantId },
          data: { whatsappConnected: connected },
        });
      }

      return reply.send({ connected, state });
    } catch (err) {
      logger.error({ err }, "[Evolution] Error getting connection state");
      return reply.status(500).send({ error: "Failed to communicate with WhatsApp server" });
    }
  });

  // 2. Connect / Request QR Code
  app.post<{}>("/connect", async (request, reply) => {
    const user = request.user;
    
    // We will ensure the instance exists, and request a QR code.
    // If instance doesn't exist, we create it.
    let settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!settings) {
      settings = await prisma.tenantSettings.create({
        data: { tenantId: user.tenantId, whatsappProvider: "evolution" },
      });
    }

    const rawUrl = settings.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const globalApiKey = process.env.EVOLUTION_API_KEY;
    const rawToken = settings.evolutionInstanceToken;
    const instanceToken = rawToken ? decrypt(rawToken) : globalApiKey;

    if (!rawUrl || !instanceToken) {
      return reply.status(400).send({ error: "Evolution API URL or API Key not configured." });
    }

    const serverUrl = normalizeUrl(rawUrl);

    // Usually, instance name is the tenantSlug or tenantId
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    const instanceName = settings.evolutionInstanceName || `conversia_${tenant?.slug || user.tenantId}`.replace(/[^a-zA-Z0-9_-]/g, "");

    // Update settings if it was null
    if (!settings.evolutionInstanceName) {
      await prisma.tenantSettings.update({
        where: { tenantId: user.tenantId },
        data: {
          evolutionInstanceName: instanceName,
          whatsappProvider: "evolution",
        },
      });
    }

    // Try to connect to existing instance
    try {
      const connectUrl = `${serverUrl}/instance/connect/${instanceName}`;
      const connectRes = await fetch(connectUrl, {
        method: "GET",
        headers: { apikey: instanceToken },
      });

      if (connectRes.ok) {
        const data = await connectRes.json() as { base64?: string, instance?: { state: string } };
        // If it's already connected, base64 might be empty and state will be "open"
        if (data?.instance?.state === "open") {
           // Already connected
           await prisma.tenantSettings.update({
             where: { tenantId: user.tenantId },
             data: { whatsappConnected: true },
           });
           return reply.send({ connected: true });
        }
        
        if (data.base64) {
          return reply.send({ connected: false, qrCode: data.base64 });
        }
      }

      // If we got 404 or instance doesn't exist, create it
      if (connectRes.status === 404 || connectRes.status === 400 || connectRes.status === 403) {
        // Create instance
        const createUrl = `${serverUrl}/instance/create`;
        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            apikey: globalApiKey || instanceToken,
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
          }),
        });

        if (!createRes.ok) {
          const body = await createRes.text();
          logger.error(`Failed to create instance: ${body}`);
          return reply.status(500).send({ error: "Failed to create WhatsApp instance" });
        }

        const createData = await createRes.json() as { qrcode?: { base64: string }, hash?: { apikey: string } };
        
        // If a specific apikey for this instance is generated, we can optionally save it.
        // For simplicity, we just return the QR
        return reply.send({ connected: false, qrCode: createData.qrcode?.base64 });
      }

      return reply.status(500).send({ error: "Failed to get QR Code" });

    } catch (err) {
      logger.error({ err }, "[Evolution] Connect error");
      return reply.status(500).send({ error: "Failed to connect to WhatsApp provider" });
    }
  });

  // 3. Disconnect / Logout
  app.delete<{}>("/disconnect", async (request, reply) => {
    const user = request.user;
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!settings || !settings.evolutionInstanceName) {
      return reply.send({ success: true });
    }

    const instanceName = settings.evolutionInstanceName;
    const rawUrl = settings.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const rawToken = settings.evolutionInstanceToken;
    const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

    if (rawUrl && apikey) {
      const serverUrl = normalizeUrl(rawUrl);
      try {
        const logoutUrl = `${serverUrl}/instance/logout/${instanceName}`;
        await fetch(logoutUrl, {
          method: "DELETE",
          headers: { apikey },
        });
      } catch (err) {
        logger.error({ err }, "Failed to logout instance");
      }
    }

    // Mark as disconnected
    await prisma.tenantSettings.update({
      where: { tenantId: user.tenantId },
      data: { whatsappConnected: false },
    });

    return reply.send({ success: true });
  });

  // 4. Get media content from a message (proxy to Evolution API)
  app.get<{ Params: { messageId: string } }>(
    "/media/:messageId",
    async (request, reply) => {
      const user = request.user;
      const { messageId } = request.params;

      // Find the message and its attachment
      const message = await prisma.message.findFirst({
        where: { id: messageId, conversation: { tenantId: user.tenantId } },
        include: { attachments: true, conversation: true },
      });

      if (!message || !message.externalId) {
        return reply.status(404).send({ detail: "Message not found" });
      }

      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
      });

      const rawUrl = settings?.evolutionServerUrl || process.env.EVOLUTION_API_URL;
      const instanceName = settings?.evolutionInstanceName;
      const rawToken = settings?.evolutionInstanceToken;
      const apikey = rawToken ? decrypt(rawToken) : process.env.EVOLUTION_API_KEY;

      if (!rawUrl || !instanceName || !apikey) {
        return reply.status(400).send({ detail: "Evolution API not configured" });
      }

      const serverUrl = normalizeUrl(rawUrl);

      try {
        const res = await fetch(`${serverUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey,
          },
          body: JSON.stringify({
            message: {
              key: { id: message.externalId },
            },
            convertToMp4: false,
          }),
        });

        if (!res.ok) {
          const bodyText = await res.text();
          logger.error(`[Evolution] getBase64FromMediaMessage failed (${res.status}): ${bodyText}`);
          return reply.status(502).send({ detail: "Failed to fetch media from WhatsApp" });
        }

        const data = await res.json() as {
          base64?: string;
          mimetype?: string;
          fileName?: string;
          mediaType?: string;
        };

        if (!data.base64) {
          return reply.status(404).send({ detail: "Media not available" });
        }

        const mimeType = data.mimetype || message.attachments[0]?.mimeType || "application/octet-stream";
        const buffer = Buffer.from(data.base64, "base64");

        reply.header("Content-Type", mimeType);
        reply.header("Content-Length", buffer.length);
        reply.header("Cache-Control", "public, max-age=86400");
        return reply.send(buffer);
      } catch (err) {
        logger.error({ err }, "[Evolution] Media proxy error");
        return reply.status(502).send({ detail: "Failed to fetch media" });
      }
    },
  );
}
