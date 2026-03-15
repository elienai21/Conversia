"""
Tenant model - the root of multi-tenant isolation.

Every hotel/company is a tenant. All business data references tenant_id.
"""

import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Tenant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # WhatsApp configuration
    whatsapp_phone_number_id: Mapped[str | None] = mapped_column(String(50))
    whatsapp_business_account_id: Mapped[str | None] = mapped_column(String(50))

    # Default language for agents in this tenant
    default_language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="en"
    )

    is_active: Mapped[bool] = mapped_column(default=True)

    # Relationships
    users: Mapped[list["User"]] = relationship(back_populates="tenant")
    customers: Mapped[list["Customer"]] = relationship(back_populates="tenant")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="tenant")
