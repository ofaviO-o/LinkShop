from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.integrations.catalog.types import CatalogSearchResult


class MercadoLivreCatalogSyncRead(BaseModel):
    provider: str
    marketplace: str
    source_reference: str
    product_id: str
    product_external_id: str
    product_status: str
    offer_ids: list[str]
    offers_created: int
    offers_updated: int
    offers_count: int
    synced_at: datetime


class MercadoLivreCatalogSearchRead(CatalogSearchResult):
    pass


class MercadoLivreCatalogPreviewRead(BaseModel):
    provider: str
    source_url: str
    resolved_url: str
    store_code: str
    external_id: str
    name: str
    slug: str
    brand: str
    category: str
    description: str
    thumbnail_url: str | None
    seller_name: str
    affiliate_url: str
    landing_url: str
    price: Decimal
    original_price: Decimal | None = None
