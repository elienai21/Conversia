import type { FastifyInstance } from "fastify";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";
import {
  searchListingsSchema,
  calculatePriceSchema,
  calendarQuerySchema,
  reservationSearchSchema,
} from "../schemas/staysnet.schema.js";
import * as staysnet from "../services/staysnet.service.js";

export async function staysnetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // --- Test connection ---
  app.get("/test", { onRequest: [requireAdmin] }, async (request) => {
    return staysnet.testConnection(request.user.tenantId);
  });

  // --- Search filter (cities, regions, amenities, etc.) ---
  app.get("/search-filter", async (request) => {
    return staysnet.getSearchFilter(request.user.tenantId);
  });

  // --- Listings ---
  app.get<{ Querystring: { status?: string; skip?: string; limit?: string } }>(
    "/listings",
    async (request) => {
      const { status, skip, limit } = request.query;
      return staysnet.getListings(request.user.tenantId, {
        status,
        skip: skip ? Number(skip) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
    }
  );

  app.get<{ Params: { id: string } }>("/listings/:id", async (request) => {
    return staysnet.getListing(request.user.tenantId, request.params.id);
  });

  // --- Listing details ---
  app.get<{ Params: { id: string } }>("/listings/:id/booking-settings", async (request) => {
    return staysnet.getBookingSettings(request.user.tenantId, request.params.id);
  });

  app.get<{ Params: { id: string } }>("/listings/:id/house-rules", async (request) => {
    return staysnet.getHouseRules(request.user.tenantId, request.params.id);
  });

  app.get<{ Params: { id: string } }>("/listings/:id/sell-price", async (request) => {
    return staysnet.getSellPriceSettings(request.user.tenantId, request.params.id);
  });

  // --- Calendar / Availability ---
  app.get<{ Params: { id: string }; Querystring: { from: string; to: string } }>(
    "/listings/:id/calendar",
    async (request, reply) => {
      const parsed = calendarQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "from and to (YYYY-MM-DD) are required", errors: parsed.error.flatten() });
      }
      return staysnet.getListingCalendar(
        request.user.tenantId,
        request.params.id,
        parsed.data.from,
        parsed.data.to
      );
    }
  );

  // --- Search available listings ---
  app.post("/search", async (request, reply) => {
    const parsed = searchListingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid search params", errors: parsed.error.flatten() });
    }
    return staysnet.searchListings(request.user.tenantId, parsed.data);
  });

  // --- Calculate price ---
  app.post("/calculate-price", async (request, reply) => {
    const parsed = calculatePriceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid params", errors: parsed.error.flatten() });
    }
    return staysnet.calculatePrice(request.user.tenantId, parsed.data);
  });

  // --- Reservations ---
  app.get<{ Querystring: Record<string, string> }>("/reservations", async (request, reply) => {
    const parsed = reservationSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid params", errors: parsed.error.flatten() });
    }
    return staysnet.searchActiveReservations(request.user.tenantId, {
      ...parsed.data,
      skip: parsed.data.skip ? Number(parsed.data.skip) : undefined,
      limit: parsed.data.limit ? Number(parsed.data.limit) : undefined,
    });
  });

  app.get<{ Params: { id: string } }>("/reservations/:id", async (request) => {
    return staysnet.getReservation(request.user.tenantId, request.params.id);
  });

  // --- Properties ---
  app.get("/properties", async (request) => {
    return staysnet.getProperties(request.user.tenantId);
  });

  app.get<{ Params: { id: string } }>("/properties/:id", async (request) => {
    return staysnet.getProperty(request.user.tenantId, request.params.id);
  });

  // --- Clients ---
  app.get<{ Params: { id: string } }>("/clients/:id", async (request) => {
    return staysnet.getClient(request.user.tenantId, request.params.id);
  });
}
