import { prisma } from "../lib/prisma.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";

// Triggers: 'checkin', 'checkout'
export async function runDailyTaskSync() {
  console.log("[TaskWorker] Iniciando sincronização diária de missões...");

  // Data limits (Stays.net params)
  const today = new Date();
  const dateTodayStr = today.toISOString().split("T")[0];

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateTomorrowStr = tomorrow.toISOString().split("T")[0];

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });

    for (const tenant of tenants) {
      const adapterRes = await CrmAdapterFactory.getAdapter(tenant.id);
      if (!adapterRes.ok) {
        // Ignora tenant se não tiver Integração Stays/CRM
        continue;
      }
      
      const crm = adapterRes.value;

      console.log(`[TaskWorker] Escaneando reservas para Tenant ${tenant.id}`);
      
      // Busca reservas que cobrem HOJE e AMANHÃ para avaliarmos os check-ins e check-outs.
      const searchRes = await crm.searchActiveReservations({
        from: dateTodayStr,
        to: dateTomorrowStr,
      });

      if (!searchRes.ok) {
        console.error(`[TaskWorker] Falha ao ler reservas: ${searchRes.error.message}`);
        continue;
      }

      const activeReservations = searchRes.value;
      console.log(`[TaskWorker] Tenant ${tenant.id} tem ${activeReservations.length} reservas no range.`);

      for (const res of activeReservations) {
        // Estrutura Reservation da Stays:
        const checkIn = (res as any).checkInDate; // "YYYY-MM-DD"
        const checkOut = (res as any).checkOutDate;
        const resId = (res as any).id || (res as any)._id;
        const guestsList = (res as any).guestsDetails?.list || [];
        const primaryGuest = guestsList.find((g: any) => g.primary) || guestsList[0];
        
        if (!primaryGuest) continue;

        const name = primaryGuest.name || "Hóspede";
        const phones = primaryGuest.phones || [];
        let phoneStr = "";
        if (phones.length > 0) {
           phoneStr = phones[0].iso || phones[0].value || "";
           phoneStr = phoneStr.replace(/\D/g, ""); 
        }
        
        if (!phoneStr) continue;
        
        // Verifica Trigger de Check-in (Faltam 24h)
        if (checkIn === dateTomorrowStr) {
          const payload = `Olá ${name}! Passando pra lembrar que seu Check-in no imóvel está agendado para amanhã. Confira o GUIA DA CASA e a senha de destravamento de porta aqui no Chat!\nQualquer dúvida, a equipe está 100% à disposição.`;
          await persistTask(tenant.id, resId, "checkin_amanha", pendingDate(today), name, phoneStr, payload);
        }

        // Verifica Trigger de Check-in Hoje
        if (checkIn === dateTodayStr) {
          const payload = `Olá ${name}! Chegou o grande dia do seu Check-in! Estamos ansiosos para te receber. Aqui está a senha da fechadura eletrônica e o Guia da Casa.\nDesejamos uma excelente estadia!`;
          await persistTask(tenant.id, resId, "checkin_hoje", pendingDate(today), name, phoneStr, payload);
        }

        // Verifica Trigger de Check-out Amanhã
        if (checkOut === dateTomorrowStr) {
          const payload = `Olá ${name}! Passando pra lembrar que seu Check-out é amanhã até as 11h. Esperamos que esteja aproveitando muito a estadia! Por favor, lembre-se de conferir seus pertences antes de sair.`;
          await persistTask(tenant.id, resId, "checkout_amanha", pendingDate(today), name, phoneStr, payload);
        }

        // Verifica Trigger de Check-out (Hoje)
        if (checkOut === dateTodayStr) {
          const payload = `Olá ${name}! Esperamos que sua estadia tenha sido maravilhosa. Como vc fez seu checkout hoje, gostaríamos de sua avaliação (NPS).\nComo mimo, oferecemos 10% de desconto na sua próxima viagem conosco usando o cupom RETURN10!`;
          await persistTask(tenant.id, resId, "checkout_hoje", pendingDate(today), name, phoneStr, payload);
        }
      }
    }

    console.log("[TaskWorker] Sincronização finalizada.");
  } catch (err) {
    console.error("[TaskWorker] FAILED", err);
  }
}

function pendingDate(d: Date): Date {
  // Marca o schedule para as manhãs ou horário atual se atrasado
  return new Date();
}

async function persistTask(tenantId: string, reservationId: string, type: string, scheduledFor: Date, customerName: string, customerPhone: string, messagePayload: string) {
  try {
    await prisma.taskQueue.upsert({
      where: {
        tenantId_reservationId_type: { tenantId, reservationId, type },
      },
      update: {}, // Não faz update, apenas ignora se já está na fila
      create: {
        tenantId,
        type,
        customerName,
        customerPhone,
        reservationId,
        scheduledFor,
        messagePayload,
        status: "pending"
      }
    });
  } catch(e) { /* ignore uniqueness issues softly */ }
}
