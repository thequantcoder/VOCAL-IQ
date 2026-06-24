"""Voice-service settings, validated at boot (Pydantic v2). Fail-fast, no secrets in code."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    voice_port: int = 8000

    # Wired in later days (LiveKit, providers) — optional at Day 0 so the service boots.
    database_url: str | None = None
    redis_url: str | None = None


settings = Settings()
