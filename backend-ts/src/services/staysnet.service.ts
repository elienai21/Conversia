import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";

interface StaysNetCredentials {
  clientId: string;
  clientSecret: string;
  domain: string;
}

async function getCredentials(tenantId: string): Promise<StaysNetCredentials> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (!settings?.staysnetClientId || !settings?.staysnetClientSecret) {
    throw new Error("Stays.net credentials not configured");
  }

  return {
    clientId: decrypt(settings.staysnetClientId),
    clientSecret: decrypt(settings.staysnetClientSecret),
    domain: settings.staysnetDomain || "www.stays.net",
  };
}

function buildAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  return "Basic " + Buffer.from(raw).toString("base64");
}

async function apiRequest<T = unknown>(
  tenantId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const creds = await getCredentials(tenantId);
  const url = `https://${creds.domain}/external/v1${path}`;

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(creds.clientId, creds.clientSecret),
    "Content-Type": "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body && (method === "POST" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stays.net API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// --- Listings ---

export async function getListings(tenantId: string, params?: { status?: string; skip?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.skip !== undefined) query.set("skip", String(params.skip));
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest(tenantId, "GET", `/content/listings${qs ? `?${qs}` : ""}`);
}

export async function getListing(tenantId: string, listingId: string) {
  return apiRequest(tenantId, "GET", `/content/listings/${listingId}`);
}

// --- Properties ---

export async function getProperties(tenantId: string) {
  return apiRequest(tenantId, "GET", "/content/properties");
}

export async function getProperty(tenantId: string, propertyId: string) {
  return apiRequest(tenantId, "GET", `/content/properties/${propertyId}`);
}

// --- Calendar / Availability ---

export async function getListingCalendar(tenantId: string, listingId: string, from: string, to: string) {
  return apiRequest(tenantId, "GET", `/calendar/listing/${listingId}?from=${from}&to=${to}`);
}

// --- Booking / Search ---

export async function getSearchFilter(tenantId: string) {
  return apiRequest(tenantId, "GET", "/booking/searchfilter");
}

export async function searchListings(tenantId: string, params: {
  from: string;
  to: string;
  guests?: number;
  cities?: string[];
  regions?: string[];
  amenities?: string[];
  skip?: number;
  limit?: number;
}) {
  return apiRequest(tenantId, "POST", "/booking/search-listings", params);
}

export async function calculatePrice(tenantId: string, params: {
  listingIds: string[];
  from: string;
  to: string;
  guests?: number;
  promocode?: string;
}) {
  return apiRequest(tenantId, "POST", "/booking/calculate-price", params);
}

// --- Reservations ---

export async function getReservation(tenantId: string, reservationId: string) {
  return apiRequest(tenantId, "GET", `/booking/reservations/${reservationId}`);
}

export async function searchActiveReservations(tenantId: string, params?: {
  from?: string;
  to?: string;
  listingId?: string;
  status?: string;
  skip?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.listingId) query.set("listingId", params.listingId);
  if (params?.status) query.set("status", params.status);
  if (params?.skip !== undefined) query.set("skip", String(params.skip));
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest(tenantId, "GET", `/booking/reservations/search${qs ? `?${qs}` : ""}`);
}

// --- Booking Settings (check-in/check-out times) ---

export async function getBookingSettings(tenantId: string, listingId: string) {
  return apiRequest(tenantId, "GET", `/settings/listing/${listingId}/booking`);
}

// --- House Rules ---

export async function getHouseRules(tenantId: string, listingId: string) {
  return apiRequest(tenantId, "GET", `/settings/listing/${listingId}/house-rules`);
}

// --- Sell Price Settings (fees, deposit) ---

export async function getSellPriceSettings(tenantId: string, listingId: string) {
  return apiRequest(tenantId, "GET", `/settings/listing/${listingId}/sellprice`);
}

// --- Clients ---

export async function getClient(tenantId: string, clientId: string) {
  return apiRequest(tenantId, "GET", `/booking/clients/${clientId}`);
}

// --- Test connection ---

export async function testConnection(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiRequest(tenantId, "GET", "/booking/searchfilter");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
