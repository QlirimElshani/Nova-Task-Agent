from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    env: str = "development"

    # Default to a local SQLite file so the app runs with zero setup.
    database_url: str = "sqlite+aiosqlite:///./nova.db"

    # Anthropic / Nova. If the key is empty, the Nova service falls back
    # to a local rule-based parser so the endpoint still works.
    anthropic_api_key: str = ""
    nova_model: str = "claude-sonnet-4-6"

    # Auth / JWT. The default secret is for local dev only - set JWT_SECRET in prod.
    jwt_secret: str = "dev-insecure-change-me-please-set-a-real-secret-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    cors_origins: list[str] = ["*"]
    log_level: str = "INFO"

    @property
    def nova_enabled(self) -> bool:
        return bool(self.anthropic_api_key.strip())


settings = Settings()
