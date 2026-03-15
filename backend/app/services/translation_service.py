"""
Translation service using DeepL API.

Falls back to OpenAI if DeepL key is not configured.
"""

import logging
import uuid

import deepl
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.usage_log_service import log_ai_usage

logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# DeepL language code mapping (DeepL uses uppercase and some differ from ISO 639-1)
DEEPL_LANG_MAP = {
    "en": "EN-US",
    "es": "ES",
    "pt": "PT-BR",
    "fr": "FR",
    "de": "DE",
    "it": "IT",
    "ja": "JA",
    "zh": "ZH-HANS",
    "ko": "KO",
    "nl": "NL",
    "pl": "PL",
    "ru": "RU",
}


async def translate_text(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    text: str,
    source_language: str,
    target_language: str,
) -> tuple[str, str]:
    """
    Translate text from source to target language.

    Returns (translated_text, provider).
    """
    if source_language == target_language:
        return text, "none"

    # Try DeepL first
    if settings.DEEPL_API_KEY:
        try:
            return await _translate_deepl(text, source_language, target_language)
        except Exception:
            logger.warning("DeepL translation failed, falling back to OpenAI")

    # Fallback to OpenAI
    return await _translate_openai(db, tenant_id, text, source_language, target_language)


async def _translate_deepl(
    text: str, source_lang: str, target_lang: str
) -> tuple[str, str]:
    translator = deepl.Translator(settings.DEEPL_API_KEY)
    target_code = DEEPL_LANG_MAP.get(target_lang, target_lang.upper())

    result = translator.translate_text(text, target_lang=target_code)
    return result.text, "deepl"


async def _translate_openai(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    text: str,
    source_lang: str,
    target_lang: str,
) -> tuple[str, str]:
    response = await openai_client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": f"Translate the following text from {source_lang} to {target_lang}. "
                "Return only the translation, nothing else.",
            },
            {"role": "user", "content": text},
        ],
        max_tokens=500,
        temperature=0.1,
    )

    translated = response.choices[0].message.content.strip()

    usage = response.usage
    if usage:
        await log_ai_usage(
            db=db,
            tenant_id=tenant_id,
            operation_type="translation",
            model_name=settings.OPENAI_MODEL,
            tokens_input=usage.prompt_tokens,
            tokens_output=usage.completion_tokens,
        )

    return translated, "openai"
