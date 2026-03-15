"""
MessageTranslation model - a translation of a message into another language.

Keeps the original message immutable. Each translation is a separate row.
"""

import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MessageTranslation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "message_translations"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id"), nullable=False
    )

    source_language: Mapped[str] = mapped_column(String(10), nullable=False)
    target_language: Mapped[str] = mapped_column(String(10), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)

    # Which service did the translation
    provider: Mapped[str] = mapped_column(
        String(20), nullable=False, default="deepl"
    )  # deepl | openai

    # Relationships
    message: Mapped["Message"] = relationship(back_populates="translations")

    __table_args__ = (
        Index(
            "ix_translations_message_target",
            "message_id",
            "target_language",
            unique=True,
        ),
    )
