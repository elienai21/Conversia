import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.models import AISuggestion, Conversation, User
from app.db.session import get_db
from app.schemas.message import MessageOut, SendMessageRequest, TranslationOut
from app.services.message_service import (
    get_conversation_messages,
    save_message,
    save_translation,
)
from app.services.translation_service import translate_text
from app.services.whatsapp_service import send_whatsapp_message

router = APIRouter()


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all messages in a conversation."""
    conversation = await _get_agent_conversation(db, user, conversation_id)
    messages = await get_conversation_messages(db, conversation.id)

    return [
        MessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_type=m.sender_type,
            sender_id=m.sender_id,
            original_text=m.original_text,
            detected_language=m.detected_language,
            created_at=m.created_at,
            translations=[
                TranslationOut(
                    target_language=t.target_language,
                    translated_text=t.translated_text,
                    provider=t.provider,
                )
                for t in m.translations
            ],
        )
        for m in messages
    ]


@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Agent sends a reply to the customer.

    Flow:
    1. Save agent message
    2. Translate to customer's language if needed
    3. Send via WhatsApp
    4. Mark suggestion as used (if suggestion_id provided)
    """
    conversation = await _get_agent_conversation(db, user, conversation_id)

    # 1. Save agent message
    message = await save_message(
        db=db,
        conversation_id=conversation.id,
        sender_type="agent",
        sender_id=user.id,
        text=body.text,
        detected_language=user.preferred_language,
    )

    # 2. Translate to customer language if different
    customer_lang = conversation.detected_language
    agent_lang = user.preferred_language
    translations = []

    if customer_lang and customer_lang != agent_lang:
        translated_text, provider = await translate_text(
            db=db,
            tenant_id=user.tenant_id,
            text=body.text,
            source_language=agent_lang,
            target_language=customer_lang,
        )

        translation = await save_translation(
            db=db,
            message_id=message.id,
            source_language=agent_lang,
            target_language=customer_lang,
            translated_text=translated_text,
            provider=provider,
        )
        translations.append(translation)

        # Send translated text to customer
        outbound_text = translated_text
    else:
        # Same language, send as-is
        outbound_text = body.text

    # 3. Send via WhatsApp
    if conversation.channel == "whatsapp" and conversation.customer:
        # Load tenant for WhatsApp config
        from app.db.models import Tenant

        result = await db.execute(
            select(Tenant).where(Tenant.id == user.tenant_id)
        )
        tenant = result.scalar_one_or_none()

        if tenant and tenant.whatsapp_phone_number_id:
            await send_whatsapp_message(
                phone_number_id=tenant.whatsapp_phone_number_id,
                to_phone=conversation.customer.phone,
                text=outbound_text,
            )

    # 4. Mark suggestion as used if provided
    if body.suggestion_id:
        result = await db.execute(
            select(AISuggestion).where(
                AISuggestion.id == body.suggestion_id,
                AISuggestion.agent_id == user.id,
            )
        )
        suggestion = result.scalar_one_or_none()
        if suggestion:
            suggestion.was_used = True
            suggestion.final_text = body.text

    await db.flush()

    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_type=message.sender_type,
        sender_id=message.sender_id,
        original_text=message.original_text,
        detected_language=message.detected_language,
        created_at=message.created_at,
        translations=[
            TranslationOut(
                target_language=t.target_language,
                translated_text=t.translated_text,
                provider=t.provider,
            )
            for t in translations
        ],
    )


async def _get_agent_conversation(
    db: AsyncSession, user: User, conversation_id: uuid.UUID
) -> Conversation:
    """Get a conversation ensuring it belongs to the user's tenant.

    Agents can only access their assigned conversations.
    """
    from sqlalchemy.orm import selectinload

    query = (
        select(Conversation)
        .options(selectinload(Conversation.customer))
        .where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == user.tenant_id,
        )
    )

    if user.role == "agent":
        query = query.where(Conversation.assigned_agent_id == user.id)

    result = await db.execute(query)
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation
