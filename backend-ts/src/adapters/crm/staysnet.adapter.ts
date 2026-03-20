import type { Result } from "../../lib/result.js";
import { ok, fail } from "../../lib/result.js";
import { AppError } from "../../lib/errors.js";
import type {
  ICrmAdapter,
  SearchListingsParams,
  CalculatePriceParams,
  CalendarQueryParams,
  ReservationSearchParams,
  PropertyListing,
  PriceCalculation,
  CalendarDay,
  Reservation
} from "./crm.interface.js";

export interface StaysNetCredentials {
  base64Token: string;
  domain: string;
}

export class StaysNetAdapter implements ICrmAdapter {
  constructor(private readonly credentials: StaysNetCredentials) {}

  private buildAuthHeader(): string {
    // O token já vem em Base64 diretamente do painel Stays.net
    return "Basic " + this.credentials.base64Token;
  }

  private async apiRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `https://${this.credentials.domain}/external/v1${path}`;

    const headers: Record<string, string> = {
      Authorization: this.buildAuthHeader(),
      "Content-Type": "application/json",
    };

    const options: RequestInit = { method, headers };
    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new AppError(`Stays.net API error ${response.status}: ${text}`, response.status);
    }

    return response.json() as Promise<T>;
  }

  private async wrapRequest<T>(requestFn: () => Promise<T>, sanitizePII = true): Promise<Result<T, AppError>> {
    try {
      const data = await requestFn();
      
      // Privacy Filter (PII): Remove exact address details from any nested Stays.net models returned
      const sanitizeAddress = (item: any) => {
        if (item && typeof item === 'object' && item.address) {
          delete item.address.street;
          delete item.address.number;
          delete item.address.complement;
          delete item.address.zipCode;
        }
      };

      if (sanitizePII) {
        if (Array.isArray(data)) {
          data.forEach(sanitizeAddress);
        } else if (typeof data === 'object' && data !== null) {
          sanitizeAddress(data);
        }
      }

      return ok(data);
    } catch (err: unknown) {
      if (err instanceof AppError) {
        // Translation for 404 -> Not Available semantics instead of generic API Error
        if (err.statusCode === 404) {
          return fail(new AppError("Imóvel ocupado ou indisponível (regras de noites mínimas) para este período.", 404));
        }
        return fail(err);
      }
      return fail(new AppError(err instanceof Error ? err.message : "Unknown error connecting to CRM"));
    }
  }

  // --- Listings & Properties ---
  async getListings(params?: { status?: string; skip?: number; limit?: number }): Promise<Result<PropertyListing[], AppError>> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString();
    return this.wrapRequest(() => this.apiRequest<PropertyListing[]>("GET", `/content/listings${qs ? `?${qs}` : ""}`));
  }

  async searchListings(params: SearchListingsParams): Promise<Result<PropertyListing[], AppError>> {
    const query = new URLSearchParams();
    if (params.skip !== undefined) query.set("skip", String(params.skip));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString();
    
    // Notice that originally 'search-listings' was POST for availability booking search vs GET for content listings.
    // The previous service had a GET /content/listings and POST /booking/search-listings.
    // We map searchListings to the POST endpoint per `searchListingsSchema`.
    return this.wrapRequest(() => this.apiRequest<PropertyListing[]>("POST", "/booking/search-listings", params));
  }

  async getListing(listingId: string): Promise<Result<PropertyListing, AppError>> {
    return this.wrapRequest(() => this.apiRequest<PropertyListing>("GET", `/content/listings/${listingId}`));
  }

  async getProperties(): Promise<Result<PropertyListing[], AppError>> {
    return this.wrapRequest(() => this.apiRequest<PropertyListing[]>("GET", "/content/properties"));
  }

  async getProperty(propertyId: string): Promise<Result<PropertyListing, AppError>> {
    return this.wrapRequest(() => this.apiRequest<PropertyListing>("GET", `/content/properties/${propertyId}`));
  }

  // --- Calendar & Pricing ---
  async getListingCalendar(listingId: string, params: CalendarQueryParams): Promise<Result<CalendarDay[], AppError>> {
    return this.wrapRequest(() => this.apiRequest<CalendarDay[]>("GET", `/calendar/listing/${listingId}?from=${params.from}&to=${params.to}`));
  }

  async calculatePrice(params: CalculatePriceParams): Promise<Result<PriceCalculation, AppError>> {
    return this.wrapRequest(() => this.apiRequest<PriceCalculation>("POST", "/booking/calculate-price", params));
  }

  // --- Reservations ---
  async getReservation(reservationId: string): Promise<Result<Reservation, AppError>> {
    return this.wrapRequest(() => this.apiRequest<Reservation>("GET", `/booking/reservations/${reservationId}`));
  }

  async searchActiveReservations(params?: ReservationSearchParams): Promise<Result<Reservation[], AppError>> {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.listingId) query.set("listingId", params.listingId);
    if (params?.status) query.set("status", params.status);
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString();
    
    return this.wrapRequest(() => this.apiRequest<Reservation[]>("GET", `/booking/reservations/search${qs ? `?${qs}` : ""}`));
  }

  async getCheckinDetails(reservationCode: string): Promise<Result<unknown, AppError>> {
    const resResult = await this.getReservation(reservationCode);
    if (!resResult.ok) return resResult;

    const reservation = resResult.value as any;
    const listingId = reservation._idlisting;

    let listingDetails = null;
    let houseRules = null;

    if (listingId) {
      const listingRes = await this.wrapRequest(() => this.apiRequest<PropertyListing>("GET", `/content/listings/${listingId}`), false); // FALSE for bypassing PII filter 
      if (listingRes.ok) listingDetails = listingRes.value;

      const rulesRes = await this.getHouseRules(listingId);
      if (rulesRes.ok) houseRules = rulesRes.value;
    }

    return ok({
      reservation,
      listingDetails,
      houseRules
    });
  }

  // --- Extras / Settings ---
  async getBookingSettings(listingId: string): Promise<Result<unknown, AppError>> {
    return this.wrapRequest(() => this.apiRequest("GET", `/settings/listing/${listingId}/booking`));
  }

  async getHouseRules(listingId: string): Promise<Result<unknown, AppError>> {
    return this.wrapRequest(() => this.apiRequest("GET", `/settings/listing/${listingId}/house-rules`));
  }

  async getSellPriceSettings(listingId: string): Promise<Result<unknown, AppError>> {
    return this.wrapRequest(() => this.apiRequest("GET", `/settings/listing/${listingId}/sellprice`));
  }

  async getClient(clientId: string): Promise<Result<unknown, AppError>> {
    return this.wrapRequest(() => this.apiRequest("GET", `/booking/clients/${clientId}`));
  }
  
  async getSearchFilter(): Promise<Result<unknown, AppError>> {
    return this.wrapRequest(() => this.apiRequest("GET", "/booking/searchfilter"));
  }

  // --- Diagnostics ---
  async testConnection(): Promise<Result<boolean, AppError>> {
    try {
      await this.apiRequest("GET", "/booking/searchfilter");
      return ok(true);
    } catch (err: unknown) {
      if (err instanceof AppError) return fail(err);
      return fail(new AppError("Failed to connect to Stays.net"));
    }
  }
}
