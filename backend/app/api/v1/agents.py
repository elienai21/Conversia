from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.agent import AgentOut, AgentStatusUpdate
from app.services.assignment_service import get_active_conversation_count

router = APIRouter()


@router.get("/me", response_model=AgentOut)
async def get_my_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current agent's profile and stats."""
    active_count = await get_active_conversation_count(db, user.id)

    return AgentOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        preferred_language=user.preferred_language,
        is_online=user.is_online,
        max_concurrent_conversations=user.max_concurrent_conversations,
        active_conversations_count=active_count,
        created_at=user.created_at,
    )


@router.patch("/me/status", response_model=AgentOut)
async def update_my_status(
    body: AgentStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle agent online/offline status."""
    user.is_online = body.is_online
    await db.flush()

    active_count = await get_active_conversation_count(db, user.id)

    return AgentOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        preferred_language=user.preferred_language,
        is_online=user.is_online,
        max_concurrent_conversations=user.max_concurrent_conversations,
        active_conversations_count=active_count,
        created_at=user.created_at,
    )
