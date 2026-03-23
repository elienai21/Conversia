import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { uploadMediaToStorage } from "../lib/storage.js";

const submitFormSchema = z.object({
  fullName:      z.string().min(2).max(100),
  document:      z.string().min(3).max(30),  // CPF or passport number
  documentType:  z.enum(["cpf", "passport", "rg"]),
  nationality:   z.string().min(2).max(60).optional(),
  birthDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone:         z.string().min(8).max(20).optional(),
  photoDocFront: z.string().optional(), // base64 dataURL
  photoDocBack:  z.string().optional(), // base64 dataURL
});

export async function publicCheckinRoutes(app: FastifyInstance): Promise<void> {
  // No authMiddleware — these routes are intentionally public

  // ─── GET /public/checkin/:token ──────────────────────────────────────────
  // Returns basic reservation info so the guest sees their own data.
  app.get<{ Params: { token: string } }>("/:token", async (request, reply) => {
    const { token } = request.params;

    const task = await prisma.taskQueue.findUnique({
      where: { magicToken: token },
      select: {
        id: true,
        type: true,
        customerName: true,
        reservationId: true,
        scheduledFor: true,
        guestFormAt: true,
        status: true,
        tenant: { select: { name: true } },
      },
    });

    if (!task) {
      return reply.status(404).send({ detail: "Link inválido ou expirado." });
    }

    if (task.status === "cancelled") {
      return reply.status(410).send({ detail: "Esta reserva foi cancelada." });
    }

    // Already submitted — let the guest see a confirmation
    if (task.guestFormAt) {
      return reply.send({
        alreadySubmitted: true,
        guestName: task.customerName,
        propertyName: task.tenant.name,
        submittedAt: task.guestFormAt.toISOString(),
      });
    }

    return reply.send({
      alreadySubmitted: false,
      guestName: task.customerName,
      propertyName: task.tenant.name,
      reservationId: task.reservationId,
      type: task.type,
      scheduledFor: task.scheduledFor.toISOString(),
    });
  });

  // ─── POST /public/checkin/:token ─────────────────────────────────────────
  // Guest submits the form (name, document, optional photos).
  app.post<{ Params: { token: string } }>("/:token", async (request, reply) => {
    const { token } = request.params;

    const task = await prisma.taskQueue.findUnique({
      where: { magicToken: token },
      select: { id: true, status: true, guestFormAt: true, tenantId: true },
    });

    if (!task) {
      return reply.status(404).send({ detail: "Link inválido ou expirado." });
    }

    if (task.status === "cancelled") {
      return reply.status(410).send({ detail: "Esta reserva foi cancelada." });
    }

    if (task.guestFormAt) {
      return reply.status(409).send({ detail: "Formulário já enviado anteriormente." });
    }

    const parsed = submitFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Dados inválidos.", errors: parsed.error.flatten() });
    }

    const { photoDocFront, photoDocBack, ...formFields } = parsed.data;

    // Upload document photos to Supabase Storage (if provided)
    let photoFrontUrl: string | null = null;
    let photoBackUrl: string | null = null;

    if (photoDocFront?.startsWith("data:image/")) {
      const [meta, b64] = photoDocFront.split(",");
      const mimeMatch = meta.match(/data:(image\/[a-z+]+);/);
      if (mimeMatch && b64) {
        photoFrontUrl = await uploadMediaToStorage(
          b64,
          mimeMatch[1],
          `checkin_doc_front_${task.id}.jpg`
        );
      }
    }

    if (photoDocBack?.startsWith("data:image/")) {
      const [meta, b64] = photoDocBack.split(",");
      const mimeMatch = meta.match(/data:(image\/[a-z+]+);/);
      if (mimeMatch && b64) {
        photoBackUrl = await uploadMediaToStorage(
          b64,
          mimeMatch[1],
          `checkin_doc_back_${task.id}.jpg`
        );
      }
    }

    const guestFormData = JSON.stringify({
      ...formFields,
      photoFrontUrl,
      photoBackUrl,
      submittedAt: new Date().toISOString(),
    });

    await prisma.taskQueue.update({
      where: { id: task.id },
      data: {
        guestFormData,
        guestFormAt: new Date(),
      },
    });

    logger.info(`[PublicCheckin] Formulário enviado — task ${task.id} | tenant ${task.tenantId}`);

    return reply.status(200).send({ success: true });
  });
}
