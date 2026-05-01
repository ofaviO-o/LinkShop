import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BusinessRuleError, ExternalServiceError
from app.models.integration_connection import IntegrationConnection


class MercadoLivreOAuthService:
    provider = "mercado-livre"
    state_ttl_minutes = 10

    @classmethod
    def get_status(cls, db: Session) -> dict[str, object]:
        connection = cls._get_connection(db)
        env_access_token = settings.mercado_livre_access_token.get_secret_value().strip()

        return {
            "provider": cls.provider,
            "is_configured": cls.is_oauth_configured(),
            "is_connected": bool(env_access_token or (connection and connection.access_token)),
            "connection_source": "env" if env_access_token else ("database" if connection and connection.access_token else "none"),
            "auth_base_url": settings.mercado_livre_auth_base_url.rstrip("/"),
            "redirect_uri": settings.mercado_livre_redirect_uri.strip() or None,
            "account_id": connection.external_user_id if connection else None,
            "account_name": connection.external_user_name if connection else None,
            "scopes": connection.scopes if connection else None,
            "connected_at": connection.connected_at if connection else None,
            "access_token_expires_at": connection.access_token_expires_at if connection else None,
            "last_error_code": connection.last_error_code if connection else None,
            "last_error_message": connection.last_error_message if connection else None,
        }

    @classmethod
    def build_authorization_url(cls, *, initiated_by_user_id: str) -> dict[str, str]:
        cls._require_oauth_configuration()
        state = cls._build_state(initiated_by_user_id=initiated_by_user_id)
        params = {
            "response_type": "code",
            "client_id": settings.mercado_livre_app_id.strip(),
            "redirect_uri": settings.mercado_livre_redirect_uri.strip(),
            "state": state,
        }
        scope = settings.mercado_livre_oauth_scope.strip()
        if scope:
            params["scope"] = scope

        return {
            "provider": cls.provider,
            "authorization_url": f"{settings.mercado_livre_auth_base_url.rstrip('/')}/authorization?{urlencode(params)}",
            "redirect_uri": settings.mercado_livre_redirect_uri.strip(),
        }

    @classmethod
    def exchange_code(cls, db: Session, *, code: str) -> IntegrationConnection:
        cls._require_oauth_configuration()
        normalized_code = code.strip()
        if not normalized_code:
            raise BusinessRuleError("Mercado Livre authorization code is required", code="MERCADO_LIVRE_CODE_REQUIRED")

        token_payload = cls._request_token(
            {
                "grant_type": "authorization_code",
                "client_id": settings.mercado_livre_app_id.strip(),
                "client_secret": settings.mercado_livre_client_secret.get_secret_value(),
                "code": normalized_code,
                "redirect_uri": settings.mercado_livre_redirect_uri.strip(),
            }
        )
        return cls._save_connection(db, token_payload=token_payload)

    @classmethod
    def handle_callback(cls, db: Session, *, code: str, state: str) -> IntegrationConnection:
        cls._validate_state(state)
        return cls.exchange_code(db, code=code)

    @classmethod
    def disconnect(cls, db: Session) -> None:
        connection = cls._get_connection(db)
        if not connection:
            return
        db.delete(connection)
        db.commit()

    @classmethod
    def resolve_access_token(cls, db: Session) -> str | None:
        connection = cls._get_connection(db)
        if connection and connection.access_token:
            expires_at = cls._as_aware_utc(connection.access_token_expires_at)
            now = datetime.now(timezone.utc)
            should_refresh = expires_at is not None and expires_at <= now + timedelta(seconds=60)
            if should_refresh:
                try:
                    connection = cls.refresh_connection(db)
                except Exception:
                    if expires_at <= now:
                        # Token genuinamente expirado e refresh falhou — não usar token podre
                        env_token = settings.mercado_livre_access_token.get_secret_value().strip()
                        return env_token or None
                    # Refresh falhou mas token ainda não expirou — usar por enquanto
            return connection.access_token

        env_access_token = settings.mercado_livre_access_token.get_secret_value().strip()
        return env_access_token or None

    @classmethod
    def refresh_connection(cls, db: Session) -> IntegrationConnection:
        cls._require_oauth_configuration()
        connection = cls._get_connection(db)
        refresh_token = settings.mercado_livre_refresh_token.get_secret_value().strip()

        if connection and connection.refresh_token:
            refresh_token = connection.refresh_token

        if not refresh_token:
            raise BusinessRuleError(
                "Mercado Livre refresh token is not available",
                code="MERCADO_LIVRE_REFRESH_TOKEN_MISSING",
            )

        token_payload = cls._request_token(
            {
                "grant_type": "refresh_token",
                "client_id": settings.mercado_livre_app_id.strip(),
                "client_secret": settings.mercado_livre_client_secret.get_secret_value(),
                "refresh_token": refresh_token,
            }
        )
        return cls._save_connection(db, token_payload=token_payload)

    @classmethod
    def get_app_token(cls) -> str:
        cls._require_oauth_configuration()
        token_payload = cls._request_token({
            "grant_type": "client_credentials",
            "client_id": settings.mercado_livre_app_id.strip(),
            "client_secret": settings.mercado_livre_client_secret.get_secret_value(),
        })
        access_token = str(token_payload.get("access_token") or "").strip()
        if not access_token:
            raise ExternalServiceError(
                "Mercado Livre did not return an app access token",
                code="MERCADO_LIVRE_APP_TOKEN_MISSING",
                status_code=502,
            )
        return access_token

    @classmethod
    def is_oauth_configured(cls) -> bool:
        return bool(
            settings.mercado_livre_app_id.strip()
            and settings.mercado_livre_client_secret.get_secret_value().strip()
            and settings.mercado_livre_redirect_uri.strip()
        )

    @classmethod
    def _save_connection(cls, db: Session, *, token_payload: dict[str, object]) -> IntegrationConnection:
        connection = cls._get_connection(db)
        if not connection:
            connection = IntegrationConnection(provider=cls.provider)
            db.add(connection)

        access_token = str(token_payload.get("access_token") or "").strip()
        refresh_token = str(token_payload.get("refresh_token") or "").strip()
        token_type = str(token_payload.get("token_type") or "Bearer").strip() or "Bearer"
        scope = str(token_payload.get("scope") or "").strip() or None
        expires_in = cls._to_int(token_payload.get("expires_in"))
        user_profile = cls._fetch_current_user_profile(access_token) if access_token else {}
        now = datetime.now(timezone.utc)

        connection.status = "connected"
        connection.access_token = access_token or None
        connection.refresh_token = refresh_token or connection.refresh_token
        connection.token_type = token_type
        connection.scopes = scope
        connection.external_user_id = cls._to_optional_text(user_profile.get("id"))
        connection.external_user_name = cls._to_optional_text(user_profile.get("nickname"))
        connection.access_token_expires_at = now + timedelta(seconds=expires_in) if expires_in else None
        connection.connected_at = connection.connected_at or now
        connection.last_refreshed_at = now
        connection.last_error_code = None
        connection.last_error_message = None
        db.commit()
        db.refresh(connection)
        return connection

    @classmethod
    def _get_connection(cls, db: Session) -> IntegrationConnection | None:
        return db.scalar(select(IntegrationConnection).where(IntegrationConnection.provider == cls.provider))

    @classmethod
    def _fetch_current_user_profile(cls, access_token: str) -> dict[str, object]:
        return cls._request_json(
            f"{settings.mercado_livre_api_base_url.rstrip('/')}/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    @classmethod
    def _request_token(cls, payload: dict[str, str]) -> dict[str, object]:
        return cls._request_json(
            f"{settings.mercado_livre_api_base_url.rstrip('/')}/oauth/token",
            method="POST",
            body=urlencode(payload).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        )

    @classmethod
    def _request_json(
        cls,
        url: str,
        *,
        method: str = "GET",
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, object]:
        request = Request(
            url,
            data=body,
            method=method,
            headers={
                "Accept": "application/json",
                "User-Agent": "LinkShop/1.0 (+https://link-shop-navy.vercel.app)",
                **(headers or {}),
            },
        )
        try:
            with urlopen(request, timeout=settings.mercado_livre_timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            details = cls._read_http_error_payload(exc)
            raise ExternalServiceError(
                f"Mercado Livre OAuth request failed with HTTP {exc.code}. {details}".strip(),
                code="MERCADO_LIVRE_OAUTH_HTTP_ERROR",
                status_code=502,
            ) from exc
        except URLError as exc:
            raise ExternalServiceError(
                f"Could not connect to Mercado Livre OAuth endpoint: {getattr(exc, 'reason', exc)}",
                code="MERCADO_LIVRE_OAUTH_NETWORK_ERROR",
                status_code=502,
            ) from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ExternalServiceError(
                "Mercado Livre OAuth returned an invalid JSON response.",
                code="MERCADO_LIVRE_OAUTH_INVALID_RESPONSE",
                status_code=502,
            ) from exc

    @classmethod
    def _read_http_error_payload(cls, exc: HTTPError) -> str:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            return ""

        parts: list[str] = []
        message = cls._to_optional_text(payload.get("message"))
        error = cls._to_optional_text(payload.get("error"))
        if message:
            parts.append(message)
        if error and error.lower() != (message or "").lower():
            parts.append(error)
        return " ".join(parts)

    @classmethod
    def _require_oauth_configuration(cls) -> None:
        if cls.is_oauth_configured():
            return
        raise BusinessRuleError(
            "Mercado Livre OAuth is not fully configured. Set APP_ID, CLIENT_SECRET and REDIRECT_URI.",
            code="MERCADO_LIVRE_OAUTH_NOT_CONFIGURED",
        )

    @classmethod
    def _build_state(cls, *, initiated_by_user_id: str) -> str:
        payload = {
            "provider": cls.provider,
            "user_id": initiated_by_user_id,
            "nonce": secrets.token_urlsafe(12),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=cls.state_ttl_minutes)).timestamp()),
        }
        encoded_payload = cls._base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signature = cls._sign(encoded_payload)
        return f"{encoded_payload}.{signature}"

    @classmethod
    def _validate_state(cls, raw_state: str) -> dict[str, object]:
        try:
            encoded_payload, signature = raw_state.split(".", maxsplit=1)
        except ValueError as exc:
            raise BusinessRuleError("Mercado Livre OAuth state is invalid", code="MERCADO_LIVRE_OAUTH_STATE_INVALID") from exc

        if not hmac.compare_digest(signature, cls._sign(encoded_payload)):
            raise BusinessRuleError("Mercado Livre OAuth state signature is invalid", code="MERCADO_LIVRE_OAUTH_STATE_INVALID")

        try:
            payload = json.loads(cls._base64url_decode(encoded_payload))
        except (json.JSONDecodeError, ValueError) as exc:
            raise BusinessRuleError("Mercado Livre OAuth state could not be parsed", code="MERCADO_LIVRE_OAUTH_STATE_INVALID") from exc

        provider = cls._to_optional_text(payload.get("provider"))
        expires_at = cls._to_int(payload.get("exp"))
        if provider != cls.provider or not expires_at:
            raise BusinessRuleError("Mercado Livre OAuth state is incomplete", code="MERCADO_LIVRE_OAUTH_STATE_INVALID")
        if datetime.fromtimestamp(expires_at, tz=timezone.utc) <= datetime.now(timezone.utc):
            raise BusinessRuleError("Mercado Livre OAuth state expired", code="MERCADO_LIVRE_OAUTH_STATE_EXPIRED")
        return payload

    @staticmethod
    def _base64url_encode(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("utf-8")

    @staticmethod
    def _base64url_decode(raw: str) -> bytes:
        padding = "=" * (-len(raw) % 4)
        return base64.urlsafe_b64decode(f"{raw}{padding}".encode("utf-8"))

    @staticmethod
    def _sign(value: str) -> str:
        return hmac.new(
            settings.auth_secret_key.get_secret_value().encode("utf-8"),
            msg=value.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def _to_optional_text(value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _to_int(value: object) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_aware_utc(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
