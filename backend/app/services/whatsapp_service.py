"""
WhatsApp Cloud API integration.

Handles:
- Parsing incoming webhook payloads
- Sending outbound messages
- Resolving tenant from phone_number_id
"""

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Tenant

logger = logging.getLogger(__name__)


def parse_incoming_message(payload: dict) -> list[dict]:
    """
    Parse WhatsApp Cloud API webhook payload.

    Returns a list of parsed messages, each containing:
    - phone_number_id: the business phone number that received the message
    - from_phone: sender's phone number
    - message_text: the text content
    - message_id: WhatsApp message ID (for deduplication)
    """
    messages = []

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id")

            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue  # MVP: only handle text messages

                messages.append(
                    {
                        "phone_number_id": phone_number_id,
                        "from_phone": msg["from"],
                        "message_text": msg["text"]["body"],
                        "message_id": msg["id"],
                    }
                )

    return messages


async def resolve_tenant(
    db: AsyncSession, phone_number_id: str
) -> Tenant | None:
    """Find the tenant that owns this WhatsApp phone number."""
    result = await db.execute(
        select(Tenant).where(
            Tenant.whatsapp_phone_number_id == phone_number_id,
            Tenant.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def send_whatsapp_message(
    phone_number_id: str,
    to_phone: str,
    text: str,
) -> bool:
    """
    Send a text message via WhatsApp Cloud API.

    Returns True if sent successfully.
    """
    url = f"{settings.WHATSAPP_API_URL}/{phone_number_id}/messages"

    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": text},
    }

    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return True
    except Exception:
        logger.exception("Failed to send WhatsApp message to %s", to_phone)
        return False
