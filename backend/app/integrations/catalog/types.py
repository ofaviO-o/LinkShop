from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CatalogOfferPayload(BaseModel):
    marketplace: str
    external_id: str
    seller_id: str | None = None
    seller_name: str
    title: str
    price: Decimal = Field(gt=0)
    original_price: Decimal | None = Field(default=None, gt=0)
    product_url: str
    available_quantity: int | None = Field(default=None, ge=0)
    status: str = "active"
    condition: str | None = None
    currency_id: str = "BRL"
    is_active: bool = True
    fetched_at: datetime


class CatalogProductPayload(BaseModel):
    marketplace: str
    external_id: str
    title: str
    category_id: str | None = None
    category_name: str | None = None
    thumbnail_url: str | None = None
    canonical_url: str
    brand: str | None = None
    condition: str | None = None
    currency_id: str = "BRL"
    description: str | None = None
    is_active: bool = True
    last_synced_at: datetime
    offers: list[CatalogOfferPayload] = Field(default_factory=list)


class CatalogSearchItem(BaseModel):
    marketplace: str
    external_id: str
    title: str
    category_id: str | None = None
    thumbnail_url: str | None = None
    canonical_url: str | None = None
    brand: str | None = None
    condition: str | None = None
    currency_id: str = "BRL"
    price: Decimal | None = None
    original_price: Decimal | None = None


class CatalogSearchResult(BaseModel):
    provider: str
    query: str
    items: list[CatalogSearchItem] = Field(default_factory=list)
