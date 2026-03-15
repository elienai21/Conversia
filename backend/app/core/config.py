from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Conversia"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/conversia"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-3.5-turbo"

    # DeepL
    DEEPL_API_KEY: str = ""

    # WhatsApp
    WHATSAPP_VERIFY_TOKEN: str = "conversia-webhook-verify"
    WHATSAPP_API_TOKEN: str = ""
    WHATSAPP_API_URL: str = "https://graph.facebook.com/v21.0"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
