"""
STEP 8: AI Copilot - generates one reply suggestion per customer message.

Uses GPT-3.5-turbo with conversation history as context.
No RAG, no caching, no complexity scoring.
"""

import logging
import uuid

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import AISuggestion, Message
from app.services.message_service import get_recent_messages
from app.services.usage_log_service import log_ai_usage

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """You are a helpful hotel customer support assistant.

Your job is to suggest a professional, friendly reply that an agent can send to a hotel guest.

Guidelines:
- Be warm and professional
- Answer the guest's question directly
- If you don't know something specific (room availability, pricing), say you'll check and get back to them
- Keep the response concise (2-3 sentences)
- Match the tone to the situation (empathetic for complaints, enthusiastic for bookings)
- Reply in {language}"""


async def generate_suggestion(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    message: Message,
    agent_id: uuid.UUID,
    agent_language: str,
) -> AISuggestion:
    """
    Generate one AI reply suggestion for a customer message.

    Args:
        db: Database session
        tenant_id: Tenant ID for usage logging
        message: The customer message to respond to
        agent_id: The agent who will see this suggestion
        agent_language: Language for the suggestion (agent's preferred language)

    Returns:
        The created AISuggestion record
    """
    # Build conversation context from recent messages
    recent_messages = await get_recent_messages(
        db, message.conversation_id, limit=10
    )

    chat_messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(language=agent_language),
        }
    ]

    for msg in recent_messages:
        role = "assistant" if msg.sender_type == "agent" else "user"
        chat_messages.append({"role": role, "content": msg.original_text})

    # If the latest message isn't already in our context (just created), add it
    if not recent_messages or recent_messages[-1].id != message.id:
        chat_messages.append({"role": "user", "content": message.original_text})

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=chat_messages,
            max_tokens=200,
            temperature=0.7,
        )

        suggestion_text = response.choices[0].message.content.strip()

        # Log usage
        usage = response.usage
        if usage:
            await log_ai_usage(
                db=db,
                tenant_id=tenant_id,
                operation_type="copilot_suggestion",
                model_name=settings.OPENAI_MODEL,
                tokens_input=usage.prompt_tokens,
                tokens_output=usage.completion_tokens,
            )

    except Exception:
        logger.exception("Copilot suggestion generation failed")
        suggestion_text = "[AI suggestion unavailable - please compose your reply manually]"

    # Save suggestion
    suggestion = AISuggestion(
        message_id=message.id,
        agent_id=agent_id,
        suggestion_text=suggestion_text,
        suggestion_language=agent_language,
    )
    db.add(suggestion)
    await db.flush()

    return suggestion
