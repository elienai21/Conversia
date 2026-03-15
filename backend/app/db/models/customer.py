"""
Customer model - the hotel guest or end-user.

MVP: Identified by phone number (WhatsApp) only.
Email is optional and stored if provided.
"""

import uuid

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Customer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "customers"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )

    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))

    # Detected from first conversation
    detected_language: Mapped[str | None] = mapped_column(String(10))

    # Relationships
    tenant: Mapped["Tenant"] = relationship(back_populates="customers")
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="customer"
    )

    __table_args__ = (
        Index("ix_customers_tenant_phone", "tenant_id", "phone", unique=True),
    )
