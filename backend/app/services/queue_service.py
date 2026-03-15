"""
STEP 7: Simple FIFO queue using Redis.

Each tenant has its own queue. Conversations are enqueued when new
and dequeued when an agent becomes available.
"""

import uuid

import redis.asyncio as aioredis

from app.core.config import settings


def _queue_key(tenant_id: uuid.UUID) -> str:
    return f"queue:{tenant_id}"


async def get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def enqueue_conversation(
    redis_client: aioredis.Redis,
    tenant_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> None:
    """Add conversation to the end of the tenant's FIFO queue."""
    key = _queue_key(tenant_id)
    # Only add if not already in queue
    members = await redis_client.lrange(key, 0, -1)
    cid = str(conversation_id)
    if cid not in members:
        await redis_client.rpush(key, cid)


async def dequeue_conversation(
    redis_client: aioredis.Redis,
    tenant_id: uuid.UUID,
) -> uuid.UUID | None:
    """Pop the next conversation from the front of the queue."""
    key = _queue_key(tenant_id)
    cid = await redis_client.lpop(key)
    if cid:
        return uuid.UUID(cid)
    return None


async def get_queue_depth(
    redis_client: aioredis.Redis,
    tenant_id: uuid.UUID,
) -> int:
    """Get the number of conversations waiting in queue."""
    key = _queue_key(tenant_id)
    return await redis_client.llen(key)
