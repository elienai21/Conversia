"""
User model - agents and admins who use the platform.

Agents handle conversations. Admins manage the tenant.
"""

import uuid

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )

    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="agent"
    )  # admin | agent

    preferred_language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="en"
    )

    # Agent availability
    is_online: Mapped[bool] = mapped_column(default=False)
    max_concurrent_conversations: Mapped[int] = mapped_column(default=5)

    is_active: Mapped[bool] = mapped_column(default=True)

    # Relationships
    tenant: Mapped["Tenant"] = relationship(back_populates="users")
    assigned_conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="assigned_agent"
    )

    __table_args__ = (
        Index("ix_users_tenant_email", "tenant_id", "email", unique=True),
        Index("ix_users_tenant_role", "tenant_id", "role"),
        Index("ix_users_tenant_online", "tenant_id", "is_online"),
    )
