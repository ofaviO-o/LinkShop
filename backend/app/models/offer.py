from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (
        UniqueConstraint("store_id", "external_offer_id", name="uq_offers_store_external_offer"),
        CheckConstraint("price > 0", name="offer_price_positive"),
        CheckConstraint("original_price IS NULL OR original_price >= price", name="offer_original_price_gte_price"),
        CheckConstraint("shipping_cost IS NULL OR shipping_cost >= 0", name="offer_shipping_non_negative"),
        Index("ix_offers_product_active_price", "product_id", "is_active", "price"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    store_id: Mapped[str] = mapped_column(String(36), ForeignKey("stores.id"), nullable=False, index=True)
    marketplace: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    external_offer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    seller_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    seller_name: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    affiliate_url: Mapped[str] = mapped_column(Text, nullable=False)
    landing_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, index=True)
    original_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BRL")
    shipping_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    installment_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    availability: Mapped[str] = mapped_column(String(30), nullable=False, default="in_stock")
    available_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    product = relationship("Product", back_populates="offers")
    store = relationship("Store", back_populates="offers")
    compare_list_items = relationship("CompareListItem", back_populates="offer")
    price_history_entries = relationship("PriceHistory", back_populates="offer", cascade="all, delete-orphan")
    click_events = relationship("ClickEvent", back_populates="offer")
    alert_events = relationship("AlertEvent", back_populates="offer")
