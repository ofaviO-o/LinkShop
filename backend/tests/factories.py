from datetime import datetime, timezone
from decimal import Decimal

from app.core.security import hash_password
from app.models.alert_config import AlertConfig
from app.models.affiliate_link_cache import AffiliateLinkCache
from app.models.offer import Offer
from app.models.price_history import PriceHistory
from app.models.price_watch import PriceWatch
from app.models.product import Product
from app.models.store import Store
from app.models.user import User


def build_user(
    *,
    id: str = "user-1",
    name: str = "Usuario Demo",
    email: str = "user@linkshop.dev",
    password: str = "123456",
    role: str = "user",
) -> User:
    return User(
        id=id,
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role,
    )


def build_store(
    *,
    id: str,
    code: str,
    name: str,
    affiliate_network: str = "custom",
    base_url: str,
    is_active: bool = True,
) -> Store:
    return Store(
        id=id,
        code=code,
        name=name,
        affiliate_network=affiliate_network,
        base_url=base_url,
        is_active=is_active,
    )


def build_product(
    *,
    id: str,
    slug: str,
    name: str,
    brand: str,
    category: str = "Smartphones",
    description: str = "Produto de teste",
    thumbnail_url: str = "https://example.com/product.jpg",
    popularity_score: int = 90,
    is_active: bool = True,
    marketplace: str | None = None,
    external_id: str | None = None,
    category_id: str | None = None,
    canonical_url: str | None = None,
    condition: str | None = None,
    currency_id: str | None = None,
) -> Product:
    return Product(
        id=id,
        slug=slug,
        name=name,
        title=name,
        marketplace=marketplace,
        external_id=external_id,
        brand=brand,
        category=category,
        category_id=category_id,
        description=description,
        thumbnail_url=thumbnail_url,
        canonical_url=canonical_url,
        condition=condition,
        currency_id=currency_id,
        popularity_score=popularity_score,
        is_active=is_active,
    )


def build_offer(
    *,
    id: str,
    product_id: str,
    store_id: str,
    external_offer_id: str,
    title: str,
    marketplace: str | None = None,
    seller_id: str | None = None,
    seller_name: str = "Loja Oficial",
    affiliate_url: str = "https://example.com/affiliate",
    landing_url: str = "https://example.com/landing",
    product_url: str | None = None,
    price: Decimal | str = Decimal("1000.00"),
    original_price: Decimal | str | None = Decimal("1200.00"),
    currency: str = "BRL",
    shipping_cost: Decimal | str | None = Decimal("0.00"),
    installment_text: str | None = "10x sem juros",
    availability: str = "in_stock",
    available_quantity: int | None = None,
    is_featured: bool = False,
    is_active: bool = True,
) -> Offer:
    return Offer(
        id=id,
        product_id=product_id,
        store_id=store_id,
        marketplace=marketplace,
        external_offer_id=external_offer_id,
        seller_id=seller_id,
        seller_name=seller_name,
        title=title,
        affiliate_url=affiliate_url,
        landing_url=landing_url,
        product_url=product_url or landing_url,
        price=Decimal(str(price)),
        original_price=Decimal(str(original_price)) if original_price is not None else None,
        currency=currency,
        shipping_cost=Decimal(str(shipping_cost)) if shipping_cost is not None else None,
        installment_text=installment_text,
        availability=availability,
        available_quantity=available_quantity,
        is_featured=is_featured,
        is_active=is_active,
    )


def build_price_history(
    *,
    offer_id: str,
    product_id: str,
    price: Decimal | str,
    original_price: Decimal | str | None = None,
    shipping_cost: Decimal | str | None = Decimal("0.00"),
    availability: str = "in_stock",
    captured_at: datetime | None = None,
) -> PriceHistory:
    return PriceHistory(
        offer_id=offer_id,
        product_id=product_id,
        price=Decimal(str(price)),
        original_price=Decimal(str(original_price)) if original_price is not None else None,
        shipping_cost=Decimal(str(shipping_cost)) if shipping_cost is not None else None,
        availability=availability,
        captured_at=captured_at or datetime.now(timezone.utc),
    )


def build_price_watch(
    *,
    id: str = "watch-1",
    user_id: str = "user-1",
    product_id: str = "product-1",
    is_active: bool = True,
    last_known_price: Decimal | str | None = None,
    last_best_offer_id: str | None = None,
) -> PriceWatch:
    return PriceWatch(
        id=id,
        user_id=user_id,
        product_id=product_id,
        is_active=is_active,
        last_known_price=Decimal(str(last_known_price)) if last_known_price is not None else None,
        last_best_offer_id=last_best_offer_id,
    )


def build_alert_config(
    *,
    price_watch_id: str,
    target_price: Decimal | str | None = None,
    notify_on_price_drop: bool = True,
    notify_on_new_best_offer: bool = True,
) -> AlertConfig:
    return AlertConfig(
        price_watch_id=price_watch_id,
        target_price=Decimal(str(target_price)) if target_price is not None else None,
        notify_on_price_drop=notify_on_price_drop,
        notify_on_new_best_offer=notify_on_new_best_offer,
    )


def build_affiliate_link_cache(
    *,
    marketplace: str = "mercado-livre",
    external_id: str,
    original_url: str,
    affiliate_url: str,
    provider: str = "manual",
) -> AffiliateLinkCache:
    return AffiliateLinkCache(
        marketplace=marketplace,
        external_id=external_id,
        original_url=original_url,
        affiliate_url=affiliate_url,
        provider=provider,
    )
