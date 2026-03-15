import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_current_user
from app.db.models import Conversation, Customer, User
from app.db.session import get_db
from app.schemas.conversation import (
    ConversationAssign,
    ConversationOut,
    ConversationStatusUpdate,
)
from app.services.conversation_service import update_conversation_status

router = APIRouter()


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List conversations for the agent's tenant."""
    query = (
        select(Conversation)
        .options(selectinload(Conversation.customer))
        .where(Conversation.tenant_id == user.tenant_id)
        .order_by(Conversation.updated_at.desc())
    )

    if status_filter:
        query = query.where(Conversation.status == status_filter)

    # Agents see only their assigned conversations; admins see all
    if user.role == "agent":
        query = query.where(Conversation.assigned_agent_id == user.id)

    result = await db.execute(query)
    conversations = result.scalars().all()

    return [
        ConversationOut(
            id=c.id,
            customer_id=c.customer_id,
            assigned_agent_id=c.assigned_agent_id,
            status=c.status,
            channel=c.channel,
            detected_language=c.detected_language,
            detected_intent=c.detected_intent,
            created_at=c.created_at,
            updated_at=c.updated_at,
            customer_phone=c.customer.phone if c.customer else None,
            customer_name=(
                f"{c.customer.first_name or ''} {c.customer.last_name or ''}".strip()
                if c.customer
                else None
            ),
        )
        for c in conversations
    ]


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single conversation by ID."""
    conversation = await _get_tenant_conversation(db, user.tenant_id, conversation_id)
    return ConversationOut(
        id=conversation.id,
        customer_id=conversation.customer_id,
        assigned_agent_id=conversation.assigned_agent_id,
        status=conversation.status,
        channel=conversation.channel,
        detected_language=conversation.detected_language,
        detected_intent=conversation.detected_intent,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        customer_phone=conversation.customer.phone if conversation.customer else None,
        customer_name=(
            f"{conversation.customer.first_name or ''} {conversation.customer.last_name or ''}".strip()
            if conversation.customer
            else None
        ),
    )


@router.patch("/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: uuid.UUID,
    body: ConversationAssign,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually assign a conversation to an agent."""
    conversation = await _get_tenant_conversation(db, user.tenant_id, conversation_id)

    # Verify agent exists and belongs to same tenant
    result = await db.execute(
        select(User).where(User.id == body.agent_id, User.tenant_id == user.tenant_id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    conversation.assigned_agent_id = agent.id
    if conversation.status == "new":
        conversation.status = "in_progress"

    await db.flush()
    return {"status": "assigned", "agent_id": str(agent.id)}


@router.patch("/{conversation_id}/status")
async def update_status(
    conversation_id: uuid.UUID,
    body: ConversationStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update conversation status (e.g., resolve)."""
    conversation = await _get_tenant_conversation(db, user.tenant_id, conversation_id)

    try:
        await update_conversation_status(db, conversation, body.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": conversation.status}


async def _get_tenant_conversation(
    db: AsyncSession, tenant_id: uuid.UUID, conversation_id: uuid.UUID
) -> Conversation:
    """Get a conversation ensuring it belongs to the user's tenant."""
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.customer))
        .where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant_id,
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation
