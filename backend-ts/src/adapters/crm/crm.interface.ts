import type { Result } from "../../lib/result.js";
import type { AppError } from "../../lib/errors.js";

export interface SearchListingsParams {
  from: string;
  to: string;
  guests?: number;
  cities?: string[];
  regions?: string[];
  amenities?: string[];
  skip?: number;
  limit?: number;
}

export interface CalculatePriceParams {
  listingIds: string[];
  from: string;
  to: string;
  guests?: number;
  promocode?: string;
}

export interface CalendarQueryParams {
  from: string;
  to: string;
}

export interface ReservationSearchParams {
  from?: string;
  to?: string;
  listingId?: string;
  status?: string;
  skip?: number;
  limit?: number;
}

// Domain Respones Types
export interface PropertyListing {
  id?: string;
  _id?: string;
  [key: string]: unknown;
}

export interface PriceCalculation {
  [key: string]: unknown;
}

export interface CalendarDay {
  [key: string]: unknown;
}

export interface Reservation {
  id?: string;
  _id?: string;
  [key: string]: unknown;
}

export interface ICrmAdapter {
  // Search & Listings
  getListings(params?: { status?: string; skip?: number; limit?: number }): Promise<Result<PropertyListing[], AppError>>;
  searchListings(params: SearchListingsParams): Promise<Result<PropertyListing[], AppError>>;
  getListing(listingId: string): Promise<Result<PropertyListing, AppError>>;
  
  getProperties(): Promise<Result<PropertyListing[], AppError>>;
  getProperty(propertyId: string): Promise<Result<PropertyListing, AppError>>;
  
  // Calendar & Pricing
  getListingCalendar(listingId: string, params: CalendarQueryParams): Promise<Result<CalendarDay[], AppError>>;
  calculatePrice(params: CalculatePriceParams): Promise<Result<PriceCalculation, AppError>>; // Often returns an object with quotes
  
  // Reservations
  getReservation(reservationId: string): Promise<Result<Reservation, AppError>>;
  searchActiveReservations(params?: ReservationSearchParams): Promise<Result<Reservation[], AppError>>;

  // Settings & Others
  getBookingSettings(listingId: string): Promise<Result<unknown, AppError>>;
  getHouseRules(listingId: string): Promise<Result<unknown, AppError>>;
  getSellPriceSettings(listingId: string): Promise<Result<unknown, AppError>>;
  getClient(clientId: string): Promise<Result<unknown, AppError>>;
  getSearchFilter(): Promise<Result<unknown, AppError>>;

  // Diagnostics
  testConnection(): Promise<Result<boolean, AppError>>;
}
