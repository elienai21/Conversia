export interface IncomingWhatsappMessage {
  from: string;
  messageId: string;
  text: string;
  displayName?: string;
  providerId: string; // Used to resolve tenant, e.g. phoneNumberId for Official, instanceName for Evolution
}

export interface IWhatsAppProvider {
  /**
   * Parse an incoming webhook payload and return any extracted messages.
   * If the payload is not for this provider or is invalid, return null/empty.
   */
  parseWebhooks(body: Record<string, unknown>): IncomingWhatsappMessage[];

  /**
   * Send a text message to a recipient.
   */
  sendMessage(tenantId: string, to: string, text: string): Promise<void>;
}
