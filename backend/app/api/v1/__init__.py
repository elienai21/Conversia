from fastapi import APIRouter

from app.api.v1 import agents, auth, conversations, copilot, messages, whatsapp

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(whatsapp.router, prefix="/webhook", tags=["WhatsApp Webhook"])
router.include_router(conversations.router, prefix="/conversations", tags=["Conversations"])
router.include_router(messages.router, prefix="/conversations", tags=["Messages"])
router.include_router(copilot.router, prefix="/conversations", tags=["Copilot"])
router.include_router(agents.router, prefix="/agents", tags=["Agents"])
