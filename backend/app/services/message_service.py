"""
Message storage and retrieval.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Message, MessageTranslation


async def save_message(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    sender_type: str,
    sender_id: uuid.UUID | None,
    text: str,
    detected_language: str | None = None,
    external_id: str | None = None,
) -> Message:
    """Create and persist a new message."""
    message = Message(
        conversation_id=conversation_id,
        sender_type=sender_type,
        sender_id=sender_id,
        original_text=text,
        detected_language=detected_language,
        external_id=external_id,
    )
    db.add(message)
    await db.flush()
    return message


async def save_translation(
    db: AsyncSession,
    message_id: uuid.UUID,
    source_language: str,
    target_language: str,
    translated_text: str,
    provider: str,
) -> MessageTranslation:
    """Save a translation for a message."""
    translation = MessageTranslation(
        message_id=message_id,
        source_language=source_language,
        target_language=target_language,
        translated_text=translated_text,
        provider=provider,
    )
    db.add(translation)
    await db.flush()
    return translation


async def get_conversation_messages(
    db: AsyncSession,
    conversation_id: uuid.UUID,
) -> list[Message]:
    """Get all messages in a conversation with their translations."""
    result = await db.execute(
        select(Message)
        .options(selectinload(Message.translations))
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return list(result.scalars().all())


async def get_recent_messages(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    limit: int = 10,
) -> list[Message]:
    """Get the most recent messages (for copilot context)."""
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list(result.scalars().all())
    messages.reverse()  # Chronological order
    return messages
