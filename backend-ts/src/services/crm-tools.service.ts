/**
 * Shared CRM tool executor used by both copilot.service and auto-response.service.
 *
 * Previously duplicated in both files — any change to tool handling was
 * required twice, causing drift bugs. This module is the single source of truth.
 */
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";

export async function executeCrmToolCall(
  tenantId: string,
  fnName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const adapterResult = await CrmAdapterFactory.getAdapter(tenantId);
    if (!adapterResult.ok) {
      return JSON.stringify({ error: adapterResult.error.message });
    }
    const adapter = adapterResult.value;

    if (fnName === "search_available_listings") {
      const res = await adapter.searchListings({
        from: args.from as string,
        to: args.to as string,
        guests: args.guests as number,
      });
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }

    if (fnName === "calculate_price") {
      const res = await adapter.calculatePrice({
        listingIds: args.listingIds as string[],
        from: args.from as string,
        to: args.to as string,
        guests: args.guests as number,
      });
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }

    if (fnName === "get_reservation_details") {
      const res = await adapter.getReservation(args.reservationCode as string);
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }

    if (fnName === "get_all_properties") {
      const res = await adapter.getProperties();
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }

    if (fnName === "get_listing_details") {
      const res = await adapter.getListing(args.listingId as string);
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }

    if (fnName === "get_house_rules") {
      const res = await adapter.getHouseRules(args.listingId as string);
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }

    return JSON.stringify({ error: `Unknown tool: ${fnName}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: `CRM execution error: ${msg}` });
  }
}
