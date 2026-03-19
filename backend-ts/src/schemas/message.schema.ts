import { z } from "zod";

export const sendMessageRequestSchema = z.object({
  text: z.string().min(1),
  suggestion_id: z.string().uuid().optional(),
  target_language: z.string().optional(),
});

export interface AttachmentOut {
  id: string;
  type: string;
  mime_type: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  source_url: string | null;
  provider_media_id: string | null;
}

export interface TranslationOut {
  target_language: string;
  translated_text: string;
  provider: string;
}

export interface MessageOut {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  original_text: string;
  detected_language: string | null;
  created_at: Date;
  translations: TranslationOut[];
  attachments?: AttachmentOut[];
}
