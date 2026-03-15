"""
AIUsageLog model - append-only log of all AI operations.

Tracks token usage and cost for analytics and billing visibility.
No budget enforcement in MVP - just logging.
"""

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AIUsageLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ai_usage_log"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )

    # What operation was performed
    operation_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # intent_detection | translation | copilot_suggestion

    model_name: Mapped[str] = mapped_column(String(100), nullable=False)

    tokens_input: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_output: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 6), nullable=False, default=0
    )

    __table_args__ = (
        Index("ix_ai_usage_tenant_date", "tenant_id", "created_at"),
        Index("ix_ai_usage_operation", "operation_type"),
    )
