import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";

interface AgentRow {
  id: string;
  active_count: bigint;
}

export async function findAvailableAgent(
  tenantId: string,
): Promise<string | null> {
  // Find the online agent with the least active conversations (least-busy-first)
  const agents = await prisma.$queryRaw<AgentRow[]>(
    Prisma.sql`
      SELECT u.id, COUNT(c.id) AS active_count
      FROM users u
      LEFT JOIN conversations c
        ON c.assigned_agent_id = u.id
        AND c.status NOT IN ('closed')
      WHERE u.tenant_id = ${tenantId}::uuid
        AND u.role = 'agent'
        AND u.is_online = true
        AND u.is_active = true
      GROUP BY u.id, u.max_concurrent_conversations
      HAVING COUNT(c.id) < u.max_concurrent_conversations
      ORDER BY active_count ASC
      LIMIT 1
    `,
  );

  return agents.length > 0 ? agents[0].id : null;
}

export async function assignConversationToAgent(
  conversationId: string,
  agentId: string,
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      assignedAgentId: agentId,
      status: "active",
    },
  });
}

export async function getActiveConversationCount(
  agentId: string,
): Promise<number> {
  return prisma.conversation.count({
    where: {
      assignedAgentId: agentId,
      status: { not: "closed" },
    },
  });
}
