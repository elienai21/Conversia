import { ok, fail } from "../../lib/result.js";
import { AppError } from "../../lib/errors.js";
import type { Result } from "../../lib/result.js";

export type WinkerVisitPayload = {
  name: string;
  document?: string;
  document_type?: string; // "cpf" | "rg" | "passport"
  phone?: string;
  expected_at?: string;        // ISO datetime
  expected_departure?: string; // ISO datetime
  id_unit?: string;            // Winker unit identifier within the portal
  vehicle_plate?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_color?: string;
};

export type WinkerEventPayload = {
  type: string; // e.g. "checkin_confirmed"
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

const WINKER_BASE_URL = "https://api.winker.com.br/v1";

export class WinkerAdapter {
  private readonly apiToken: string;
  private readonly portalId: string;

  constructor({ apiToken, portalId }: { apiToken: string; portalId: string }) {
    this.apiToken = apiToken;
    this.portalId = portalId;
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${WINKER_BASE_URL}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      let message = `Winker API error: ${response.status}`;
      try {
        const errBody = (await response.json()) as { code?: number; message?: string; description?: string };
        message = errBody.message || errBody.description || message;
      } catch {
        // ignore parse error
      }
      throw new AppError(message, response.status);
    }

    // 204 No Content — return empty object
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  async testConnection(): Promise<Result<boolean, AppError>> {
    try {
      await this.apiRequest<unknown>("GET", "/me");
      return ok(true);
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      return fail(new AppError(err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async registerVisit(data: WinkerVisitPayload): Promise<Result<{ uuid?: string }, AppError>> {
    try {
      const result = await this.apiRequest<{ uuid?: string }>(
        "POST",
        `/gatekeeper?id_portal=${this.portalId}`,
        data,
      );
      return ok(result);
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      return fail(new AppError(err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async listVisits(): Promise<Result<unknown[], AppError>> {
    try {
      const result = await this.apiRequest<unknown[]>(
        "GET",
        `/gatekeeper?id_portal=${this.portalId}`,
      );
      return ok(Array.isArray(result) ? result : []);
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      return fail(new AppError(err instanceof Error ? err.message : "Unknown error"));
    }
  }

  async createEvent(data: WinkerEventPayload): Promise<Result<{ uuid?: string }, AppError>> {
    try {
      const result = await this.apiRequest<{ uuid?: string }>("POST", "/worker/event", data);
      return ok(result);
    } catch (err) {
      if (err instanceof AppError) return fail(err);
      return fail(new AppError(err instanceof Error ? err.message : "Unknown error"));
    }
  }
}
