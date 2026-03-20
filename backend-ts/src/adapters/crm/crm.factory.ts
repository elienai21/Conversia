import { prisma } from "../../lib/prisma.js";
import { decrypt } from "../../lib/encryption.js";
import { ok, fail } from "../../lib/result.js";
import type { Result } from "../../lib/result.js";
import { AppError } from "../../lib/errors.js";
import type { ICrmAdapter } from "./crm.interface.js";
import { StaysNetAdapter } from "./staysnet.adapter.js";

export class CrmAdapterFactory {
  /**
   * Resolves and returns the correct CRM Adapter for a given tenant based on their settings.
   */
  static async getAdapter(tenantId: string): Promise<Result<ICrmAdapter, AppError>> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      console.warn(`[CRM] Tenant settings not found for tenant ${tenantId}`);
      return fail(new AppError("Tenant settings not found"));
    }

    // O campo staysnetClientSecret armazena o token Base64 (encriptado).
    if (settings.staysnetClientSecret) {
      try {
        const base64Token = decrypt(settings.staysnetClientSecret);
        const domain = settings.staysnetDomain || "www.stays.net";
        console.log(`[CRM] StaysNet adapter initialized for tenant ${tenantId} | domain: ${domain} | token length: ${base64Token.length}`);
        const credentials = { base64Token, domain };
        return ok(new StaysNetAdapter(credentials));
      } catch (err: unknown) {
        console.error(`[CRM] Failed to decrypt Stays.net credentials for tenant ${tenantId}:`, err);
        return fail(new AppError("Failed to decrypt Stays.net credentials"));
      }
    }

    // Default fallback if no CRM is configured
    console.warn(`[CRM] No CRM integration configured for tenant ${tenantId} (staysnetClientSecret is empty)`);
    return fail(new AppError("No CRM integration configured for this tenant"));
  }
}
