from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AffiliateLinkCache(Base):
    __tablename__ = "affiliate_link_cache"
    __table_args__ = (
        Index("ix_affiliate_link_cache_marketplace_external_id", "marketplace", "external_id"),
        Index("ix_affiliate_link_cache_expires_at", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    marketplace: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    original_url: Mapped[str] = mapped_column(Text, nullable=False)
    affiliate_url: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
