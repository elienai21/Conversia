from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ConversationOut(BaseModel):
    id: UUID
    customer_id: UUID
    assigned_agent_id: UUID | None
    status: str
    channel: str
    detected_language: str | None
    detected_intent: str | None
    created_at: datetime
    updated_at: datetime

    # Nested customer info for inbox display
    customer_phone: str | None = None
    customer_name: str | None = None

    model_config = {"from_attributes": True}


class ConversationAssign(BaseModel):
    agent_id: UUID


class ConversationStatusUpdate(BaseModel):
    status: str  # new | in_progress | resolved
