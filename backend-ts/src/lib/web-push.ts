import webPush from "web-push";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Returns the VAPID key pair for a tenant.
 * If no keys exist yet, generates them once and persists to TenantSettings.
 * Keys are stable across restarts — browser push subscriptions remain valid.
 */
export async function getOrCreateVapidKeys(tenantId: string): Promise<VapidKeys> {
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });

  if (settings?.vapidPublicKey && settings?.vapidPrivateKey) {
    return { publicKey: settings.vapidPublicKey, privateKey: settings.vapidPrivateKey };
  }

  const keys = webPush.generateVAPIDKeys();
  logger.info(`[Push] Generated VAPID keys for tenant ${tenantId}`);

  await prisma.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId, vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey },
    update: { vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey },
  });

  return keys;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a push notification to a single subscription.
 * Returns false when the subscription is expired (410/404) so callers can clean it up.
 */
export async function sendPushToSubscription(
  sub: PushSubscriptionInput,
  payload: object,
  keys: VapidKeys,
  subject: string,
): Promise<boolean> {
  webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: unknown) {
    const status = (err as Record<string, unknown>)?.statusCode as number | undefined;
    if (status === 404 || status === 410) return false; // expired — caller should delete
    logger.warn({ err }, "[Push] Failed to deliver push notification");
    return true;
  }
}
