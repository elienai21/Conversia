import { z } from "zod";

export const conversationAssignSchema = z.object({
  agent_id: z.string().uuid(),
});

export const conversationStatusUpdateSchema = z.object({
  status: z.enum(["active", "waiting", "closed"]),
});

export interface ConversationOut {
  id: string;
  tenant_id: string;
  customer_id: string;
  assigned_agent_id: string | null;
  channel: string;
  status: string;
  detected_language: string | null;
  created_at: Date;
  updated_at: Date;
  customer: {
    phone: string;
    name: string | null;
    email?: string | null;
    tag?: string | null;
    role?: string;
    profile_picture_url?: string | null;
  } | null;
  unread_count?: number;
  last_message_preview?: string | null;
}
