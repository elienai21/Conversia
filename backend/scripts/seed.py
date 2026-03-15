"""
Seed script - creates a test tenant, admin user, and agent for development.

Usage:
    python -m scripts.seed

Run from the backend/ directory.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.models import Tenant, User
from app.db.session import async_session_factory


async def seed():
    async with async_session_factory() as db:
        # Check if already seeded
        result = await db.execute(
            select(Tenant).where(Tenant.slug == "hotel-demo")
        )
        if result.scalar_one_or_none():
            print("Seed data already exists. Skipping.")
            return

        # Create tenant
        tenant = Tenant(
            name="Hotel Demo",
            slug="hotel-demo",
            whatsapp_phone_number_id="123456789",
            whatsapp_business_account_id="987654321",
            default_language="en",
        )
        db.add(tenant)
        await db.flush()

        # Create admin user
        admin = User(
            tenant_id=tenant.id,
            email="admin@hoteldemo.com",
            password_hash=hash_password("admin123"),
            full_name="Admin User",
            role="admin",
            preferred_language="en",
            is_online=True,
        )
        db.add(admin)

        # Create agent user
        agent = User(
            tenant_id=tenant.id,
            email="agent@hoteldemo.com",
            password_hash=hash_password("agent123"),
            full_name="Maria Silva",
            role="agent",
            preferred_language="pt",
            is_online=True,
            max_concurrent_conversations=5,
        )
        db.add(agent)

        # Create a second agent
        agent2 = User(
            tenant_id=tenant.id,
            email="agent2@hoteldemo.com",
            password_hash=hash_password("agent123"),
            full_name="John Smith",
            role="agent",
            preferred_language="en",
            is_online=False,
            max_concurrent_conversations=5,
        )
        db.add(agent2)

        await db.commit()

        print("Seed data created successfully!")
        print(f"  Tenant: {tenant.name} (ID: {tenant.id})")
        print(f"  Admin:  admin@hoteldemo.com / admin123")
        print(f"  Agent:  agent@hoteldemo.com / agent123 (Portuguese)")
        print(f"  Agent:  agent2@hoteldemo.com / agent123 (English, offline)")


if __name__ == "__main__":
    asyncio.run(seed())
