import { prisma } from "../lib/prisma.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";
import { logger } from "../lib/logger.js";

export interface TaskSyncSummary {
  tenantsScanned: number;
  reservationsFound: number;
  tasksCreated: number;
  errors: string[];
}

// Triggers: 'checkin', 'checkout'
export async function runDailyTaskSync(): Promise<TaskSyncSummary> {
  logger.info("[TaskWorker] Iniciando sincronização diária de missões...");

  const today = new Date();
  const dateTodayStr = toDateStr(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateTomorrowStr = toDateStr(tomorrow);

  const summary: TaskSyncSummary = {
    tenantsScanned: 0,
    reservationsFound: 0,
    tasksCreated: 0,
    errors: [],
  };

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    summary.tenantsScanned = tenants.length;

    for (const tenant of tenants) {
      const adapterRes = await CrmAdapterFactory.getAdapter(tenant.id);
      if (!adapterRes.ok) {
        logger.debug(`[TaskWorker] Tenant ${tenant.id} sem CRM configurado — ignorado.`);
        continue;
      }

      const crm = adapterRes.value;
      logger.info(
        `[TaskWorker] Buscando reservas para Tenant ${tenant.id} | filtro local: checkin/checkout em ${dateTodayStr} ou ${dateTomorrowStr}`
      );

      // Strategy: fetch ALL active reservations without date params, then filter locally.
      // Stays.net's from/to params filter by booking-creation date (not check-in date),
      // so guests who booked weeks ago with check-in today would be missed.
      // Stays.net also rejects unknown query params (e.g. 'limit') with 400 error.
      const searchRes = await crm.searchActiveReservations({});

      if (!searchRes.ok) {
        const msg = `Tenant ${tenant.id}: falha ao ler reservas — ${searchRes.error.message}`;
        logger.error(`[TaskWorker] ${msg}`);
        summary.errors.push(msg);
        continue;
      }

      const reservations = searchRes.value;
      summary.reservationsFound += reservations.length;

      logger.info(
        `[TaskWorker] Tenant ${tenant.id}: ${reservations.length} reservas recebidas da Stays (sem filtro de data — filtro local aplicado).`
      );

      // Log the first reservation structure for diagnostics (once per tenant per sync)
      if (reservations.length > 0) {
        const firstR = reservations[0] as Record<string, unknown>;
        logger.info(
          { firstReservationKeys: Object.keys(firstR), firstReservationSample: firstR },
          "[TaskWorker] Estrutura da primeira reserva (diagnóstico)"
        );
      }

      for (const res of reservations) {
        const r = res as Record<string, unknown>;

        // --- ID: Stays uses _id (MongoDB ObjectId) ---
        const resId = String(
          r["_id"] ?? r["id"] ?? r["reservationId"] ?? r["reservation_id"] ?? ""
        );
        if (!resId) {
          logger.warn("[TaskWorker] Reserva sem ID — ignorada");
          continue;
        }

        // --- Dates: try multiple possible field names ---
        // Stays.net can return ISO strings like "2025-01-15T00:00:00.000Z" or "2025-01-15"
        const checkIn = extractDateStr(
          r["checkin"] ?? r["checkIn"] ?? r["checkInDate"] ?? r["check_in"] ?? r["_checkin"]
        );
        const checkOut = extractDateStr(
          r["checkout"] ?? r["checkOut"] ?? r["checkOutDate"] ?? r["check_out"] ?? r["_checkout"]
        );

        if (!checkIn || !checkOut) {
          logger.info(
            { resId, fields: Object.keys(r), rawCheckin: r["checkin"] ?? r["checkIn"] ?? r["_checkin"] ?? r["check_in"] ?? "N/A" },
            "[TaskWorker] SKIP: reserva sem datas reconhecíveis"
          );
          continue;
        }

        // Local date filter: only process reservations relevant to today/tomorrow
        const isRelevant =
          checkIn === dateTodayStr ||
          checkIn === dateTomorrowStr ||
          checkOut === dateTodayStr ||
          checkOut === dateTomorrowStr;

        if (!isRelevant) {
          // Only log first few to avoid noise
          logger.info(
            { resId, checkIn, checkOut, esperado: `${dateTodayStr} ou ${dateTomorrowStr}` },
            "[TaskWorker] SKIP: datas fora do range hoje/amanhã"
          );
          continue;
        }

        logger.info({ resId, checkIn, checkOut }, "[TaskWorker] Reserva RELEVANTE encontrada — verificando hóspede");

        // --- Guests: try multiple structures ---
        const guest = extractPrimaryGuest(r);
        if (!guest) {
          logger.info(
            { resId, guestKeys: Object.keys((r["guestsDetails"] as Record<string, unknown> ?? r["guest"] ?? {}) as Record<string, unknown>) },
            "[TaskWorker] SKIP: reserva sem hóspede com telefone"
          );
          continue;
        }

        const { name, phone } = guest;

        let created = 0;

        if (checkIn === dateTomorrowStr) {
          const payload = `Olá ${name}! Passando pra lembrar que seu Check-in no imóvel está agendado para amanhã. Confira o GUIA DA CASA e a senha de destravamento de porta aqui no Chat!\nQualquer dúvida, a equipe está 100% à disposição.`;
          if (await persistTask(tenant.id, resId, "checkin_amanha", name, phone, payload)) created++;
        }

        if (checkIn === dateTodayStr) {
          const payload = `Olá ${name}! Chegou o grande dia do seu Check-in! Estamos ansiosos para te receber. Aqui está a senha da fechadura eletrônica e o Guia da Casa.\nDesejamos uma excelente estadia!`;
          if (await persistTask(tenant.id, resId, "checkin_hoje", name, phone, payload)) created++;
        }

        if (checkOut === dateTomorrowStr) {
          const payload = `Olá ${name}! Passando pra lembrar que seu Check-out é amanhã até as 11h. Esperamos que esteja aproveitando muito a estadia! Por favor, lembre-se de conferir seus pertences antes de sair.`;
          if (await persistTask(tenant.id, resId, "checkout_amanha", name, phone, payload)) created++;
        }

        if (checkOut === dateTodayStr) {
          const payload = `Olá ${name}! Esperamos que sua estadia tenha sido maravilhosa. Como você fez seu checkout hoje, gostaríamos de sua avaliação.\nComo mimo, oferecemos 10% de desconto na sua próxima viagem conosco usando o cupom RETURN10!`;
          if (await persistTask(tenant.id, resId, "checkout_hoje", name, phone, payload)) created++;
        }

        summary.tasksCreated += created;
      }

      // Update lastTaskSyncAt on tenant settings
      await prisma.tenantSettings.updateMany({
        where: { tenantId: tenant.id },
        data: { lastTaskSyncAt: new Date() },
      });
    }

    logger.info(
      { summary },
      "[TaskWorker] Sincronização finalizada."
    );
  } catch (err) {
    logger.error({ err }, "[TaskWorker] Sync FAILED");
    summary.errors.push(err instanceof Error ? err.message : String(err));
  }

  return summary;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Accepts ISO string ("2025-01-15T00:00:00.000Z") or already-plain date ("2025-01-15") */
function extractDateStr(value: unknown): string | null {
  if (!value) return null;
  const str = String(value);
  // ISO timestamp → slice to date part
  if (str.length >= 10) return str.slice(0, 10);
  return null;
}

/** Tries multiple possible guest list structures from Stays.net */
function extractPrimaryGuest(r: Record<string, unknown>): { name: string; phone: string } | null {
  // Structure 1: guestsDetails.list (current assumption)
  const guestsDetails = r["guestsDetails"] as Record<string, unknown> | undefined;
  if (guestsDetails?.list && Array.isArray(guestsDetails.list)) {
    const guest = findPrimaryFromList(guestsDetails.list);
    if (guest) return guest;
  }

  // Structure 2: guests array directly
  const guestsDirect = r["guests"] as unknown[] | undefined;
  if (Array.isArray(guestsDirect) && guestsDirect.length > 0) {
    const guest = findPrimaryFromList(guestsDirect);
    if (guest) return guest;
  }

  // Structure 3: guest object directly on reservation
  const guestObj = r["guest"] as Record<string, unknown> | undefined;
  if (guestObj) {
    const name = extractName(guestObj);
    const phone = extractPhone(guestObj);
    if (name && phone) return { name, phone };
  }

  // Structure 4: mainGuest
  const mainGuest = r["mainGuest"] as Record<string, unknown> | undefined;
  if (mainGuest) {
    const name = extractName(mainGuest);
    const phone = extractPhone(mainGuest);
    if (name && phone) return { name, phone };
  }

  // Structure 5: contact or client (plain key)
  const contact = (r["contact"] ?? r["client"]) as Record<string, unknown> | undefined;
  if (contact) {
    const name = extractName(contact);
    const phone = extractPhone(contact);
    if (name && phone) return { name, phone };
  }

  // Structure 6: _client (Stays.net MongoDB underscore convention)
  const staysClient = r["_client"] as Record<string, unknown> | undefined;
  if (staysClient) {
    const name = extractName(staysClient);
    const phone = extractPhone(staysClient);
    // Log structure for debugging when phone is missing
    logger.info(
      { clientKeys: Object.keys(staysClient), hasPhones: Array.isArray(staysClient["phones"]) },
      "[TaskWorker] _client encontrado"
    );
    if (name && phone) return { name, phone };
  }

  // Structure 7: _guestsDetails (Stays.net underscore prefix variant)
  const staysGuests = r["_guestsDetails"] as Record<string, unknown> | undefined;
  if (staysGuests?.list && Array.isArray(staysGuests.list)) {
    const guest = findPrimaryFromList(staysGuests.list);
    if (guest) return guest;
  }

  // Structure 8: log all top-level keys to diagnose unknown structure
  logger.info(
    { resId: r["_id"] ?? r["id"], topLevelKeys: Object.keys(r) },
    "[TaskWorker] Nenhuma estrutura de hóspede reconhecida — chaves disponíveis"
  );

  return null;
}

function findPrimaryFromList(list: unknown[]): { name: string; phone: string } | null {
  const gList = list as Array<Record<string, unknown>>;
  const primary = gList.find((g) => g["primary"] === true || g["isPrimary"] === true) ?? gList[0];
  if (!primary) return null;

  const name = extractName(primary);
  const phone = extractPhone(primary);
  if (!phone) return null;

  return { name: name || "Hóspede", phone };
}

function extractName(obj: Record<string, unknown>): string {
  if (obj["name"]) return String(obj["name"]);
  if (obj["fullName"]) return String(obj["fullName"]);
  if (obj["full_name"]) return String(obj["full_name"]);
  const first = (obj["firstName"] ?? obj["firstname"] ?? obj["first_name"] ?? "") as string;
  const last = (obj["lastName"] ?? obj["lastname"] ?? obj["last_name"] ?? "") as string;
  const combined = `${first} ${last}`.trim();
  return combined || "Hóspede";
}

function extractPhone(obj: Record<string, unknown>): string {
  // phones array: [{ iso, value, ... }]
  const phones = obj["phones"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(phones) && phones.length > 0) {
    const raw = String(phones[0]["iso"] ?? phones[0]["value"] ?? phones[0]["number"] ?? "");
    const digits = raw.replace(/\D/g, "");
    if (digits) return digits;
  }

  // phone string directly
  const phoneFields = ["phone", "phoneNumber", "phone_number", "mobile", "celular", "whatsapp"];
  for (const field of phoneFields) {
    if (obj[field]) {
      const digits = String(obj[field]).replace(/\D/g, "");
      if (digits) return digits;
    }
  }

  return "";
}

async function persistTask(
  tenantId: string,
  reservationId: string,
  type: string,
  customerName: string,
  customerPhone: string,
  messagePayload: string,
): Promise<boolean> {
  try {
    const result = await prisma.taskQueue.upsert({
      where: {
        tenantId_reservationId_type: { tenantId, reservationId, type },
      },
      update: {},
      create: {
        tenantId,
        type,
        customerName,
        customerPhone,
        reservationId,
        scheduledFor: new Date(),
        messagePayload,
        status: "pending",
      },
    });
    logger.debug(`[TaskWorker] Task persistida: ${type} para ${customerName} (reserva ${reservationId})`);
    return !!result;
  } catch (err) {
    logger.error({ err }, `[TaskWorker] Erro ao persistir task ${type} reserva ${reservationId}`);
    return false;
  }
}
