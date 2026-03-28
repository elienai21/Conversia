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
  /** The original WhatsApp message key object (key only) */
  whatsappMessageKey?: Record<string, unknown>;
  /** The full WhatsApp message data object – used for fetching media via getBase64FromMediaMessage */
  whatsappMessageData?: Record<string, unknown>;
  /** The phone number of the specific participant who sent the message (if in a group) */
  participantPhone?: string;
  /** The push name of the specific participant who sent the message (if in a group) */
  participantName?: string;
  /** True when the message was sent by the business itself (fromMe) — not by the customer */
  fromMe?: boolean;
}

export interface MediaPayload {
  type: "image" | "video" | "audio" | "document";
  url: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
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

  /**
   * Send a media message to a recipient.
   */
  sendMedia(tenantId: string, to: string, media: MediaPayload): Promise<void>;

  /**
   * Creates a WhatsApp Group with the given participants.
   * Participants should be phone numbers.
   * Returns the newly created Group's JID (Platform-specific ID, usually ...@g.us).
   */
  createGroup?(tenantId: string, subject: string, participants: string[]): Promise<string>;
}
