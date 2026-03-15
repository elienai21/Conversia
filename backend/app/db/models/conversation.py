"""
Conversation model - a thread between a customer and the hotel.

MVP status values: new, in_progress, resolved
A customer has at most one active (non-resolved) conversation per tenant.
"""

import uuid

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Conversation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "conversations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False
    )
    assigned_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new"
    )  # new | in_progress | resolved

    channel: Mapped[str] = mapped_column(
        String(20), nullable=False, default="whatsapp"
    )

    # Language detected from the customer's messages
    detected_language: Mapped[str | None] = mapped_column(String(10))
    # Latest detected intent
    detected_intent: Mapped[str | None] = mapped_column(String(100))

    # Relationships
    tenant: Mapped["Tenant"] = relationship(back_populates="conversations")
    customer: Mapped["Customer"] = relationship(back_populates="conversations")
    assigned_agent: Mapped["User | None"] = relationship(
        back_populates="assigned_conversations"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at"
    )

    __table_args__ = (
        Index("ix_conversations_tenant_status", "tenant_id", "status"),
        Index("ix_conversations_tenant_customer", "tenant_id", "customer_id"),
        Index("ix_conversations_assigned_agent", "assigned_agent_id"),
    )
