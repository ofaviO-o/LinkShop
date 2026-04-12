from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError
from app.core.security import (
    AccessTokenPayload,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    extract_session_id_from_refresh_token,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.auth import AuthLoginInput, AuthRegisterInput


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: AuthSession
    access_payload: AccessTokenPayload


class AuthService:
    @staticmethod
    def register(db: Session, payload: AuthRegisterInput) -> User:
        user, created = AuthService._create_user(
            db,
            name=payload.name.strip(),
            email=payload.email.lower().strip(),
            password=payload.password,
            role="user",
        )
        if not created:
            raise ConflictError("Email already registered", code="EMAIL_ALREADY_REGISTERED")
        return user

    @staticmethod
    def ensure_admin_user(
        db: Session,
        *,
        email: str,
        password: str,
        name: str = "LinkShop Admin",
    ) -> tuple[User, bool]:
        normalized_email = email.lower().strip()
        normalized_name = name.strip()

        existing_user = db.scalar(select(User).where(User.email == normalized_email))
        if existing_user:
            expected_hash = hash_password(password)
            should_update = False

            if existing_user.role != "admin":
                existing_user.role = "admin"
                should_update = True

            if existing_user.password_hash != expected_hash:
                existing_user.password_hash = expected_hash
                should_update = True

            if normalized_name and existing_user.name != normalized_name:
                existing_user.name = normalized_name
                should_update = True

            if should_update:
                db.add(existing_user)
                db.commit()
                db.refresh(existing_user)

            return existing_user, False

        return AuthService._create_user(
            db,
            name=normalized_name,
            email=normalized_email,
            password=password,
            role="admin",
        )

    @staticmethod
    def login(db: Session, payload: AuthLoginInput) -> User | None:
        normalized_email = payload.email.lower().strip()
        user = db.scalar(select(User).where(User.email == normalized_email))

        if not user:
            return None

        if not verify_password(payload.password, user.password_hash):
            return None

        return user

    @staticmethod
    def build_token_response(db: Session, user: User) -> dict[str, object]:
        session = AuthSession(
            user_id=user.id,
            refresh_token_hash="pending",
            refresh_expires_at=datetime.now(timezone.utc),
        )
        db.add(session)
        db.flush()

        refresh_bundle = create_refresh_token(session.id)
        session.refresh_token_hash = refresh_bundle.token_hash
        session.refresh_expires_at = refresh_bundle.expires_at
        session.last_used_at = datetime.now(timezone.utc)

        access_token, access_expires_at = create_access_token(user.id, session.id)

        db.commit()
        db.refresh(session)
        db.refresh(user)

        return {
            "access_token": access_token,
            "refresh_token": refresh_bundle.token,
            "token_type": "bearer",
            "user": user,
            "access_expires_at": access_expires_at,
            "refresh_expires_at": session.refresh_expires_at,
            "expires_at": access_expires_at,
        }

    @staticmethod
    def refresh_session(db: Session, refresh_token: str) -> dict[str, object] | None:
        session_id = extract_session_id_from_refresh_token(refresh_token)
        if not session_id:
            return None

        session = db.scalar(select(AuthSession).where(AuthSession.id == session_id))
        if not session:
            return None

        if not AuthService._is_refresh_session_usable(session):
            return None

        if not verify_refresh_token(refresh_token, session.refresh_token_hash):
            return None

        user = db.scalar(select(User).where(User.id == session.user_id))
        if not user:
            return None

        refresh_bundle = create_refresh_token(session.id)
        session.refresh_token_hash = refresh_bundle.token_hash
        session.refresh_expires_at = refresh_bundle.expires_at
        session.last_used_at = datetime.now(timezone.utc)

        access_token, access_expires_at = create_access_token(user.id, session.id)

        db.commit()
        db.refresh(session)

        return {
            "access_token": access_token,
            "refresh_token": refresh_bundle.token,
            "token_type": "bearer",
            "user": user,
            "access_expires_at": access_expires_at,
            "refresh_expires_at": session.refresh_expires_at,
            "expires_at": access_expires_at,
        }

    @staticmethod
    def revoke_session(
        db: Session,
        *,
        current_session: AuthSession | None = None,
        refresh_token: str | None = None,
    ) -> bool:
        session = current_session

        if session is None and refresh_token:
            session = AuthService.get_session_by_refresh_token(db, refresh_token)

        if session is None or session.revoked_at is not None:
            return False

        session.revoked_at = datetime.now(timezone.utc)
        session.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return True

    @staticmethod
    def get_user_by_token(db: Session, token: str) -> User | None:
        context = AuthService.get_auth_context_by_token(db, token)
        return context.user if context else None

    @staticmethod
    def get_auth_context_by_token(db: Session, token: str) -> AuthContext | None:
        payload = decode_access_token(token)
        if not payload:
            return None

        session = db.scalar(select(AuthSession).where(AuthSession.id == payload.session_id))
        if not session or not AuthService._is_access_session_usable(session):
            return None

        user = db.scalar(select(User).where(User.id == payload.user_id))
        if not user:
            return None

        return AuthContext(user=user, session=session, access_payload=payload)

    @staticmethod
    def get_session_by_refresh_token(db: Session, refresh_token: str) -> AuthSession | None:
        session_id = extract_session_id_from_refresh_token(refresh_token)
        if not session_id:
            return None

        session = db.scalar(select(AuthSession).where(AuthSession.id == session_id))
        if not session:
            return None

        if not AuthService._is_refresh_session_usable(session):
            return None

        if not verify_refresh_token(refresh_token, session.refresh_token_hash):
            return None

        return session

    @staticmethod
    def _is_refresh_session_usable(session: AuthSession) -> bool:
        if session.revoked_at is not None:
            return False
        return session.refresh_expires_at > datetime.now(timezone.utc)

    @staticmethod
    def _is_access_session_usable(session: AuthSession) -> bool:
        return AuthService._is_refresh_session_usable(session)

    @staticmethod
    def _create_user(
        db: Session,
        *,
        name: str,
        email: str,
        password: str,
        role: str,
    ) -> tuple[User, bool]:
        existing_user = db.scalar(select(User).where(User.email == email))
        if existing_user:
            return existing_user, False

        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user, True
