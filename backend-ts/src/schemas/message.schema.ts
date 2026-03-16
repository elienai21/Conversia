import { z } from "zod";

export const sendMessageRequestSchema = z.object({
  text: z.string().min(1),
  suggestion_id: z.string().uuid().optional(),
});

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
}
