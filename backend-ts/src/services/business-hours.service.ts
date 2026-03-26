import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

interface BusinessHoursConfig {
  timezone: string;
  businessHoursStart: string; // "HH:mm"
  businessHoursEnd: string;   // "HH:mm"
  businessHoursDays: string;  // JSON array e.g. "[1,2,3,4,5]"
}

/**
 * Checks whether the current time (in the tenant's timezone) falls within configured business hours.
 */
export function isWithinBusinessHours(config: BusinessHoursConfig): boolean {
  const { timezone, businessHoursStart, businessHoursEnd, businessHoursDays } = config;

  // Parse allowed weekdays
  let allowedDays: number[];
  try {
    allowedDays = JSON.parse(businessHoursDays);
    if (!Array.isArray(allowedDays)) allowedDays = [1, 2, 3, 4, 5];
  } catch {
    allowedDays = [1, 2, 3, 4, 5];
  }

  // Get current time in tenant's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";

  // Map weekday string to JS weekday number (0=Sun, 1=Mon, ..., 6=Sat)
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const currentWeekday = weekdayMap[weekdayStr] ?? new Date().getDay();

  // Check if today is an allowed day
  if (!allowedDays.includes(currentWeekday)) {
    return false;
  }

  // Parse start/end times
  const [startH, startM] = businessHoursStart.split(":").map(Number);
  const [endH, endM] = businessHoursEnd.split(":").map(Number);

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Resolves whether auto-response should be active right now, based on the tenant's mode.
 *
 * - "manual"    → always OFF (Copilot only)
 * - "auto"      → always ON  (AI 24h)
 * - "scheduled" → ON outside business hours, OFF during business hours
 */
export function resolveAutoResponseEnabled(settings: {
  autoResponseMode: string;
  enableAutoResponse: boolean;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessHoursDays: string;
}): boolean {
  const mode = settings.autoResponseMode || "manual";

  if (mode === "manual") return false;
  if (mode === "auto") return true;

  if (mode === "scheduled") {
    const withinHours = isWithinBusinessHours({
      timezone: settings.timezone,
      businessHoursStart: settings.businessHoursStart,
      businessHoursEnd: settings.businessHoursEnd,
      businessHoursDays: settings.businessHoursDays,
    });
    // Outside business hours → auto-response ON
    return !withinHours;
  }

  // Fallback: use the legacy boolean
  return settings.enableAutoResponse;
}

/**
 * Returns the current AI mode status for a tenant.
 */
export async function getAiModeStatus(tenantId: string): Promise<{
  mode: string;
  isAutoResponseActive: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessHoursDays: number[];
  timezone: string;
  emergencyPhoneNumber: string | null;
}> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  const mode = settings?.autoResponseMode || "manual";
  const timezone = settings?.timezone || "America/Sao_Paulo";
  const bhStart = settings?.businessHoursStart || "08:00";
  const bhEnd = settings?.businessHoursEnd || "18:00";
  const bhDays = settings?.businessHoursDays || "[1,2,3,4,5]";

  let parsedDays: number[];
  try {
    parsedDays = JSON.parse(bhDays);
  } catch {
    parsedDays = [1, 2, 3, 4, 5];
  }

  const isActive = resolveAutoResponseEnabled({
    autoResponseMode: mode,
    enableAutoResponse: settings?.enableAutoResponse ?? false,
    timezone,
    businessHoursStart: bhStart,
    businessHoursEnd: bhEnd,
    businessHoursDays: bhDays,
  });

  return {
    mode,
    isAutoResponseActive: isActive,
    businessHoursStart: bhStart,
    businessHoursEnd: bhEnd,
    businessHoursDays: parsedDays,
    timezone,
    emergencyPhoneNumber: settings?.emergencyPhoneNumber || null,
  };
}
