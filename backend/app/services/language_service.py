"""
Language detection using langdetect library. No LLM cost.
"""

from langdetect import detect, LangDetectException


def detect_language(text: str) -> str | None:
    """Detect the language of a text string. Returns ISO 639-1 code or None."""
    try:
        return detect(text)
    except LangDetectException:
        return None
