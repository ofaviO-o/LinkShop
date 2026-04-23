from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.affiliate_link_cache import AffiliateLinkCache


class AffiliateLinkResolverService:
    @staticmethod
    def resolve_url(
        db: Session,
        *,
        marketplace: str | None,
        external_id: str | None,
        original_url: str,
    ) -> str:
        if marketplace and external_id:
            cached = AffiliateLinkResolverService.get_cached_link(
                db,
                marketplace=marketplace,
                external_id=external_id,
            )
            if cached:
                return cached.affiliate_url

        return original_url

    @staticmethod
    def get_cached_link(db: Session, *, marketplace: str, external_id: str) -> AffiliateLinkCache | None:
        now = datetime.now(timezone.utc)
        statement = (
            select(AffiliateLinkCache)
            .where(
                AffiliateLinkCache.marketplace == marketplace,
                AffiliateLinkCache.external_id == external_id,
                or_(AffiliateLinkCache.expires_at.is_(None), AffiliateLinkCache.expires_at > now),
            )
            .order_by(AffiliateLinkCache.created_at.desc())
            .limit(1)
        )
        return db.scalar(statement)
