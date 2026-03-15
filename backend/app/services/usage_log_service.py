"""
STEP 9: AI Usage Logging

Append-only log of every AI operation. No enforcement, just tracking.
"""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AIUsageLog


# GPT-3.5-turbo pricing (March 2026)
PRICING = {
    "gpt-3.5-turbo": {"input": Decimal("0.0005"), "output": Decimal("0.0015")},  # per 1k tokens
}


def estimate_cost(
    model: str, tokens_input: int, tokens_output: int
) -> Decimal:
    prices = PRICING.get(model, PRICING["gpt-3.5-turbo"])
    cost = (Decimal(tokens_input) / 1000 * prices["input"]) + (
        Decimal(tokens_output) / 1000 * prices["output"]
    )
    return cost.quantize(Decimal("0.000001"))


async def log_ai_usage(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    operation_type: str,
    model_name: str,
    tokens_input: int,
    tokens_output: int,
) -> None:
    cost = estimate_cost(model_name, tokens_input, tokens_output)
    entry = AIUsageLog(
        tenant_id=tenant_id,
        operation_type=operation_type,
        model_name=model_name,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        cost_usd=cost,
    )
    db.add(entry)
