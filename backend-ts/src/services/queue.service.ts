import { redis } from "../lib/redis.js";

function queueKey(tenantId: string): string {
  return `conversia:queue:${tenantId}`;
}

export async function enqueueConversation(
  tenantId: string,
  conversationId: string,
): Promise<void> {
  const key = queueKey(tenantId);

  // Avoid duplicates: check if already in queue
  const existing = await redis.lrange(key, 0, -1);
  if (!existing.includes(conversationId)) {
    await redis.rpush(key, conversationId);
  }
}

export async function dequeueConversation(
  tenantId: string,
): Promise<string | null> {
  const key = queueKey(tenantId);
  return redis.lpop(key);
}

export async function getQueueDepth(tenantId: string): Promise<number> {
  const key = queueKey(tenantId);
  return redis.llen(key);
}
