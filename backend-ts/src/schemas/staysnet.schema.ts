import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const searchListingsSchema = z.object({
  from: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  to: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  guests: z.number().int().min(1).optional(),
  cities: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  skip: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const calculatePriceSchema = z.object({
  listingIds: z.array(z.string()).min(1),
  from: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  to: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  guests: z.number().int().min(1).optional(),
  promocode: z.string().optional(),
});

export const calendarQuerySchema = z.object({
  from: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
  to: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
});

export const reservationSearchSchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
  listingId: z.string().optional(),
  status: z.string().optional(),
  skip: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
