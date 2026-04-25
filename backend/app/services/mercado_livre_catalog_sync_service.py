import re
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ExternalServiceError, NotFoundError
from app.integrations.catalog.mercado_livre_provider import MercadoLivreCatalogProvider
from app.integrations.catalog.types import CatalogOfferPayload, CatalogProductPayload, CatalogSearchResult
from app.models.integration_sync_run import IntegrationSyncRun
from app.models.offer import Offer
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.store import Store
from app.services.mercado_livre_oauth_service import MercadoLivreOAuthService


class MercadoLivreCatalogSyncService:
    provider = MercadoLivreCatalogProvider()
    diagnostic_target_ids = ("MLB40287828", "MLB40287825", "MLB40287817")

    @classmethod
    def search_products(cls, db: Session, *, query: str, limit: int = 10, page: int = 1) -> CatalogSearchResult:
        access_token = MercadoLivreOAuthService.resolve_access_token(db)
        return cls.provider.search_products(query=query, limit=limit, page=page, access_token=access_token)

    @classmethod
    def run_search_diagnostics(cls, db: Session, *, query: str = "iphone 16") -> dict[str, object]:
        access_token = MercadoLivreOAuthService.resolve_access_token(db)
        search_context = cls.provider._discover_search_context(query, access_token=access_token)
        search_path = cls.provider._build_catalog_search_path(
            query=query,
            limit=50,
            offset=0,
            search_context=search_context,
        )

        payload: dict[str, object] | None = None
        search_error: dict[str, object] | None = None
        try:
            payload = cls.provider._get_json(search_path, access_token=access_token)
        except ExternalServiceError as exc:
            search_error = {
                "type": exc.__class__.__name__,
                "message": exc.message,
                "code": exc.code,
                "status_code": exc.status_code,
                "path": search_path,
            }
        except Exception as exc:  # noqa: BLE001 - temporary admin diagnostics
            search_error = {
                "type": exc.__class__.__name__,
                "message": str(exc),
                "path": search_path,
            }

        search_matches: list[dict[str, object]] = []
        if isinstance(payload, dict):
            results = payload.get("results")
            if isinstance(results, list):
                search_matches = cls._find_diagnostic_matches(results)

        target_product_details = cls._fetch_target_product_details(access_token=access_token)

        return {
            "query": query,
            "search_path": search_path,
            "search_error": search_error,
            "raw_search_payload": payload,
            "matched_results_in_search_page": search_matches,
            "target_product_details": target_product_details,
        }

    @classmethod
    def preview_product_by_url(cls, db: Session, *, product_url: str) -> dict[str, object]:
        access_token = MercadoLivreOAuthService.resolve_access_token(db)
        payload = cls.provider.fetch_product_details(product_url=product_url, access_token=access_token)
        return cls._build_preview_payload(payload=payload, source_reference=product_url)

    @classmethod
    def preview_product_by_external_id(cls, db: Session, *, external_id: str) -> dict[str, object]:
        access_token = MercadoLivreOAuthService.resolve_access_token(db)
        payload = cls.provider.fetch_product_details(external_id=external_id, access_token=access_token)
        return cls._build_preview_payload(payload=payload, source_reference=external_id)

    @classmethod
    def sync_product_by_url(cls, db: Session, *, product_url: str) -> dict[str, object]:
        access_token = MercadoLivreOAuthService.resolve_access_token(db)
        payload = cls.provider.fetch_product_details(product_url=product_url, access_token=access_token)
        return cls._sync_payload(db, payload=payload, source_reference=product_url)

    @classmethod
    def sync_product_by_external_id(cls, db: Session, *, external_id: str) -> dict[str, object]:
        access_token = MercadoLivreOAuthService.resolve_access_token(db)
        payload = cls.provider.fetch_product_details(external_id=external_id, access_token=access_token)
        return cls._sync_payload(db, payload=payload, source_reference=external_id)

    @classmethod
    def _sync_payload(cls, db: Session, *, payload: CatalogProductPayload, source_reference: str) -> dict[str, object]:
        started_at = datetime.now(timezone.utc)
        store = db.scalar(select(Store).where(Store.code == payload.marketplace, Store.is_active.is_(True)))
        if not store:
            raise NotFoundError(f"Store not found for marketplace '{payload.marketplace}'", code="STORE_NOT_FOUND")

        product, product_status = cls._upsert_product(db, payload=payload)
        offer_ids: list[str] = []
        created_offers = 0
        updated_offers = 0

        for offer_payload in payload.offers:
            offer, offer_status = cls._upsert_offer(db, product=product, store=store, payload=offer_payload)
            offer_ids.append(offer.id)
            if offer_status == "created":
                created_offers += 1
            elif offer_status == "updated":
                updated_offers += 1

        finished_at = datetime.now(timezone.utc)
        db.add(
            IntegrationSyncRun(
                provider=cls.provider.provider_name,
                source_reference=source_reference,
                status="success",
                processed=1,
                created=1 if product_status == "created" else created_offers,
                updated=1 if product_status == "updated" else updated_offers,
                unchanged=1 if product_status == "unchanged" and created_offers == 0 and updated_offers == 0 else 0,
                failed=0,
                history_created=created_offers + updated_offers,
                warning_count=0,
                error_count=0,
                started_at=started_at,
                finished_at=finished_at,
            )
        )
        db.commit()
        db.refresh(product)

        return {
            "provider": cls.provider.provider_name,
            "marketplace": payload.marketplace,
            "source_reference": source_reference,
            "product_id": product.id,
            "product_external_id": payload.external_id,
            "product_status": product_status,
            "offer_ids": offer_ids,
            "offers_created": created_offers,
            "offers_updated": updated_offers,
            "offers_count": len(offer_ids),
            "synced_at": finished_at,
        }

    @classmethod
    def _build_preview_payload(cls, *, payload: CatalogProductPayload, source_reference: str) -> dict[str, object]:
        primary_offer = payload.offers[0] if payload.offers else None

        return {
            "provider": cls.provider.provider_name,
            "source_url": source_reference if source_reference.startswith("http") else payload.canonical_url,
            "resolved_url": payload.canonical_url,
            "store_code": payload.marketplace,
            "external_id": payload.external_id,
            "name": payload.title,
            "slug": cls._slugify(payload.title),
            "brand": payload.brand or "Mercado Livre",
            "category": payload.category_name or payload.category_id or "Mercado Livre",
            "description": payload.description or "Produto importado do catalogo oficial do Mercado Livre.",
            "thumbnail_url": payload.thumbnail_url,
            "seller_name": primary_offer.seller_name if primary_offer else "Mercado Livre",
            "affiliate_url": (primary_offer.product_url if primary_offer else payload.canonical_url),
            "landing_url": payload.canonical_url,
            "price": primary_offer.price if primary_offer else Decimal("0.00"),
            "original_price": primary_offer.original_price if primary_offer else None,
        }

    @classmethod
    def _fetch_target_product_details(cls, *, access_token: str | None) -> list[dict[str, object]]:
        details: list[dict[str, object]] = []
        for target_id in cls.diagnostic_target_ids:
            try:
                product = cls.provider._get_json(f"/products/{target_id}", access_token=access_token)
            except Exception as exc:  # noqa: BLE001 - temporary admin diagnostics
                details.append(
                    {
                        "target_id": target_id,
                        "error": {
                            "type": exc.__class__.__name__,
                            "message": getattr(exc, "message", str(exc)),
                        },
                    }
                )
                continue

            details.append(
                {
                    "target_id": target_id,
                    "id": product.get("id"),
                    "title": product.get("name") or product.get("title"),
                    "permalink": product.get("permalink"),
                    "catalog_product_id": product.get("catalog_product_id"),
                    "catalog_listing": product.get("catalog_listing"),
                    "available_quantity": product.get("available_quantity"),
                    "sold_quantity": product.get("sold_quantity"),
                    "buying_mode": product.get("buying_mode"),
                    "condition": product.get("condition"),
                    "status": product.get("status"),
                    "seller": product.get("seller"),
                    "buy_box_winner": product.get("buy_box_winner"),
                    "pickers": product.get("pickers"),
                    "children_ids": product.get("children_ids"),
                    "attributes_relevantes": cls._extract_diagnostic_attributes(product),
                }
            )
        return details

    @classmethod
    def _find_diagnostic_matches(cls, results: list[object]) -> list[dict[str, object]]:
        matches: list[dict[str, object]] = []
        for raw_item in results:
            if not isinstance(raw_item, dict):
                continue

            permalink = str(raw_item.get("permalink") or "")
            item_id = str(raw_item.get("id") or "")
            catalog_product_id = str(raw_item.get("catalog_product_id") or "")
            haystack = " ".join([permalink, item_id, catalog_product_id]).upper()
            if any(target_id in haystack for target_id in cls.diagnostic_target_ids):
                matches.append(
                    {
                        "id": raw_item.get("id"),
                        "title": raw_item.get("title") or raw_item.get("name"),
                        "permalink": raw_item.get("permalink"),
                        "catalog_product_id": raw_item.get("catalog_product_id"),
                        "catalog_listing": raw_item.get("catalog_listing"),
                        "available_quantity": raw_item.get("available_quantity"),
                        "sold_quantity": raw_item.get("sold_quantity"),
                        "buying_mode": raw_item.get("buying_mode"),
                        "condition": raw_item.get("condition"),
                        "status": raw_item.get("status"),
                        "seller": raw_item.get("seller"),
                        "attributes_relevantes": cls._extract_diagnostic_attributes(raw_item),
                    }
                )
        return matches

    @staticmethod
    def _extract_diagnostic_attributes(raw_item: dict[str, object]) -> list[dict[str, object]]:
        attribute_ids = {
            "BRAND",
            "LINE",
            "MODEL",
            "MODEL_ALPHANUMERIC",
            "INTERNAL_MEMORY",
            "RAM",
            "COLOR",
            "ITEM_CONDITION",
            "SELLER_SKU",
            "GTIN",
        }
        attributes = raw_item.get("attributes")
        if not isinstance(attributes, list):
            return []

        relevant: list[dict[str, object]] = []
        for attribute in attributes:
            if not isinstance(attribute, dict):
                continue
            attribute_id = str(attribute.get("id") or "").strip().upper()
            attribute_name = str(attribute.get("name") or "").strip().lower()
            if attribute_id in attribute_ids or any(
                token in attribute_name for token in ("mem", "armazen", "capacidade", "cor", "modelo", "marca", "linha")
            ):
                relevant.append(
                    {
                        "id": attribute.get("id"),
                        "name": attribute.get("name"),
                        "value_id": attribute.get("value_id"),
                        "value_name": attribute.get("value_name"),
                    }
                )
        return relevant

    @classmethod
    def _upsert_product(cls, db: Session, *, payload: CatalogProductPayload) -> tuple[Product, str]:
        product = db.scalar(
            select(Product).where(
                Product.marketplace == payload.marketplace,
                Product.external_id == payload.external_id,
            )
        )

        normalized_slug = cls._ensure_unique_slug(
            db,
            base_slug=cls._slugify(payload.title),
            marketplace=payload.marketplace,
            external_id=payload.external_id,
            current_product_id=product.id if product else None,
        )
        category_label = payload.category_name or payload.category_id or "Mercado Livre"

        if not product:
            product = Product(
                slug=normalized_slug,
                name=payload.title,
                title=payload.title,
                marketplace=payload.marketplace,
                external_id=payload.external_id,
                brand=payload.brand or "Mercado Livre",
                category=category_label,
                category_id=payload.category_id,
                description=payload.description or "Produto sincronizado do catalogo do Mercado Livre.",
                thumbnail_url=payload.thumbnail_url or payload.canonical_url,
                canonical_url=payload.canonical_url,
                condition=payload.condition,
                currency_id=payload.currency_id,
                popularity_score=0,
                is_active=payload.is_active,
                last_synced_at=payload.last_synced_at,
            )
            db.add(product)
            db.flush()
            return product, "created"

        has_changes = any(
            (
                product.slug != normalized_slug,
                product.name != payload.title,
                product.title != payload.title,
                product.brand != (payload.brand or "Mercado Livre"),
                product.category != category_label,
                product.category_id != payload.category_id,
                product.description != (payload.description or "Produto sincronizado do catalogo do Mercado Livre."),
                product.thumbnail_url != (payload.thumbnail_url or payload.canonical_url),
                product.canonical_url != payload.canonical_url,
                product.condition != payload.condition,
                product.currency_id != payload.currency_id,
                product.is_active != payload.is_active,
            )
        )

        product.slug = normalized_slug
        product.name = payload.title
        product.title = payload.title
        product.marketplace = payload.marketplace
        product.external_id = payload.external_id
        product.brand = payload.brand or "Mercado Livre"
        product.category = category_label
        product.category_id = payload.category_id
        product.description = payload.description or "Produto sincronizado do catalogo do Mercado Livre."
        product.thumbnail_url = payload.thumbnail_url or payload.canonical_url
        product.canonical_url = payload.canonical_url
        product.condition = payload.condition
        product.currency_id = payload.currency_id
        product.is_active = payload.is_active
        product.last_synced_at = payload.last_synced_at
        db.flush()
        return product, "updated" if has_changes else "unchanged"

    @classmethod
    def _upsert_offer(
        cls,
        db: Session,
        *,
        product: Product,
        store: Store,
        payload: CatalogOfferPayload,
    ) -> tuple[Offer, str]:
        offer = db.scalar(
            select(Offer).where(
                Offer.store_id == store.id,
                Offer.external_offer_id == payload.external_id,
            )
        )

        availability = cls._normalize_availability(payload.status, payload.available_quantity)

        if not offer:
            offer = Offer(
                product_id=product.id,
                store_id=store.id,
                marketplace=payload.marketplace,
                external_offer_id=payload.external_id,
                seller_id=payload.seller_id,
                seller_name=payload.seller_name,
                title=payload.title,
                affiliate_url=payload.product_url,
                landing_url=payload.product_url,
                product_url=payload.product_url,
                price=payload.price,
                original_price=payload.original_price,
                currency=payload.currency_id,
                shipping_cost=None,
                installment_text=None,
                availability=availability,
                available_quantity=payload.available_quantity,
                is_featured=True,
                is_active=payload.is_active,
                fetched_at=payload.fetched_at,
                last_synced_at=payload.fetched_at,
            )
            db.add(offer)
            db.flush()
            cls._append_price_history(db, offer=offer, captured_at=payload.fetched_at)
            return offer, "created"

        has_relevant_change = any(
            (
                offer.price != payload.price,
                offer.original_price != payload.original_price,
                offer.availability != availability,
                offer.available_quantity != payload.available_quantity,
                offer.is_active != payload.is_active,
            )
        )

        offer.product_id = product.id
        offer.marketplace = payload.marketplace
        offer.seller_id = payload.seller_id
        offer.seller_name = payload.seller_name
        offer.title = payload.title
        offer.affiliate_url = payload.product_url
        offer.landing_url = payload.product_url
        offer.product_url = payload.product_url
        offer.price = payload.price
        offer.original_price = payload.original_price
        offer.currency = payload.currency_id
        offer.availability = availability
        offer.available_quantity = payload.available_quantity
        offer.is_active = payload.is_active
        offer.fetched_at = payload.fetched_at
        offer.last_synced_at = payload.fetched_at
        db.flush()

        if has_relevant_change:
            cls._append_price_history(db, offer=offer, captured_at=payload.fetched_at)
            return offer, "updated"

        return offer, "unchanged"

    @staticmethod
    def _append_price_history(db: Session, *, offer: Offer, captured_at: datetime) -> None:
        db.add(
            PriceHistory(
                offer_id=offer.id,
                product_id=offer.product_id,
                captured_at=captured_at,
                price=offer.price,
                original_price=offer.original_price,
                shipping_cost=offer.shipping_cost,
                availability=offer.availability,
            )
        )

    @staticmethod
    def _normalize_availability(status: str, available_quantity: int | None) -> str:
        normalized_status = status.strip().lower()
        if normalized_status != "active":
            return "out_of_stock"
        if available_quantity is None:
            return "in_stock"
        if available_quantity <= 0:
            return "out_of_stock"
        if available_quantity <= 5:
            return "low_stock"
        return "in_stock"

    @staticmethod
    def _slugify(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-") or "produto"

    @classmethod
    def _ensure_unique_slug(
        cls,
        db: Session,
        *,
        base_slug: str,
        marketplace: str,
        external_id: str,
        current_product_id: str | None,
    ) -> str:
        if not base_slug:
            base_slug = "produto"

        candidate = base_slug
        suffix = 2
        while True:
            existing = db.scalar(select(Product).where(Product.slug == candidate))
            if not existing or existing.id == current_product_id:
                return candidate

            candidate = f"{base_slug}-{marketplace}-{external_id.lower()}"
            existing = db.scalar(select(Product).where(Product.slug == candidate))
            if not existing or existing.id == current_product_id:
                return candidate

            candidate = f"{base_slug}-{suffix}"
            suffix += 1
