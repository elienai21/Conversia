from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TranslationOut(BaseModel):
    target_language: str
    translated_text: str
    provider: str

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_type: str
    sender_id: UUID | None
    original_text: str
    detected_language: str | None
    created_at: datetime
    translations: list[TranslationOut] = []

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    """Agent sends a reply to the customer."""
    text: str
    suggestion_id: UUID | None = None  # If replying using a suggestion
