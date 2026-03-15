"""
Message model - a single message in a conversation.

The original_text is IMMUTABLE. Translations live in message_translations.
sender_type indicates who sent the message (customer, agent, or system).
"""

import uuid

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Message(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )

    # Who sent this message
    sender_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # customer | agent | system
    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True)
    )  # user.id if agent, customer.id if customer

    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    detected_language: Mapped[str | None] = mapped_column(String(10))

    # WhatsApp message ID for deduplication
    external_id: Mapped[str | None] = mapped_column(String(100))

    # Relationships
    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    translations: Mapped[list["MessageTranslation"]] = relationship(
        back_populates="message"
    )
    ai_suggestion: Mapped["AISuggestion | None"] = relationship(
        back_populates="message", uselist=False
    )

    __table_args__ = (
        Index("ix_messages_conversation", "conversation_id", "created_at"),
        Index("ix_messages_external_id", "external_id", unique=True),
    )
