import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { getOrCreateVapidKeys } from "../lib/web-push.js";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // GET /vapid-public-key
  // Returns the tenant's VAPID public key so the browser can create a PushSubscription.
  app.get("/vapid-public-key", async (request, reply) => {
    const { tenantId } = request.user;
    const keys = await getOrCreateVapidKeys(tenantId);
    return reply.send({ publicKey: keys.publicKey });
  });

  // POST /subscribe
  // Saves (or updates) a PushSubscription for the authenticated user/device.
  app.post("/subscribe", async (request, reply) => {
    const user = request.user;
    const parsed = subscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid subscription payload" });
    }
    const { endpoint, p256dh, auth, userAgent } = parsed.data;

    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: user.id, endpoint } },
      create: { userId: user.id, tenantId: user.tenantId, endpoint, p256dh, auth, userAgent: userAgent ?? null },
      update: { p256dh, auth, userAgent: userAgent ?? null },
    });

    return reply.status(201).send({ ok: true });
  });

  // DELETE /subscribe?endpoint=...
  // Removes a PushSubscription when the user disables notifications.
  app.delete("/subscribe", async (request, reply) => {
    const user = request.user;
    const query = request.query as { endpoint?: string };
    if (!query?.endpoint) {
      return reply.status(422).send({ detail: "endpoint query param required" });
    }
    await prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint: query.endpoint },
    });
    return reply.status(204).send();
  });

  // GET /status
  // Returns whether the current user has an active push subscription.
  app.get("/status", async (request, reply) => {
    const count = await prisma.pushSubscription.count({ where: { userId: request.user.id } });
    return reply.send({ subscribed: count > 0, count });
  });
}
