from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AgentOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    preferred_language: str
    is_online: bool
    max_concurrent_conversations: int
    active_conversations_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentStatusUpdate(BaseModel):
    is_online: bool
