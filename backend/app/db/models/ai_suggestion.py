"""
AISuggestion model - an AI-generated reply suggestion for the agent.

MVP: One suggestion per incoming customer message.
Tracks whether the agent used it and what they actually sent.
"""

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AISuggestion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ai_suggestions"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id"), nullable=False, unique=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    # The generated suggestion (in agent's language)
    suggestion_text: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion_language: Mapped[str] = mapped_column(String(10), nullable=False)

    # Tracking
    was_used: Mapped[bool] = mapped_column(Boolean, default=False)
    # What the agent actually sent (if different from suggestion)
    final_text: Mapped[str | None] = mapped_column(Text)

    # Relationships
    message: Mapped["Message"] = relationship(back_populates="ai_suggestion")

    __table_args__ = (
        Index("ix_ai_suggestions_agent", "agent_id"),
    )
