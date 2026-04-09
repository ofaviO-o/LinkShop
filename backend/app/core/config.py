import os
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LinkShop API"
    app_env: Literal["development", "test", "production"] = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    web_concurrency: int = 1
    run_migrations_on_startup: bool = False
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/linkshop"
    auth_secret_key: SecretStr = SecretStr("change-me-in-development")
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    alert_price_drop_threshold_percentage: float = 1.0
    log_level: str = "INFO"
    integration_json_feed_path: str = "backend/app/integrations/fixtures/sample_partner_feed.json"

    model_config = SettingsConfigDict(
        env_file="backend/.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @model_validator(mode="after")
    def validate_runtime_settings(self) -> "Settings":
        port_override = os.getenv("PORT")
        app_port_explicit = os.getenv("APP_PORT")
        if port_override and not app_port_explicit:
            try:
                self.app_port = int(port_override)
            except ValueError as exc:
                raise ValueError("PORT must be an integer when provided") from exc

        if self.is_production and self.app_debug:
            raise ValueError("APP_DEBUG must be false in production")

        if self.is_production and self.auth_secret_key.get_secret_value() == "change-me-in-development":
            raise ValueError("AUTH_SECRET_KEY must be overridden in production")

        if self.app_port <= 0:
            raise ValueError("APP_PORT must be greater than zero")

        if self.web_concurrency <= 0:
            raise ValueError("WEB_CONCURRENCY must be greater than zero")

        if self.access_token_ttl_minutes <= 0:
            raise ValueError("ACCESS_TOKEN_TTL_MINUTES must be greater than zero")

        if self.refresh_token_ttl_days <= 0:
            raise ValueError("REFRESH_TOKEN_TTL_DAYS must be greater than zero")

        if self.is_production and not self.cors_origins.strip():
            raise ValueError("CORS_ORIGINS must be configured in production")

        if not self.integration_json_feed_path.strip():
            raise ValueError("INTEGRATION_JSON_FEED_PATH must not be blank")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
