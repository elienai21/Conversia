import { prisma } from "../lib/prisma.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";
import { logger } from "../lib/logger.js";
import { randomUUID } from "crypto";
import { decrypt } from "../lib/encryption.js";
import type { WinkerEventPayload } from "../adapters/winker/winker.adapter.js";

export interface TaskSyncSummary {
  tenantsScanned: number;
  reservationsFound: number;
  tasksCreated: number;
  errors: string[];
}

// Triggers: 'checkin', 'checkout'
/**
 * Returns "YYYY-MM-DD" in the given IANA timezone (e.g. "America/Sao_Paulo").
 * Falls back to UTC if the timezone is invalid.
 */
function toDateStrInTz(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().split("T")[0]; // UTC fallback
  }
}

export async function runDailyTaskSync(): Promise<TaskSyncSummary> {
  logger.info("[TaskWorker] Iniciando sincronização diária de missões...");

  // Dates will be resolved per-tenant using each tenant's configured timezone
  const now = new Date();

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

      // Use tenant-specific timezone for date calculations.
      // A hotel in GMT-3 should process check-ins for the local date, not UTC.
      const tenantSettings = await prisma.tenantSettings.findUnique({
        where: { tenantId: tenant.id },
        select: { timezone: true, checkinBaseUrl: true },
      });
      const tz = tenantSettings?.timezone ?? "America/Sao_Paulo";
      const frontendBaseUrl = tenantSettings?.checkinBaseUrl || process.env.FRONTEND_URL || "https://app.conversia.com";

      const dateTodayStr = toDateStrInTz(now, tz);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateTomorrowStr = toDateStrInTz(tomorrow, tz);

      const crm = adapterRes.value;
      logger.info(
        `[TaskWorker] Tenant ${tenant.id} | tz=${tz} | filtro: checkin/checkout em ${dateTodayStr} ou ${dateTomorrowStr}`
      );

      // Buscar equipe operacional (para direcionar O.S. e alertas de faxina/lavanderia)
      const opContacts = await prisma.customer.findMany({
        where: { tenantId: tenant.id, tag: { in: ["STAFF", "GROUP_STAFF"] } },
      });
      // Prioridade: grupos primeiro, depois indivíduos
      const defaultStaff = opContacts.find(c => c.tag === "GROUP_STAFF") || opContacts[0];

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

        // Diagnostic: log raw guestsDetails from reservation
        const rawGuestsDetails = r["guestsDetails"] ?? r["_guestsDetails"];
        logger.info(
          `[TaskWorker] guestsDetails raw: ${JSON.stringify(rawGuestsDetails)}`
        );

        // --- Guests: try inline structures first ---
        let guest = extractPrimaryGuest(r);

        // Fallback: Stays.net embeds only _idclient (reference ID), not full client data.
        // Fetch client details separately when inline extraction fails.
        if (!guest && r["_idclient"]) {
          const clientId = String(r["_idclient"]);
          logger.info(`[TaskWorker] Buscando cliente via API: _idclient=${clientId}`);
          const clientRes = await crm.getClient(clientId);
          if (clientRes.ok) {
            const clientData = clientRes.value as Record<string, unknown>;
            // Diagnostic: log raw phones array so we can see exact structure
            logger.info(
              `[TaskWorker] Cliente ${clientId} phones RAW: ${JSON.stringify(clientData["phones"])} | clientSource: ${clientData["clientSource"]}`
            );
            guest = extractPrimaryGuest(clientData);
            if (!guest) {
              logger.info(
                `[TaskWorker] Cliente ${clientId} sem telefone. Chaves: ${Object.keys(clientData).join(", ")}`
              );
            }
          } else {
            logger.warn(`[TaskWorker] Falha ao buscar cliente ${clientId}: ${clientRes.error.message}`);
          }
        }

        if (!guest) {
          logger.info(`[TaskWorker] SKIP reserva ${resId}: sem telefone após busca de cliente`);
          continue;
        }

        const { name, phone } = guest;

        // Extract listing ID from reservation (Stays.net stores it as _idlisting)
        const listingId = String(
          r["_idlisting"] ?? r["listingId"] ?? r["listing_id"] ??
          (r["listing"] as Record<string, unknown> | undefined)?.["_id"] ?? ""
        ) || null;

        // Look up per-property required fields configuration
        let requiredFields: { hasGarage: boolean; hasFacialBiometrics: boolean } | null = null;
        if (listingId) {
          const propConfig = await prisma.propertyConfig.findUnique({
            where: { tenantId_listingId: { tenantId: tenant.id, listingId } },
            select: { hasGarage: true, hasFacialBiometrics: true },
          });
          if (propConfig && (propConfig.hasGarage || propConfig.hasFacialBiometrics)) {
            requiredFields = { hasGarage: propConfig.hasGarage, hasFacialBiometrics: propConfig.hasFacialBiometrics };
          }
        }

        let created = 0;

        if (checkIn === dateTomorrowStr) {
          const token = randomUUID();
          const checkinLink = `${frontendBaseUrl}/checkin/${token}`;
          const payload = `Olá ${name}! Passando pra lembrar que seu Check-in no imóvel está agendado para amanhã. Para agilizar seu acesso, preencha seu cadastro antecipado aqui: ${checkinLink}\nConfira também o GUIA DA CASA e a senha de destravamento de porta aqui no Chat!\nQualquer dúvida, a equipe está 100% à disposição.`;
          if (await persistTask(tenant.id, resId, "checkin_amanha", name, phone, payload, token, listingId, requiredFields)) created++;
        }

        if (checkIn === dateTodayStr) {
          const token = randomUUID();
          const checkinLink = `${frontendBaseUrl}/checkin/${token}`;
          const payload = `Olá ${name}! Chegou o grande dia do seu Check-in! Para liberar seu acesso, complete seu cadastro aqui: ${checkinLink}\nAqui está também a senha da fechadura eletrônica e o Guia da Casa.\nDesejamos uma excelente estadia!`;
          if (await persistTask(tenant.id, resId, "checkin_hoje", name, phone, payload, token, listingId, requiredFields)) created++;
        }

        if (checkOut === dateTomorrowStr) {
          const payload = `Olá ${name}! Passando pra lembrar que seu Check-out é amanhã até as 11h. Esperamos que esteja aproveitando muito a estadia! Por favor, lembre-se de conferir seus pertences antes de sair.`;
          if (await persistTask(tenant.id, resId, "checkout_amanha", name, phone, payload)) created++;

          // Agendamento Operacional: Lavanderia (Avisar 1 dia antes)
          if (defaultStaff) {
            const laundryPayload = `Atenção Lavanderia 🧺\nTemos check-out programado para amanhã do hóspede ${name}.\nReserva: ${resId}\nPor favor, programar recolha e reposição do enxoval.`;
            if (await persistTask(tenant.id, resId, "laundry_pickup", defaultStaff.name || "Equipe Operacional", defaultStaff.phone, laundryPayload)) created++;
          }
        }

        if (checkOut === dateTodayStr) {
          const payload = `Olá ${name}! Esperamos que sua estadia tenha sido maravilhosa. Como você fez seu checkout hoje, gostaríamos de saber: como você avalia sua experiência conosco de 1 a 5? (Responda apenas com o número da sua nota)`;
          if (await persistTask(tenant.id, resId, "checkout_hoje", name, phone, payload)) created++;

          // Agendamento Operacional: Faxina (Avisar no dia do check-out)
          if (defaultStaff) {
            const cleaningPayload = `Atenção Equipe Limpeza ✨\nO hóspede ${name} fez check-out hoje.\nReserva: ${resId}\nO imóvel está liberado para limpeza e vistoria.`;
            if (await persistTask(tenant.id, resId, "cleaning_dispatch", defaultStaff.name || "Equipe Operacional", defaultStaff.phone, cleaningPayload)) created++;
          }
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

  // Structure 8: r itself is the guest/contact (e.g. Stays.net /booking/clients/{id} response
  // where fName, lName, phones are top-level fields on the client object)
  const selfName = extractName(r);
  const selfPhone = extractPhone(r);
  if (selfPhone) return { name: selfName || "Hóspede", phone: selfPhone };

  // Structure 9: log all top-level keys in plain text for easy diagnosis in Railway
  const allKeys = Object.keys(r).join(", ");
  const guestStringFields = Object.entries(r)
    .filter(([k, v]) => (k.toLowerCase().includes("guest") || k.toLowerCase().includes("client") || k.toLowerCase().includes("hospede")) && typeof v === "string")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  logger.info(
    `[TaskWorker] Nenhuma estrutura reconhecida. Chaves: ${allKeys} | Campos guest/client: ${guestStringFields || "nenhum"}`
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
  // Stays.net uses fName/lName (short form)
  const first = (obj["fName"] ?? obj["firstName"] ?? obj["firstname"] ?? obj["first_name"] ?? "") as string;
  const last = (obj["lName"] ?? obj["lastName"] ?? obj["lastname"] ?? obj["last_name"] ?? "") as string;
  const combined = `${first} ${last}`.trim();
  return combined || "Hóspede";
}

function extractPhone(obj: Record<string, unknown>): string {
  // Stays.net phones array: [{ phone: "+5511999999999" }] or [{ iso, value, number, ... }]
  const phones = obj["phones"] as Array<unknown> | undefined;
  if (Array.isArray(phones) && phones.length > 0) {
    for (const p of phones) {
      if (typeof p === "string") {
        const digits = p.replace(/\D/g, "");
        if (digits.length >= 8) return digits;
      }
      if (p && typeof p === "object") {
        const pObj = p as Record<string, unknown>;
        // Try all common field names including Stays.net's "phone" (singular)
        const raw = String(
          pObj["phone"] ?? pObj["iso"] ?? pObj["value"] ?? pObj["number"] ?? pObj["phoneNumber"] ?? ""
        );
        if (raw) {
          const digits = raw.replace(/\D/g, "");
          if (digits.length >= 8) return digits;
        }
      }
    }
    // Log phones structure for further diagnosis
    logger.info(`[TaskWorker] phones field presente mas sem número extraível: ${JSON.stringify(phones)}`);
  }

  // phone string directly on object
  const phoneFields = ["phone", "phoneNumber", "phone_number", "mobile", "celular", "whatsapp"];
  for (const field of phoneFields) {
    if (obj[field]) {
      const digits = String(obj[field]).replace(/\D/g, "");
      if (digits.length >= 8) return digits;
    }
  }

  return "";
}

/**
 * Fire-and-forget: create a Winker event when a task/reservation is approved.
 */
export async function createWinkerEvent(tenantId: string, event: WinkerEventPayload): Promise<void> {
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.winkerApiToken || !settings?.winkerPortalId) return;
  let apiToken: string;
  try {
    apiToken = decrypt(settings.winkerApiToken);
  } catch {
    return;
  }
  const { WinkerAdapter } = await import("../adapters/winker/winker.adapter.js");
  const winker = new WinkerAdapter({ apiToken, portalId: settings.winkerPortalId });
  await winker.createEvent(event);
}

async function persistTask(
  tenantId: string,
  reservationId: string,
  type: string,
  customerName: string,
  customerPhone: string,
  messagePayload: string,
  magicToken?: string,
  listingId?: string | null,
  requiredFields?: { hasGarage: boolean; hasFacialBiometrics: boolean } | null,
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
        ...(magicToken ? { magicToken } : {}),
        ...(listingId ? { listingId } : {}),
        ...(requiredFields ? { requiredFields: JSON.stringify(requiredFields) } : {}),
      },
    });
    logger.debug(`[TaskWorker] Task persistida: ${type} para ${customerName} (reserva ${reservationId})`);
    return !!result;
  } catch (err) {
    logger.error({ err }, `[TaskWorker] Erro ao persistir task ${type} reserva ${reservationId}`);
    return false;
  }
}
