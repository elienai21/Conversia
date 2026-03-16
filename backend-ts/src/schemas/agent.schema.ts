import { z } from "zod";

export const agentStatusUpdateSchema = z.object({
  is_online: z.boolean(),
});

export interface AgentOut {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  preferred_language: string;
  is_online: boolean;
  max_concurrent_conversations: number;
  active_conversations_count: number;
  created_at: Date;
}
