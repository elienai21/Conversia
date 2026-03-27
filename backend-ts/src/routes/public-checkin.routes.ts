import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { uploadMediaToStorage } from "../lib/storage.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";
import { saveMessage } from "../services/message.service.js";
import { notifyAgentsNewMessage, notifyAgentsUpsell } from "../services/push.service.js";
import { decrypt } from "../lib/encryption.js";
import type { WinkerVisitPayload } from "../adapters/winker/winker.adapter.js";

const submitFormSchema = z.object({
  fullName:           z.string().min(2).max(100),
  document:           z.string().min(3).max(30),
  documentType:       z.enum(["cpf", "passport", "rg"]),
  nationality:        z.string().min(2).max(60).optional(),
  birthDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone:              z.string().min(8).max(20).optional(),
  photoDocFront:      z.string().optional(), // base64 dataURL
  photoDocBack:       z.string().optional(), // base64 dataURL
  // Garage fields
  vehiclePlate:       z.string().max(20).optional(),
  vehicleBrand:       z.string().max(50).optional(),
  vehicleModel:       z.string().max(50).optional(),
  vehicleColor:       z.string().max(30).optional(),
  // Facial biometrics
  photoFacial:        z.string().optional(), // base64 dataURL
});

/**
 * Fire-and-forget: syncs submitted guest data back to the CRM (Stays.net).
 * Fetches the reservation to find `_idclient`, then PATCHes the client record.
 */
async function writeBackToCrm(
  taskId: string,
  tenantId: string,
  reservationId: string,
  formFields: { fullName: string; document: string; documentType: string; nationality?: string; birthDate?: string; phone?: string },
  photoFrontUrl: string | null,
  photoBackUrl: string | null,
): Promise<void> {
  const adapterRes = await CrmAdapterFactory.getAdapter(tenantId);
  if (!adapterRes.ok) {
    logger.warn(`[WriteBack] task ${taskId}: CRM não configurado — ${adapterRes.error.message}`);
    return;
  }

  const crm = adapterRes.value;

  // 1. Fetch reservation to get _idclient
  const resResult = await crm.getReservation(reservationId);
  if (!resResult.ok) {
    logger.warn(`[WriteBack] task ${taskId}: Falha ao buscar reserva ${reservationId} — ${resResult.error.message}`);
    return;
  }

  const reservation = resResult.value as Record<string, unknown>;
  const clientId = String(reservation["_idclient"] ?? reservation["clientId"] ?? "");
  if (!clientId) {
    logger.warn(`[WriteBack] task ${taskId}: Reserva ${reservationId} sem _idclient — write-back ignorado`);
    return;
  }

  // 2. Build update payload for Stays.net client
  const updateData: Record<string, unknown> = {};

  // Name
  const nameParts = formFields.fullName.split(" ");
  updateData["fName"] = nameParts[0] ?? formFields.fullName;
  updateData["lName"] = nameParts.slice(1).join(" ") || "";

  // Document
  if (formFields.documentType === "cpf") {
    updateData["cpf"] = formFields.document;
  } else {
    updateData["document"] = formFields.document;
    updateData["documentType"] = formFields.documentType;
  }

  if (formFields.nationality) updateData["nationality"] = formFields.nationality;
  if (formFields.birthDate) updateData["birthDate"] = formFields.birthDate;
  if (formFields.phone) updateData["phone"] = formFields.phone;

  // Document photo URLs (stored as custom fields or notes depending on CRM support)
  if (photoFrontUrl) updateData["documentPhotoFront"] = photoFrontUrl;
  if (photoBackUrl) updateData["documentPhotoBack"] = photoBackUrl;

  // 3. PATCH the client
  const updateRes = await crm.updateClient(clientId, updateData);
  if (!updateRes.ok) {
    logger.warn(`[WriteBack] task ${taskId}: Falha ao atualizar cliente ${clientId} — ${updateRes.error.message}`);
    return;
  }

  logger.info(`[WriteBack] task ${taskId}: Dados do hóspede sincronizados com sucesso (cliente ${clientId})`);
}

/**
 * Fire-and-forget: registers the guest as a visit forecast in Winker gatekeeper.
 *
 * Portal resolution priority:
 *   1. PropertyConfig.winkerPortalId for this specific apartment (listingId)
 *   2. TenantSettings.winkerPortalId as fallback (global default)
 * This supports tenants that manage apartments in multiple different condominiums,
 * each with a distinct Winker portal (id_portal).
 */
async function syncToWinker(
  taskId: string,
  tenantId: string,
  listingId: string | null,
  formData: z.infer<typeof submitFormSchema>,
): Promise<void> {
  // 1. Get tenant-level Winker settings (API token + fallback portal)
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.winkerApiToken) return; // Winker not configured at all

  let apiToken: string;
  try {
    apiToken = decrypt(settings.winkerApiToken);
  } catch {
    logger.warn(`[Winker] task ${taskId}: Falha ao decriptar token`);
    return;
  }

  // 2. Resolve the correct portal ID for this specific apartment
  let resolvedPortalId: string | null = settings.winkerPortalId ?? null;
  let resolvedUnitId: string | null = null;

  if (listingId) {
    const propCfg = await prisma.propertyConfig.findUnique({
      where: { tenantId_listingId: { tenantId, listingId } },
      select: { winkerPortalId: true, winkerUnitId: true, listingName: true },
    });
    if (propCfg?.winkerPortalId) {
      resolvedPortalId = propCfg.winkerPortalId;
      logger.info(`[Winker] task ${taskId}: Usando portal ${resolvedPortalId} (imóvel ${listingId} — ${propCfg.listingName ?? ""})`);
    }
    if (propCfg?.winkerUnitId) {
      resolvedUnitId = propCfg.winkerUnitId;
    }
  }

  if (!resolvedPortalId) {
    logger.warn(`[Winker] task ${taskId}: Portal não configurado para imóvel "${listingId}" e sem fallback global — registro ignorado`);
    return;
  }

  const { WinkerAdapter } = await import("../adapters/winker/winker.adapter.js");
  const winker = new WinkerAdapter({ apiToken, portalId: resolvedPortalId });

  const visitPayload: WinkerVisitPayload = {
    name: formData.fullName,
    document: formData.document,
    document_type: formData.documentType,
    phone: formData.phone,
    ...(resolvedUnitId && { id_unit: resolvedUnitId }),
    ...(formData.vehiclePlate && { vehicle_plate: formData.vehiclePlate }),
    ...(formData.vehicleBrand && { vehicle_brand: formData.vehicleBrand }),
    ...(formData.vehicleModel && { vehicle_model: formData.vehicleModel }),
    ...(formData.vehicleColor && { vehicle_color: formData.vehicleColor }),
  };

  const result = await winker.registerVisit(visitPayload);
  if (!result.ok) {
    logger.warn(`[Winker] task ${taskId}: Falha ao registrar visita — ${result.error.message}`);
    return;
  }
  logger.info(`[Winker] task ${taskId}: Hóspede "${formData.fullName}" registrado no portal ${resolvedPortalId} (imóvel ${listingId ?? "?"})`);
}

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
        listingId: true,
        requiredFields: true,
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

    const requiredFields = task.requiredFields
      ? (JSON.parse(task.requiredFields) as { hasGarage?: boolean; hasFacialBiometrics?: boolean })
      : null;

    return reply.send({
      alreadySubmitted: false,
      guestName: task.customerName,
      propertyName: task.tenant.name,
      reservationId: task.reservationId,
      type: task.type,
      scheduledFor: task.scheduledFor.toISOString(),
      required_fields: {
        has_garage: requiredFields?.hasGarage ?? false,
        has_facial_biometrics: requiredFields?.hasFacialBiometrics ?? false,
      },
    });
  });

  // ─── POST /public/checkin/:token ─────────────────────────────────────────
  // Guest submits the form (name, document, optional photos).
  app.post<{ Params: { token: string } }>("/:token", async (request, reply) => {
    const { token } = request.params;

    const task = await prisma.taskQueue.findUnique({
      where: { magicToken: token },
      select: { id: true, status: true, guestFormAt: true, tenantId: true, reservationId: true, listingId: true },
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

    const { photoDocFront, photoDocBack, photoFacial, ...formFields } = parsed.data;

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

    let photoFacialUrl: string | null = null;
    if (photoFacial?.startsWith("data:image/")) {
      const [meta, b64] = photoFacial.split(",");
      const mimeMatch = meta.match(/data:(image\/[a-z+]+);/);
      if (mimeMatch && b64) {
        photoFacialUrl = await uploadMediaToStorage(
          b64,
          mimeMatch[1],
          `checkin_facial_${task.id}.jpg`
        );
      }
    }

    const guestFormData = JSON.stringify({
      ...formFields,
      photoFrontUrl,
      photoBackUrl,
      photoFacialUrl,
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

    // Fire-and-forget: sync guest data back to CRM (non-blocking)
    writeBackToCrm(task.id, task.tenantId, task.reservationId, formFields, photoFrontUrl, photoBackUrl).catch((err) =>
      logger.warn({ err }, `[PublicCheckin] Write-back falhou para task ${task.id}`)
    );

    // Fire-and-forget: register guest in Winker gatekeeper (non-blocking)
    syncToWinker(task.id, task.tenantId, task.listingId, parsed.data).catch((err) =>
      logger.warn({ err }, `[PublicCheckin] Winker sync falhou para task ${task.id}`)
    );

    return reply.status(200).send({ success: true });
  });

  // ─── POST /public/checkin/:token/upsell ─────────────────────────────────
  app.post<{ Params: { token: string }; Body: { service: string } }>(
    "/:token/upsell",
    async (request, reply) => {
      const { token } = request.params;
      const { service } = request.body;

      const task = await prisma.taskQueue.findUnique({
        where: { id: token },
      });

      if (!task || task.type !== "checkin_hoje") {
         // The error returned tells the UI it failed or not.
        return reply.status(404).send({ detail: "Link não encontrado ou expirou." });
      }

      const customer = await prisma.customer.findUnique({
        where: { tenantId_phone: { tenantId: task.tenantId, phone: task.customerPhone } }
      });

      let conversationId = null;
      if (customer) {
        const conv = await prisma.conversation.findFirst({
           where: { tenantId: task.tenantId, customerId: customer.id },
           orderBy: { updatedAt: 'desc' }
        });
        conversationId = conv?.id;
      }

      if (!conversationId) {
        return reply.status(412).send({ detail: "Conversa não localizada." });
      }

      const messageText = `🎯 *Upsell Solicitado*\nO hóspede solicitou: **${service}**.\nAcione para enviar os detalhes/link de pagamento.`;
      const message = await saveMessage({
        conversationId,
        senderType: "system",
        text: messageText,
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: "queued", priority: "urgent" },
      });

      const { socket } = request.server.deps;

      socket.emitToConversation(conversationId, "message.new", {
        id: message.id,
        conversation_id: message.conversationId,
        sender_type: message.senderType,
        original_text: message.originalText,
        created_at: message.createdAt,
        translations: [],
        attachments: [],
      });

      socket.emitToTenant(task.tenantId, "conversation.updated", {
        type: "queued",
        conversationId,
      });

      let guestNameStr = "Hóspede";
      if (task.guestFormData) {
        try {
          const parsedForm = JSON.parse(task.guestFormData);
          guestNameStr = parsedForm.fullName || "Hóspede";
        } catch(e) {}
      }

      // Dedicated upsell push notification (type: upsell_sold)
      notifyAgentsUpsell(task.tenantId, {
        conversationId,
        customerName: guestNameStr,
        service,
      });

      // Real-time event for sidebar upsell counter
      socket.emitToTenant(task.tenantId, "upsell.new", {
        conversationId,
        customerName: guestNameStr,
        service,
      });

      return reply.status(200).send({ success: true });
    }
  );
}

