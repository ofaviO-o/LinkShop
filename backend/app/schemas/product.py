from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.offer import OfferRead
from app.schemas.store import StoreRead


class ProductListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    title: str | None = None
    marketplace: str | None = None
    external_id: str | None = None
    brand: str
    category: str
    category_id: str | None = None
    description: str
    thumbnail_url: str
    canonical_url: str | None = None
    condition: str | None = None
    currency_id: str | None = None
    popularity_score: int
    is_active: bool
    last_synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProductRead(ProductListItem):
    offers: list[OfferRead] = []


class CatalogItemRead(BaseModel):
    product: ProductListItem
    offers: list[OfferRead]
    best_offer: OfferRead | None
    best_offer_score: float | None = None
    best_offer_reason: str | None = None
    lowest_price: Decimal
    highest_price: Decimal
    best_discount_percentage: int
    store_ids: list[str]


class ProductSearchResponse(BaseModel):
    items: list[CatalogItemRead]
    total: int
    page: int
    page_size: int
    available_categories: list[str]
    available_stores: list[StoreRead]
