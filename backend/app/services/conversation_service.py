"""
Conversation lifecycle management.

Handles finding/creating conversations and status transitions.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Customer


async def find_or_create_customer(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    phone: str,
) -> Customer:
    """Find customer by phone or create a new one."""
    result = await db.execute(
        select(Customer).where(
            Customer.tenant_id == tenant_id,
            Customer.phone == phone,
        )
    )
    customer = result.scalar_one_or_none()

    if customer is None:
        customer = Customer(tenant_id=tenant_id, phone=phone)
        db.add(customer)
        await db.flush()

    return customer


async def find_or_create_conversation(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    customer_id: uuid.UUID,
) -> Conversation:
    """
    Find an active conversation for this customer or create a new one.

    Active = status is 'new' or 'in_progress'.
    """
    result = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.customer_id == customer_id,
            Conversation.status.in_(["new", "in_progress"]),
        )
    )
    conversation = result.scalar_one_or_none()

    if conversation is None:
        conversation = Conversation(
            tenant_id=tenant_id,
            customer_id=customer_id,
            channel="whatsapp",
        )
        db.add(conversation)
        await db.flush()

    return conversation


VALID_TRANSITIONS = {
    "new": {"in_progress", "resolved"},
    "in_progress": {"resolved"},
    "resolved": set(),  # Terminal for MVP
}


async def update_conversation_status(
    db: AsyncSession,
    conversation: Conversation,
    new_status: str,
) -> Conversation:
    """Update conversation status with transition validation."""
    allowed = VALID_TRANSITIONS.get(conversation.status, set())
    if new_status not in allowed:
        raise ValueError(
            f"Cannot transition from '{conversation.status}' to '{new_status}'"
        )

    conversation.status = new_status
    await db.flush()
    return conversation
