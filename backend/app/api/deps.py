from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import AuthContext, AuthService


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Authentication required")

    user = AuthService.get_user_by_token(db, credentials.credentials)

    if not user:
        raise UnauthorizedError("Invalid token")

    return user


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials or credentials.scheme.lower() != "bearer":
        return None

    return AuthService.get_user_by_token(db, credentials.credentials)


def get_current_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthContext:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Authentication required")

    context = AuthService.get_auth_context_by_token(db, credentials.credentials)
    if not context:
        raise UnauthorizedError("Invalid token")

    return context


def get_optional_current_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthContext | None:
    if not credentials or credentials.scheme.lower() != "bearer":
        return None

    return AuthService.get_auth_context_by_token(db, credentials.credentials)


def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise ForbiddenError("Admin access required", code="ADMIN_REQUIRED")

    return current_user
