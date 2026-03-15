"""
Intent detection using GPT-3.5-turbo.

MVP intents: greeting, booking, cancellation, complaint, question, request, farewell, other
"""

import uuid
import logging

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.usage_log_service import log_ai_usage

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """You are an intent classifier for a hotel customer support system.
Classify the customer message into exactly ONE of these intents:
greeting, booking, cancellation, complaint, question, request, farewell, other

Reply with only the intent name, nothing else."""


async def detect_intent(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    message_text: str,
) -> str:
    """Detect customer intent. Returns one of the predefined intent labels."""
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message_text},
            ],
            max_tokens=10,
            temperature=0.0,
        )

        intent = response.choices[0].message.content.strip().lower()

        # Log usage
        usage = response.usage
        if usage:
            await log_ai_usage(
                db=db,
                tenant_id=tenant_id,
                operation_type="intent_detection",
                model_name=settings.OPENAI_MODEL,
                tokens_input=usage.prompt_tokens,
                tokens_output=usage.completion_tokens,
            )

        valid_intents = {
            "greeting", "booking", "cancellation", "complaint",
            "question", "request", "farewell", "other",
        }
        return intent if intent in valid_intents else "other"

    except Exception:
        logger.exception("Intent detection failed")
        return "other"
