import os
import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


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
    mercado_livre_api_base_url: str = "https://api.mercadolibre.com"
    mercado_livre_site_id: str = "MLB"
    mercado_livre_timeout_seconds: int = 12

    model_config = SettingsConfigDict(
        env_file=BACKEND_ENV_FILE,
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

        if not self.mercado_livre_api_base_url.strip():
            raise ValueError("MERCADO_LIVRE_API_BASE_URL must not be blank")

        if not self.mercado_livre_site_id.strip():
            raise ValueError("MERCADO_LIVRE_SITE_ID must not be blank")

        if self.mercado_livre_timeout_seconds <= 0:
            raise ValueError("MERCADO_LIVRE_TIMEOUT_SECONDS must be greater than zero")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def _load_env_file_keys(env_file: str | Path | None) -> set[str]:
    if not env_file:
        return set()

    env_path = Path(env_file)
    if not env_path.exists():
        return set()

    keys: set[str] = set()
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key = line.split("=", maxsplit=1)[0].strip()
        if key:
            keys.add(key)
    return keys


def validate_critical_environment(current_settings: Settings) -> None:
    logger = logging.getLogger("linkshop.startup")
    env_file = current_settings.model_config.get("env_file")
    env_file_keys = _load_env_file_keys(env_file)

    required_keys = [
        "DATABASE_URL",
        "AUTH_SECRET_KEY",
        "RUN_MIGRATIONS_ON_STARTUP",
    ]

    missing_keys = [
        key for key in required_keys if key not in os.environ and key not in env_file_keys
    ]
    invalid_values: list[str] = []

    if not current_settings.database_url.strip():
        invalid_values.append("DATABASE_URL")

    if not current_settings.auth_secret_key.get_secret_value().strip():
        invalid_values.append("AUTH_SECRET_KEY")

    if missing_keys or invalid_values:
        for key in missing_keys:
            logger.error("Missing required environment variable: %s", key)
        for key in invalid_values:
            logger.error("Environment variable configured with blank/invalid value: %s", key)

        details = []
        if missing_keys:
            details.append(f"missing={','.join(missing_keys)}")
        if invalid_values:
            details.append(f"invalid={','.join(invalid_values)}")

        raise RuntimeError(
            "Critical startup environment validation failed: "
            + " | ".join(details)
            + ". "
            + "Use AUTH_SECRET_KEY as the JWT/refresh signing secret in this project."
        )

    logger.info(
        "Critical startup environment validated: DATABASE_URL, AUTH_SECRET_KEY (JWT/refresh equivalent), RUN_MIGRATIONS_ON_STARTUP"
    )
