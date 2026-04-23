from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("popularity_score >= 0", name="product_popularity_non_negative"),
        Index("ix_products_active_popularity", "is_active", "popularity_score"),
        Index("ix_products_marketplace_external_id", "marketplace", "external_id"),
        UniqueConstraint("marketplace", "external_id", name="uq_products_marketplace_external"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    marketplace: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    brand: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    category_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(500), nullable=False)
    canonical_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    condition: Mapped[str | None] = mapped_column(String(40), nullable=True)
    currency_id: Mapped[str | None] = mapped_column(String(10), nullable=True)
    popularity_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    offers = relationship("Offer", back_populates="product")
    favorites = relationship("Favorite", back_populates="product", cascade="all, delete-orphan")
    compare_list_items = relationship("CompareListItem", back_populates="product", cascade="all, delete-orphan")
    price_history_entries = relationship("PriceHistory", back_populates="product", cascade="all, delete-orphan")
    price_watches = relationship("PriceWatch", back_populates="product", cascade="all, delete-orphan")
    click_events = relationship("ClickEvent", back_populates="product")
    alert_events = relationship("AlertEvent", back_populates="product", cascade="all, delete-orphan")
