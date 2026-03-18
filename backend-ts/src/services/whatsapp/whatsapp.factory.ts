import { IWhatsAppProvider } from "./provider.interface.js";
import { OfficialWhatsAppProvider } from "./official.provider.js";
import { EvolutionWhatsAppProvider } from "./evolution.provider.js";

export class WhatsAppProviderFactory {
  /**
   * Determine which provider sent the webhook based on its structure
   */
  static detectProviderFromPayload(body: Record<string, unknown>): string {
    if (body.object === "whatsapp_business_account") {
      return "official";
    }
    if (body.event && body.instance) {
      return "evolution";
    }
    return "unknown";
  }

  /**
   * Get provider by explicit name
   */
  static getProvider(providerName: string): IWhatsAppProvider {
    switch (providerName) {
      case "official":
        return new OfficialWhatsAppProvider();
      case "evolution":
        return new EvolutionWhatsAppProvider();
      default:
        // Defaulting to evolution
        return new EvolutionWhatsAppProvider();
    }
  }
}
