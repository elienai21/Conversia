import { prisma } from "../lib/prisma.js";
import { getOrCreateVapidKeys, sendPushToSubscription } from "../lib/web-push.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";

export interface NewMessagePushPayload {
  conversationId: string;
  customerName?: string | null;
  messagePreview: string;
}

/**
 * Sends a browser push notification to ALL agents of a tenant
 * when a new customer message arrives.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function notifyAgentsNewMessage(
  tenantId: string,
  payload: NewMessagePushPayload,
): Promise<void> {
  try {
    const [subscriptions, conversation] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: { tenantId },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      }),
      // Fetch customer name lazily if not provided
      payload.customerName == null
        ? prisma.conversation.findUnique({
            where: { id: payload.conversationId },
            select: { customer: { select: { name: true } } },
          })
        : Promise.resolve(null),
    ]);

    if (subscriptions.length === 0) return;

    const customerName = payload.customerName ?? conversation?.customer?.name ?? "Cliente";
    const keys = await getOrCreateVapidKeys(tenantId);
    const subject = config.VAPID_SUBJECT;

    const pushData = {
      type: "new_message",
      title: `💬 ${customerName}`,
      body: payload.messagePreview.slice(0, 120),
      conversationId: payload.conversationId,
      url: `/conversations/${payload.conversationId}`,
      timestamp: Date.now(),
    };

    const expiredIds: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
        const alive = await sendPushToSubscription(sub, pushData, keys, subject);
        if (!alive) expiredIds.push(sub.id);
      }),
    );

    if (expiredIds.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
      logger.info(`[Push] Removed ${expiredIds.length} expired subscription(s) for tenant ${tenantId}`);
    }

    logger.info(`[Push] Sent to ${subscriptions.length - expiredIds.length} agent(s) for tenant ${tenantId}`);
  } catch (err) {
    logger.warn({ err }, "[Push] notifyAgentsNewMessage failed (non-fatal)");
  }
}

export interface UpsellPushPayload {
  conversationId: string;
  customerName: string;
  service: string;
}

/**
 * Sends a dedicated push notification for upsell purchases.
 * Uses type "upsell_sold" so the frontend can display a visually distinct notification.
 */
export async function notifyAgentsUpsell(
  tenantId: string,
  payload: UpsellPushPayload,
): Promise<void> {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { tenantId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    const keys = await getOrCreateVapidKeys(tenantId);
    const subject = config.VAPID_SUBJECT;

    const pushData = {
      type: "upsell_sold",
      title: `🔔 Nova Venda! ${payload.service}`,
      body: `${payload.customerName} solicitou: ${payload.service}`,
      conversationId: payload.conversationId,
      url: `/conversations/${payload.conversationId}`,
      timestamp: Date.now(),
    };

    const expiredIds: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
        const alive = await sendPushToSubscription(sub, pushData, keys, subject);
        if (!alive) expiredIds.push(sub.id);
      }),
    );

    if (expiredIds.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
    }

    logger.info(`[Push] Upsell notification sent to ${subscriptions.length - expiredIds.length} agent(s)`);
  } catch (err) {
    logger.warn({ err }, "[Push] notifyAgentsUpsell failed (non-fatal)");
  }
}
