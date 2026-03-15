"""
WhatsApp webhook endpoint.

STEP 6 - Complete incoming message flow:
1. Validate webhook
2. Parse incoming message
3. Resolve tenant from phone_number_id
4. Find or create customer
5. Find or create active conversation
6. Save message (deduplicate by external_id)
7. Detect language
8. Detect intent
9. Translate message to agent's language
10. Enqueue conversation
11. Try to assign to available agent
"""

import logging

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Message
from app.db.session import get_db
from app.services import (
    assignment_service,
    conversation_service,
    language_service,
    intent_service,
    message_service,
    queue_service,
    translation_service,
    whatsapp_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/whatsapp")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """WhatsApp webhook verification (challenge-response)."""
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(status_code=403)


@router.post("/whatsapp")
async def receive_message(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Handle incoming WhatsApp messages.

    This is the main entry point for all customer messages.
    """
    payload = await request.json()
    parsed_messages = whatsapp_service.parse_incoming_message(payload)

    if not parsed_messages:
        return {"status": "ok"}

    redis_client = request.app.state.redis

    for msg_data in parsed_messages:
        try:
            await _process_incoming_message(db, redis_client, msg_data)
        except Exception:
            logger.exception(
                "Failed to process message %s", msg_data.get("message_id")
            )

    return {"status": "ok"}


async def _process_incoming_message(
    db: AsyncSession,
    redis_client,
    msg_data: dict,
) -> None:
    """Process a single incoming WhatsApp message through the full pipeline."""

    # 1. Resolve tenant
    tenant = await whatsapp_service.resolve_tenant(
        db, msg_data["phone_number_id"]
    )
    if tenant is None:
        logger.warning(
            "No tenant for phone_number_id=%s", msg_data["phone_number_id"]
        )
        return

    # 2. Deduplicate - skip if we already processed this WhatsApp message
    existing = await db.execute(
        select(Message).where(Message.external_id == msg_data["message_id"])
    )
    if existing.scalar_one_or_none() is not None:
        return

    # 3. Find or create customer
    customer = await conversation_service.find_or_create_customer(
        db, tenant.id, msg_data["from_phone"]
    )

    # 4. Find or create conversation
    conversation = await conversation_service.find_or_create_conversation(
        db, tenant.id, customer.id
    )

    # 5. Detect language
    detected_lang = language_service.detect_language(msg_data["message_text"])

    # 6. Save message
    message = await message_service.save_message(
        db=db,
        conversation_id=conversation.id,
        sender_type="customer",
        sender_id=customer.id,
        text=msg_data["message_text"],
        detected_language=detected_lang,
        external_id=msg_data["message_id"],
    )

    # 7. Update conversation language
    if detected_lang:
        conversation.detected_language = detected_lang
        if customer.detected_language is None:
            customer.detected_language = detected_lang

    # 8. Detect intent
    intent = await intent_service.detect_intent(
        db, tenant.id, msg_data["message_text"]
    )
    conversation.detected_intent = intent

    # 9. Translate to tenant's default language (for agents)
    if detected_lang and detected_lang != tenant.default_language:
        translated_text, provider = await translation_service.translate_text(
            db=db,
            tenant_id=tenant.id,
            text=msg_data["message_text"],
            source_language=detected_lang,
            target_language=tenant.default_language,
        )
        await message_service.save_translation(
            db=db,
            message_id=message.id,
            source_language=detected_lang,
            target_language=tenant.default_language,
            translated_text=translated_text,
            provider=provider,
        )

    # 10. Enqueue conversation if new (not already assigned)
    if conversation.assigned_agent_id is None:
        await queue_service.enqueue_conversation(
            redis_client, tenant.id, conversation.id
        )

        # 11. Try to assign immediately
        agent = await assignment_service.find_available_agent(db, tenant.id)
        if agent:
            # Dequeue since we're assigning directly
            await queue_service.dequeue_conversation(redis_client, tenant.id)
            await assignment_service.assign_conversation_to_agent(
                db, conversation, agent
            )

    await db.flush()
