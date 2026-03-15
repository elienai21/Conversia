import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.models import Conversation, Message, User
from app.db.session import get_db
from app.schemas.suggestion import SuggestionOut, SuggestionRequest
from app.services.copilot_service import generate_suggestion

router = APIRouter()


@router.post("/{conversation_id}/suggestion", response_model=SuggestionOut)
async def request_suggestion(
    conversation_id: uuid.UUID,
    body: SuggestionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an AI reply suggestion for a customer message.

    The agent requests a suggestion for a specific message within a conversation.
    """
    # Verify conversation belongs to agent's tenant
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == user.tenant_id,
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Agents can only get suggestions for their assigned conversations
    if user.role == "agent" and conversation.assigned_agent_id != user.id:
        raise HTTPException(status_code=403, detail="Not assigned to this conversation")

    # Verify message belongs to this conversation
    result = await db.execute(
        select(Message).where(
            Message.id == body.message_id,
            Message.conversation_id == conversation_id,
        )
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")

    suggestion = await generate_suggestion(
        db=db,
        tenant_id=user.tenant_id,
        message=message,
        agent_id=user.id,
        agent_language=user.preferred_language,
    )

    return SuggestionOut(
        id=suggestion.id,
        message_id=suggestion.message_id,
        suggestion_text=suggestion.suggestion_text,
        suggestion_language=suggestion.suggestion_language,
        was_used=suggestion.was_used,
        created_at=suggestion.created_at,
    )
