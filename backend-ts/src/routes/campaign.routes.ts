// src/routes/campaign.routes.ts
// Broadcast / mass-message campaigns. Admin only for creation and execution.
// Agents can VIEW campaigns. Only admins can CREATE / EXECUTE / DELETE.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";
import { logAudit } from "../lib/audit.js";

const createCampaignSchema = z.object({
  name:       z.string().min(1).max(200),
  message:    z.string().min(1).max(4096),
  target_tag: z.string().optional(), // "guest" | "owner" | "staff" | "lead" | undefined = all
  scheduled_at: z.string().datetime().optional(),
});

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /campaigns ────────────────────────────────────────────────────────
  app.get("/", { onRequest: authMiddleware }, async (request, reply) => {
    const { prisma } = request.server.deps;

    const campaigns = await prisma.campaign.findMany({
      where: { tenantId: request.user.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return reply.send(
      campaigns.map((c) => ({
        id:           c.id,
        name:         c.name,
        message:      c.message,
        target_tag:   c.targetTag,
        status:       c.status,
        sent_count:   c.sentCount,
        failed_count: c.failedCount,
        scheduled_at: c.scheduledAt,
        started_at:   c.startedAt,
        completed_at: c.completedAt,
        created_at:   c.createdAt,
      })),
    );
  });

  // ── POST /campaigns ───────────────────────────────────────────────────────
  app.post(
    "/",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const { prisma } = request.server.deps;

      const parsed = createCampaignSchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return reply.status(422).send({ detail: first?.message ?? "Dados inválidos" });
      }

      const campaign = await prisma.campaign.create({
        data: {
          tenantId:    request.user.tenantId,
          name:        parsed.data.name,
          message:     parsed.data.message,
          targetTag:   parsed.data.target_tag ?? null,
          status:      "draft",
          scheduledAt: parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : null,
        },
      });

      void logAudit({
        tenantId: request.user.tenantId,
        userId:   request.user.id,
        action:   "campaign.created",
        entityType: "campaign",
        entityId: campaign.id,
        metadata: { name: campaign.name, target_tag: campaign.targetTag },
        ipAddress: request.ip,
      });

      return reply.status(201).send({
        id:           campaign.id,
        name:         campaign.name,
        message:      campaign.message,
        target_tag:   campaign.targetTag,
        status:       campaign.status,
        sent_count:   campaign.sentCount,
        failed_count: campaign.failedCount,
        created_at:   campaign.createdAt,
      });
    },
  );

  // ── PATCH /campaigns/:id ──────────────────────────────────────────────────
  app.patch(
    "/:id",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const { id } = request.params as { id: string };

      const campaign = await prisma.campaign.findFirst({
        where: { id, tenantId: request.user.tenantId },
      });

      if (!campaign) return reply.status(404).send({ detail: "Campanha não encontrada." });
      if (campaign.status !== "draft") {
        return reply.status(400).send({ detail: "Só é possível editar campanhas no status 'draft'." });
      }

      const parsed = createCampaignSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({ detail: parsed.error.issues[0]?.message });
      }

      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          ...(parsed.data.name       !== undefined && { name:       parsed.data.name }),
          ...(parsed.data.message    !== undefined && { message:    parsed.data.message }),
          ...(parsed.data.target_tag !== undefined && { targetTag:  parsed.data.target_tag ?? null }),
          ...(parsed.data.scheduled_at !== undefined && {
            scheduledAt: parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : null,
          }),
        },
      });

      return reply.send({ id: updated.id, status: updated.status });
    },
  );

  // ── POST /campaigns/:id/execute ───────────────────────────────────────────
  // Immediately sends the campaign message to all matching customers via WhatsApp.
  app.post(
    "/:id/execute",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const { prisma, services } = request.server.deps;
      const { id } = request.params as { id: string };

      const campaign = await prisma.campaign.findFirst({
        where: { id, tenantId: request.user.tenantId },
      });

      if (!campaign) return reply.status(404).send({ detail: "Campanha não encontrada." });
      if (campaign.status === "running") {
        return reply.status(409).send({ detail: "Campanha já está em execução." });
      }
      if (campaign.status === "completed") {
        return reply.status(409).send({ detail: "Campanha já foi executada." });
      }

      // Mark as running immediately and respond
      await prisma.campaign.update({
        where: { id },
        data: { status: "running", startedAt: new Date() },
      });

      reply.status(202).send({ detail: "Campanha iniciada. O disparo ocorre em segundo plano." });

      // ── Background execution (fire and forget) ────────────────────────────
      void (async () => {
        try {
          const where: any = { tenantId: request.user.tenantId };
          if (campaign.targetTag) {
            where.role = campaign.targetTag;
          }

          const customers = await prisma.customer.findMany({
            where,
            select: { phone: true, name: true },
          });

          let sent = 0;
          let failed = 0;

          for (const customer of customers) {
            try {
              // Only send to WhatsApp numbers (not groups)
              if (!customer.phone || customer.phone.includes("@g.us")) { failed++; continue; }
              await services.sendWhatsappMessage(
                request.user.tenantId,
                customer.phone,
                campaign.message,
              );
              sent++;
            } catch {
              failed++;
            }
            // Small delay between messages to avoid rate limits
            await new Promise((res) => setTimeout(res, 300));
          }

          await prisma.campaign.update({
            where: { id },
            data: {
              status:      "completed",
              sentCount:   sent,
              failedCount: failed,
              completedAt: new Date(),
            },
          });

          void logAudit({
            tenantId: request.user.tenantId,
            userId:   request.user.id,
            action:   "campaign.executed",
            entityType: "campaign",
            entityId: id,
            metadata: { sent, failed, target_tag: campaign.targetTag },
          });
        } catch (err) {
          app.log.error({ err }, "[Campaign] Execution error");
          await prisma.campaign.update({
            where: { id },
            data: { status: "failed", completedAt: new Date() },
          }).catch(() => {});
        }
      })();
    },
  );

  // ── DELETE /campaigns/:id ─────────────────────────────────────────────────
  app.delete(
    "/:id",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const { id } = request.params as { id: string };

      const campaign = await prisma.campaign.findFirst({
        where: { id, tenantId: request.user.tenantId },
      });

      if (!campaign) return reply.status(404).send({ detail: "Campanha não encontrada." });
      if (campaign.status === "running") {
        return reply.status(400).send({ detail: "Não é possível excluir uma campanha em execução." });
      }

      await prisma.campaign.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
