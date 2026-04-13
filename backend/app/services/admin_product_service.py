import re
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.models.offer import Offer
from app.models.product import Product
from app.models.store import Store
from app.schemas.admin_product import AdminProductWriteInput
from app.services.product_service import ProductService


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized


class AdminProductService:
    @staticmethod
    def create_product(db: Session, payload: AdminProductWriteInput) -> dict:
        slug = AdminProductService._resolve_slug(payload.slug, payload.name)
        AdminProductService._validate_price_payload(payload.price, payload.original_price)
        AdminProductService._ensure_slug_available(db, slug)
        store = AdminProductService._get_store_by_code(db, payload.store_code)
        now = datetime.now(timezone.utc)

        product = Product(
            slug=slug,
            name=payload.name.strip(),
            brand=payload.brand.strip(),
            category=payload.category.strip(),
            description=payload.description.strip(),
            thumbnail_url=payload.thumbnail_url.strip(),
            popularity_score=payload.popularity_score,
            is_active=payload.is_active,
        )
        db.add(product)
        db.flush()

        offer = Offer(
            product_id=product.id,
            store_id=store.id,
            seller_name=payload.seller_name.strip(),
            title=payload.name.strip(),
            affiliate_url=payload.affiliate_url.strip(),
            price=payload.price,
            original_price=payload.original_price,
            currency="BRL",
            shipping_cost=payload.shipping_cost,
            installment_text=AdminProductService._normalize_optional_text(payload.installment_text),
            availability=payload.availability.strip(),
            is_featured=payload.is_featured,
            is_active=payload.is_active,
            last_synced_at=now,
        )
        db.add(offer)
        db.commit()

        return AdminProductService._build_catalog_item_by_product_id(db, product.id)

    @staticmethod
    def update_product(db: Session, product_id: str, payload: AdminProductWriteInput) -> dict:
        product = AdminProductService._get_product_for_write(db, product_id)

        if not product:
            raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

        slug = AdminProductService._resolve_slug(
            payload.slug,
            payload.name,
            fallback_slug=product.slug,
        )
        AdminProductService._validate_price_payload(payload.price, payload.original_price)
        AdminProductService._ensure_slug_available(db, slug, exclude_product_id=product.id)
        store = AdminProductService._get_store_by_code(db, payload.store_code)
        now = datetime.now(timezone.utc)

        product.slug = slug
        product.name = payload.name.strip()
        product.brand = payload.brand.strip()
        product.category = payload.category.strip()
        product.description = payload.description.strip()
        product.thumbnail_url = payload.thumbnail_url.strip()
        product.popularity_score = payload.popularity_score
        product.is_active = payload.is_active

        offer = AdminProductService._resolve_offer_for_update(product, payload.offer_id)

        if offer is None:
            offer = Offer(
                product_id=product.id,
                store_id=store.id,
                seller_name=payload.seller_name.strip(),
                title=payload.name.strip(),
                affiliate_url=payload.affiliate_url.strip(),
                price=payload.price,
                original_price=payload.original_price,
                currency="BRL",
                shipping_cost=payload.shipping_cost,
                installment_text=AdminProductService._normalize_optional_text(payload.installment_text),
                availability=payload.availability.strip(),
                is_featured=payload.is_featured,
                is_active=payload.is_active,
                last_synced_at=now,
            )
            db.add(offer)
        else:
            offer.store_id = store.id
            offer.seller_name = payload.seller_name.strip()
            offer.title = payload.name.strip()
            offer.affiliate_url = payload.affiliate_url.strip()
            offer.price = payload.price
            offer.original_price = payload.original_price
            offer.shipping_cost = payload.shipping_cost
            offer.installment_text = AdminProductService._normalize_optional_text(payload.installment_text)
            offer.availability = payload.availability.strip()
            offer.is_featured = payload.is_featured
            offer.is_active = payload.is_active
            offer.last_synced_at = now

        db.commit()

        return AdminProductService._build_catalog_item_by_product_id(db, product.id)

    @staticmethod
    def delete_product(db: Session, product_id: str) -> bool:
        product = db.scalar(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.offers))
        )

        if not product:
            return False

        product.is_active = False
        for offer in product.offers:
            offer.is_active = False

        db.commit()
        return True

    @staticmethod
    def _get_product_for_write(db: Session, product_id: str) -> Product | None:
        return db.scalar(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.offers).selectinload(Offer.store))
        )

    @staticmethod
    def _build_catalog_item_by_product_id(db: Session, product_id: str) -> dict:
        product = db.scalar(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.offers).selectinload(Offer.store))
        )

        if not product:
            raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

        return ProductService._build_catalog_item(product)

    @staticmethod
    def _resolve_slug(slug: str | None, name: str, fallback_slug: str | None = None) -> str:
        if slug and slug.strip():
            return _slugify(slug)

        if fallback_slug:
            return fallback_slug

        generated = _slugify(name)
        if not generated:
            raise BusinessRuleError("Slug could not be generated", code="INVALID_PRODUCT_SLUG")
        return generated

    @staticmethod
    def _get_store_by_code(db: Session, store_code: str) -> Store:
        normalized_code = store_code.strip().lower()
        store = db.scalar(select(Store).where(Store.code == normalized_code))

        if not store:
            raise NotFoundError("Store not found", code="STORE_NOT_FOUND")

        return store

    @staticmethod
    def _ensure_slug_available(
        db: Session,
        slug: str,
        *,
        exclude_product_id: str | None = None,
    ) -> None:
        existing_product_id = db.scalar(select(Product.id).where(Product.slug == slug))

        if not existing_product_id:
            return

        if exclude_product_id and existing_product_id == exclude_product_id:
            return

        raise ConflictError("Slug already registered", code="PRODUCT_SLUG_ALREADY_EXISTS")

    @staticmethod
    def _resolve_offer_for_update(product: Product, offer_id: str | None) -> Offer | None:
        if offer_id:
            for offer in product.offers:
                if offer.id == offer_id:
                    return offer

        for offer in product.offers:
            if offer.is_active:
                return offer

        return product.offers[0] if product.offers else None

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _validate_price_payload(price: Decimal, original_price: Decimal | None) -> None:
        if original_price is not None and original_price < price:
            raise BusinessRuleError(
                "Original price must be greater than or equal to price",
                code="INVALID_ORIGINAL_PRICE",
            )
