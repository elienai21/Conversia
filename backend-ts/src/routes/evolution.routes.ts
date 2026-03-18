import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

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
    const serverUrl = settings.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const apikey = settings.evolutionInstanceToken || process.env.EVOLUTION_API_KEY;

    if (!instanceName || !serverUrl || !apikey) {
      return reply.send({ connected: false, state: "unconfigured" });
    }

    try {
      const fetchUrl = `${serverUrl.replace(/\/$/, '')}/instance/connectionState/${instanceName}`;
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
      console.error("[Evolution] Error getting connection state:", err);
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

    const serverUrl = settings.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const globalApiKey = process.env.EVOLUTION_API_KEY;
    const instanceToken = settings.evolutionInstanceToken || globalApiKey;

    if (!serverUrl || !instanceToken) {
      return reply.status(400).send({ error: "Evolution API URL or API Key not configured." });
    }

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
      const connectUrl = `${serverUrl.replace(/\/$/, '')}/instance/connect/${instanceName}`;
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
        const createUrl = `${serverUrl.replace(/\/$/, '')}/instance/create`;
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
          console.error("Failed to create instance:", body);
          return reply.status(500).send({ error: "Failed to create WhatsApp instance" });
        }

        const createData = await createRes.json() as { qrcode?: { base64: string }, hash?: { apikey: string } };
        
        // If a specific apikey for this instance is generated, we can optionally save it.
        // For simplicity, we just return the QR
        return reply.send({ connected: false, qrCode: createData.qrcode?.base64 });
      }

      return reply.status(500).send({ error: "Failed to get QR Code" });

    } catch (err) {
      console.error("[Evolution] Connect error:", err);
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
    const serverUrl = settings.evolutionServerUrl || process.env.EVOLUTION_API_URL;
    const apikey = process.env.EVOLUTION_API_KEY || settings.evolutionInstanceToken;

    if (serverUrl && apikey) {
      try {
        const logoutUrl = `${serverUrl.replace(/\/$/, '')}/instance/logout/${instanceName}`;
        await fetch(logoutUrl, {
          method: "DELETE",
          headers: { apikey },
        });
      } catch (err) {
        console.error("Failed to logout instance", err);
      }
    }

    // Mark as disconnected
    await prisma.tenantSettings.update({
      where: { tenantId: user.tenantId },
      data: { whatsappConnected: false },
    });

    return reply.send({ success: true });
  });
}
