"""
STEP 7: Round-robin agent assignment.

Picks the online agent with the fewest active conversations,
respecting the max_concurrent_conversations limit.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, User


async def find_available_agent(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> User | None:
    """
    Find the best available agent using round-robin (least-busy-first).

    Criteria:
    1. Belongs to this tenant
    2. Role is 'agent'
    3. Is online
    4. Is active
    5. Has fewer active conversations than their limit
    6. Among eligible agents, pick the one with fewest active conversations
    """
    # Subquery: count active conversations per agent
    active_count = (
        select(
            Conversation.assigned_agent_id,
            func.count(Conversation.id).label("active_count"),
        )
        .where(
            Conversation.tenant_id == tenant_id,
            Conversation.status.in_(["new", "in_progress"]),
            Conversation.assigned_agent_id.isnot(None),
        )
        .group_by(Conversation.assigned_agent_id)
        .subquery()
    )

    # Main query: find agent with capacity
    result = await db.execute(
        select(User)
        .outerjoin(active_count, User.id == active_count.c.assigned_agent_id)
        .where(
            User.tenant_id == tenant_id,
            User.role == "agent",
            User.is_online == True,
            User.is_active == True,
        )
        .having(
            func.coalesce(active_count.c.active_count, 0)
            < User.max_concurrent_conversations
        )
        .group_by(User.id, active_count.c.active_count)
        .order_by(func.coalesce(active_count.c.active_count, 0).asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def assign_conversation_to_agent(
    db: AsyncSession,
    conversation: "Conversation",
    agent: User,
) -> None:
    """Assign a conversation to an agent and set status to in_progress."""
    conversation.assigned_agent_id = agent.id
    if conversation.status == "new":
        conversation.status = "in_progress"
    await db.flush()


async def get_active_conversation_count(
    db: AsyncSession,
    agent_id: uuid.UUID,
) -> int:
    """Count how many active conversations an agent has."""
    result = await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.assigned_agent_id == agent_id,
            Conversation.status.in_(["new", "in_progress"]),
        )
    )
    return result.scalar_one()
