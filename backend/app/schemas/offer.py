from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.store import StoreRead


class OfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    store_id: str
    marketplace: str | None = None
    external_offer_id: str | None = None
    seller_id: str | None = None
    seller_name: str
    title: str
    affiliate_url: str
    landing_url: str | None
    product_url: str | None = None
    price: Decimal
    original_price: Decimal | None
    currency: str
    shipping_cost: Decimal | None
    installment_text: str | None
    availability: str
    available_quantity: int | None = None
    is_featured: bool
    is_active: bool
    fetched_at: datetime | None = None
    last_synced_at: datetime
    ranking_score: float | None = None
    quality_score: float | None = None
    ranking_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    store: StoreRead
