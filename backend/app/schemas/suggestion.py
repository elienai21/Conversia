from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SuggestionOut(BaseModel):
    id: UUID
    message_id: UUID
    suggestion_text: str
    suggestion_language: str
    was_used: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SuggestionRequest(BaseModel):
    """Request a suggestion for a specific customer message."""
    message_id: UUID
