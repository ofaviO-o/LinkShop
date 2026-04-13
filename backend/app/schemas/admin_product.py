from decimal import Decimal

from pydantic import BaseModel, Field


class AdminProductWriteInput(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=180)
    name: str = Field(min_length=1, max_length=255)
    brand: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1)
    thumbnail_url: str = Field(min_length=1, max_length=500)
    popularity_score: int = Field(default=0, ge=0)
    is_active: bool = True

    offer_id: str | None = Field(default=None, min_length=1, max_length=36)
    store_code: str = Field(min_length=1, max_length=60)
    seller_name: str = Field(min_length=1, max_length=160)
    affiliate_url: str = Field(min_length=1)
    price: Decimal = Field(gt=0)
    original_price: Decimal | None = Field(default=None, gt=0)
    installment_text: str | None = Field(default=None, max_length=120)
    shipping_cost: Decimal | None = Field(default=None, ge=0)
    is_featured: bool = False
    availability: str = Field(default="in_stock", min_length=1, max_length=30)


class AdminProductImportInput(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class AdminProductImportRead(BaseModel):
    provider: str = Field(min_length=1, max_length=60)
    source_url: str = Field(min_length=1, max_length=2000)
    store_code: str = Field(min_length=1, max_length=60)
    external_id: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, max_length=255)
    slug: str | None = Field(default=None, max_length=180)
    brand: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=120)
    description: str | None = None
    thumbnail_url: str | None = Field(default=None, max_length=500)
    seller_name: str | None = Field(default=None, max_length=160)
    affiliate_url: str = Field(min_length=1, max_length=2000)
    price: Decimal | None = Field(default=None, gt=0)
    original_price: Decimal | None = Field(default=None, gt=0)
