import type { FastifyInstance } from "fastify";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";
import {
  searchListingsSchema,
  calculatePriceSchema,
  calendarQuerySchema,
  reservationSearchSchema,
} from "../schemas/staysnet.schema.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";

export async function staysnetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  async function getAdapter(tenantId: string) {
    const factoryResult = await CrmAdapterFactory.getAdapter(tenantId);
    if (!factoryResult.ok) throw factoryResult.error;
    return factoryResult.value;
  }

  // --- Test connection ---
  app.get("/test", { onRequest: [requireAdmin] }, async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.testConnection();
    if (!result.ok) throw result.error;
    return { ok: result.value };
  });

  // --- Search filter (cities, regions, amenities, etc.) ---
  app.get("/search-filter", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getSearchFilter();
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Listings ---
  app.get<{ Querystring: { status?: string; skip?: string; limit?: string } }>(
    "/listings",
    async (request) => {
      const { status, skip, limit } = request.query;
      const adapter = await getAdapter(request.user.tenantId);
      const result = await adapter.getListings({
        status,
        skip: skip ? Number(skip) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      if (!result.ok) throw result.error;
      return result.value;
    }
  );

  app.get<{ Params: { id: string } }>("/listings/:id", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getListing(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Listing details ---
  app.get<{ Params: { id: string } }>("/listings/:id/booking-settings", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getBookingSettings(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });

  app.get<{ Params: { id: string } }>("/listings/:id/house-rules", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getHouseRules(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });

  app.get<{ Params: { id: string } }>("/listings/:id/sell-price", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getSellPriceSettings(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Calendar / Availability ---
  app.get<{ Params: { id: string }; Querystring: { from: string; to: string } }>(
    "/listings/:id/calendar",
    async (request, reply) => {
      const parsed = calendarQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(422).send({ detail: "from and to (YYYY-MM-DD) are required", errors: parsed.error.flatten() });
      }
      
      const adapter = await getAdapter(request.user.tenantId);
      const result = await adapter.getListingCalendar(request.params.id, {
        from: parsed.data.from,
        to: parsed.data.to,
      });
      if (!result.ok) throw result.error;
      return result.value;
    }
  );

  // --- Search available listings ---
  app.post("/search", async (request, reply) => {
    const parsed = searchListingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid search params", errors: parsed.error.flatten() });
    }
    
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.searchListings(parsed.data);
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Calculate price ---
  app.post("/calculate-price", async (request, reply) => {
    const parsed = calculatePriceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid params", errors: parsed.error.flatten() });
    }
    
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.calculatePrice(parsed.data);
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Reservations ---
  app.get<{ Querystring: Record<string, string> }>("/reservations", async (request, reply) => {
    const parsed = reservationSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid params", errors: parsed.error.flatten() });
    }
    
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.searchActiveReservations({
      ...parsed.data,
      skip: parsed.data.skip ? Number(parsed.data.skip) : undefined,
      limit: parsed.data.limit ? Number(parsed.data.limit) : undefined,
    });
    if (!result.ok) throw result.error;
    return result.value;
  });

  app.get<{ Params: { id: string } }>("/reservations/:id", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getReservation(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Properties ---
  app.get("/properties", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getProperties();
    if (!result.ok) throw result.error;
    return result.value;
  });

  app.get<{ Params: { id: string } }>("/properties/:id", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getProperty(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });

  // --- Clients ---
  app.get<{ Params: { id: string } }>("/clients/:id", async (request) => {
    const adapter = await getAdapter(request.user.tenantId);
    const result = await adapter.getClient(request.params.id);
    if (!result.ok) throw result.error;
    return result.value;
  });
}
