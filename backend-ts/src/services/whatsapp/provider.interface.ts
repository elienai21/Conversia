export type MessageAttachmentType = "image" | "video" | "audio" | "document";

export interface MessageAttachmentInput {
  type: MessageAttachmentType;
  mimeType?: string;
  fileName?: string;
  fileSizeBytes?: number;
  providerMediaId?: string;
  sourceUrl?: string;
}

export interface IncomingWhatsappMessage {
  from: string;
  messageId: string;
  text: string;
  displayName?: string;
  providerId: string; // Used to resolve tenant, e.g. phoneNumberId for Official, instanceName for Evolution
  attachments?: MessageAttachmentInput[];
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
