import { z } from "zod";

export const suggestionRequestSchema = z.object({
  message_id: z.string().uuid(),
});

export interface SuggestionOut {
  id: string;
  message_id: string;
  suggestion_text: string;
  suggestion_language: string;
  was_used: boolean;
  created_at: Date;
}
