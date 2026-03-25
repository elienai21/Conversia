import { ApiService } from "./api";

/** Converts a URL-safe base64 string to Uint8Array (required by PushManager.subscribe) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** True when the browser supports push notifications */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Returns current notification permission state */
export function getNotificationPermission(): NotificationPermission {
  return "Notification" in window ? Notification.permission : "denied";
}

/** Fetches the VAPID public key from the backend */
async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const data = await ApiService.get<{ publicKey: string }>("/push/vapid-public-key");
    return data.publicKey;
  } catch {
    return null;
  }
}

/**
 * Requests notification permission and subscribes the current device.
 * Returns: "subscribed" | "denied" | "unsupported" | "error"
 */
export async function subscribeToPush(): Promise<"subscribed" | "denied" | "unsupported" | "error"> {
  if (!isPushSupported()) return "unsupported";

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const registration = await navigator.serviceWorker.ready;
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return "error";

    // Get or create a subscription
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = sub.toJSON();
    const keys = json.keys as { p256dh: string; auth: string };

    await ApiService.post("/push/subscribe", {
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: navigator.userAgent,
    });

    return "subscribed";
  } catch (err) {
    console.error("[Push] Subscribe failed:", err);
    return "error";
  }
}

/** Unsubscribes the current device and removes it from the backend */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;

    await ApiService.delete("/push/subscribe", { endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch (err) {
    console.error("[Push] Unsubscribe failed:", err);
  }
}

/** Checks if the current device is already subscribed */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}
