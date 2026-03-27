import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";

const upsertSchema = z.object({
  listing_id: z.string().min(1),
  listing_name: z.string().optional(),
  has_garage: z.boolean().optional(),
  has_facial_biometrics: z.boolean().optional(),
});

export async function propertyConfigRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);
  app.addHook("onRequest", requireAdmin);

  // GET /property-configs — list all configs for tenant
  app.get("/", async (request) => {
    const configs = await prisma.propertyConfig.findMany({
      where: { tenantId: request.user.tenantId },
      orderBy: { listingName: "asc" },
    });
    return configs.map((c) => ({
      id: c.id,
      listing_id: c.listingId,
      listing_name: c.listingName,
      has_garage: c.hasGarage,
      has_facial_biometrics: c.hasFacialBiometrics,
      updated_at: c.updatedAt.toISOString(),
    }));
  });

  // PUT /property-configs — upsert by listing_id
  app.put("/", async (request, reply) => {
    const parsed = upsertSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid input", errors: parsed.error.flatten() });
    }

    const { listing_id, listing_name, has_garage, has_facial_biometrics } = parsed.data;

    const config = await prisma.propertyConfig.upsert({
      where: { tenantId_listingId: { tenantId: request.user.tenantId, listingId: listing_id } },
      create: {
        tenantId: request.user.tenantId,
        listingId: listing_id,
        listingName: listing_name ?? null,
        hasGarage: has_garage ?? false,
        hasFacialBiometrics: has_facial_biometrics ?? false,
      },
      update: {
        listingName: listing_name ?? undefined,
        hasGarage: has_garage ?? undefined,
        hasFacialBiometrics: has_facial_biometrics ?? undefined,
      },
    });

    return reply.status(200).send({
      id: config.id,
      listing_id: config.listingId,
      listing_name: config.listingName,
      has_garage: config.hasGarage,
      has_facial_biometrics: config.hasFacialBiometrics,
    });
  });

  // DELETE /property-configs/:listingId
  app.delete<{ Params: { listingId: string } }>("/:listingId", async (request, reply) => {
    const { listingId } = request.params;
    await prisma.propertyConfig.deleteMany({
      where: { tenantId: request.user.tenantId, listingId },
    });
    return reply.status(204).send();
  });
}
