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
      return fail(new AppError("Tenant settings not found"));
    }

    // O campo staysnetClientSecret armazena o token Base64 (encriptado).
    if (settings.staysnetClientSecret) {
      try {
        const credentials = {
          base64Token: decrypt(settings.staysnetClientSecret),
          domain: settings.staysnetDomain || "www.stays.net",
        };
        return ok(new StaysNetAdapter(credentials));
      } catch (err: unknown) {
        return fail(new AppError("Failed to decrypt Stays.net credentials"));
      }
    }

    // Default fallback if no CRM is configured
    return fail(new AppError("No CRM integration configured for this tenant"));
  }
}
