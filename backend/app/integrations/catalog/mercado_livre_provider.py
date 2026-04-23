import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from socket import timeout as SocketTimeout
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from app.core.config import settings
from app.core.exceptions import BusinessRuleError, ExternalServiceError, NotFoundError
from app.integrations.catalog.base import BaseCatalogProvider
from app.integrations.catalog.types import CatalogOfferPayload, CatalogProductPayload, CatalogSearchItem, CatalogSearchResult
from app.services.admin_product_import_service import AdminProductImportService


@dataclass(frozen=True)
class MercadoLivreReference:
    reference_id: str
    reference_type: str
    resolved_url: str | None = None


class MercadoLivreCatalogProvider(BaseCatalogProvider):
    provider_name = "mercado-livre-catalog"
    marketplace = "mercado-livre"

    def search_products(self, *, query: str, limit: int = 10, access_token: str | None = None) -> CatalogSearchResult:
        normalized_query = query.strip()
        if not normalized_query:
            raise BusinessRuleError("Query is required to search Mercado Livre catalog", code="CATALOG_QUERY_REQUIRED")

        if access_token:
            payload = self._get_json(
                f"/products/search?status=active&site_id={settings.mercado_livre_site_id}&q={quote(normalized_query)}&limit={max(1, min(limit, 50))}",
                access_token=access_token,
            )
            items = self._parse_catalog_product_search_results(payload)
        else:
            payload = self._get_json(
                f"/sites/{settings.mercado_livre_site_id}/search?q={quote(normalized_query)}&limit={max(1, min(limit, 50))}",
                access_token=access_token,
            )
            items = self._parse_marketplace_search_results(payload)

        return CatalogSearchResult(provider=self.provider_name, query=normalized_query, items=items)

    def fetch_product_details(
        self,
        *,
        external_id: str | None = None,
        product_url: str | None = None,
        access_token: str | None = None,
    ) -> CatalogProductPayload:
        reference = self._resolve_reference(external_id=external_id, product_url=product_url)

        if reference.reference_type == "product":
            try:
                return self._fetch_catalog_product_details(reference=reference, product_url=product_url, access_token=access_token)
            except NotFoundError:
                return self._fetch_item_details(reference=reference, product_url=product_url, access_token=access_token)

        try:
            return self._fetch_item_details(reference=reference, product_url=product_url, access_token=access_token)
        except NotFoundError:
            return self._fetch_catalog_product_details(reference=reference, product_url=product_url, access_token=access_token)

    def _fetch_item_details(
        self,
        *,
        reference: MercadoLivreReference,
        product_url: str | None,
        access_token: str | None,
    ) -> CatalogProductPayload:
        item = self._get_json(f"/items/{quote(reference.reference_id)}", access_token=access_token)
        description_payload = self._get_optional_json(
            f"/items/{quote(reference.reference_id)}/description",
            access_token=access_token,
        )
        seller_payload = (
            self._get_optional_json(f"/users/{item['seller_id']}", access_token=access_token)
            if item.get("seller_id")
            else None
        )
        synced_at = datetime.now(timezone.utc)

        title = self._normalize_optional_text(item.get("title"))
        if not title:
            raise BusinessRuleError("Mercado Livre item payload is missing title", code="CATALOG_ITEM_TITLE_MISSING")

        price = self._to_decimal(item.get("price"))
        if price is None or price <= 0:
            raise BusinessRuleError("Mercado Livre item payload is missing price", code="CATALOG_ITEM_PRICE_MISSING")

        canonical_url = (
            self._normalize_optional_text(item.get("permalink"))
            or reference.resolved_url
            or self._normalize_optional_text(product_url)
            or self._build_fallback_product_url(reference.reference_id, reference_type="item")
        )

        seller_name = self._normalize_optional_text((seller_payload or {}).get("nickname")) or self.marketplace.title()
        offer = CatalogOfferPayload(
            marketplace=self.marketplace,
            external_id=reference.reference_id,
            seller_id=str(item.get("seller_id")) if item.get("seller_id") is not None else None,
            seller_name=seller_name,
            title=title,
            price=price,
            original_price=self._to_decimal(item.get("original_price")),
            product_url=canonical_url,
            available_quantity=self._to_int(item.get("available_quantity")),
            status=self._normalize_optional_text(item.get("status")) or "active",
            condition=self._normalize_optional_text(item.get("condition")),
            currency_id=self._normalize_optional_text(item.get("currency_id")) or "BRL",
            is_active=(self._normalize_optional_text(item.get("status")) or "active") == "active",
            fetched_at=synced_at,
        )

        return CatalogProductPayload(
            marketplace=self.marketplace,
            external_id=self._normalize_optional_text(item.get("catalog_product_id")) or reference.reference_id,
            title=title,
            category_id=self._normalize_optional_text(item.get("category_id")),
            category_name=self._normalize_optional_text(item.get("domain_id")),
            thumbnail_url=self._extract_thumbnail(item),
            canonical_url=canonical_url,
            brand=self._extract_brand_from_attributes(item.get("attributes")),
            condition=self._normalize_optional_text(item.get("condition")),
            currency_id=self._normalize_optional_text(item.get("currency_id")) or "BRL",
            description=self._normalize_optional_text((description_payload or {}).get("plain_text")),
            is_active=offer.is_active,
            last_synced_at=synced_at,
            offers=[offer],
        )

    def _fetch_catalog_product_details(
        self,
        *,
        reference: MercadoLivreReference,
        product_url: str | None,
        access_token: str | None,
    ) -> CatalogProductPayload:
        product = self._get_json(f"/products/{quote(reference.reference_id)}", access_token=access_token)
        synced_at = datetime.now(timezone.utc)
        product_status = self._normalize_optional_text(product.get("status")) or "inactive"
        children_ids = product.get("children_ids")
        if product_status != "active" and isinstance(children_ids, list) and children_ids:
            raise BusinessRuleError(
                "Mercado Livre catalog product is a parent PDP. Open a specific variation/product page before importing.",
                code="MERCADO_LIVRE_CATALOG_PRODUCT_NOT_SPECIFIC",
            )

        title = self._normalize_optional_text(product.get("name"))
        if not title:
            raise BusinessRuleError("Mercado Livre product payload is missing name", code="CATALOG_PRODUCT_TITLE_MISSING")

        buy_box_winner = product.get("buy_box_winner") if isinstance(product.get("buy_box_winner"), dict) else {}
        winner_item_id = self._normalize_reference_id(buy_box_winner.get("item_id"))
        winner_item = (
            self._get_optional_json(f"/items/{quote(winner_item_id)}", access_token=access_token)
            if winner_item_id
            else None
        )
        description_payload = (
            self._get_optional_json(f"/items/{quote(winner_item_id)}/description", access_token=access_token)
            if winner_item_id
            else None
        )
        seller_id = None
        if isinstance(winner_item, dict) and winner_item.get("seller_id") is not None:
            seller_id = str(winner_item.get("seller_id"))
        elif buy_box_winner.get("seller_id") is not None:
            seller_id = str(buy_box_winner.get("seller_id"))
        seller_payload = self._get_optional_json(f"/users/{seller_id}", access_token=access_token) if seller_id else None

        price = self._to_decimal((winner_item or {}).get("price")) or self._to_decimal(buy_box_winner.get("price"))
        if price is None or price <= 0:
            raise BusinessRuleError(
                "Mercado Livre catalog product does not expose an active buy box winner with price.",
                code="MERCADO_LIVRE_PRODUCT_WITHOUT_BUY_BOX",
            )

        original_price = self._to_decimal((winner_item or {}).get("original_price")) or self._to_decimal(
            buy_box_winner.get("original_price")
        )
        canonical_url = (
            self._normalize_optional_text(product.get("permalink"))
            or reference.resolved_url
            or self._normalize_optional_text(product_url)
            or self._build_fallback_product_url(reference.reference_id, reference_type="product")
        )
        seller_name = self._normalize_optional_text((seller_payload or {}).get("nickname")) or self.marketplace.title()
        offer_reference_id = winner_item_id or reference.reference_id
        item_status = self._normalize_optional_text((winner_item or {}).get("status")) or ("active" if product_status == "active" else "paused")
        offer_url = (
            self._normalize_optional_text((winner_item or {}).get("permalink"))
            or self._normalize_optional_text((winner_item or {}).get("permalink"))
            or canonical_url
        )
        offer = CatalogOfferPayload(
            marketplace=self.marketplace,
            external_id=offer_reference_id,
            seller_id=seller_id,
            seller_name=seller_name,
            title=title,
            price=price,
            original_price=original_price,
            product_url=offer_url,
            available_quantity=self._to_int((winner_item or {}).get("available_quantity")),
            status=item_status,
            condition=self._normalize_optional_text((winner_item or {}).get("condition"))
            or self._normalize_optional_text(product.get("condition")),
            currency_id=self._normalize_optional_text((winner_item or {}).get("currency_id"))
            or self._normalize_optional_text(buy_box_winner.get("currency_id"))
            or "BRL",
            is_active=item_status == "active",
            fetched_at=synced_at,
        )

        return CatalogProductPayload(
            marketplace=self.marketplace,
            external_id=reference.reference_id,
            title=title,
            category_id=self._normalize_optional_text((winner_item or {}).get("category_id")),
            category_name=self._normalize_optional_text(product.get("domain_id")),
            thumbnail_url=self._extract_catalog_product_thumbnail(product) or self._extract_thumbnail(winner_item or {}),
            canonical_url=canonical_url,
            brand=self._extract_brand_from_attributes(product.get("attributes")),
            condition=self._normalize_optional_text((winner_item or {}).get("condition"))
            or self._normalize_optional_text(product.get("condition")),
            currency_id=offer.currency_id,
            description=self._extract_catalog_product_description(product) or self._normalize_optional_text((description_payload or {}).get("plain_text")),
            is_active=product_status == "active",
            last_synced_at=synced_at,
            offers=[offer],
        )

    def _resolve_reference(self, *, external_id: str | None, product_url: str | None) -> MercadoLivreReference:
        normalized_external_id = self._normalize_optional_text(external_id)
        if normalized_external_id:
            normalized_reference_id = self._normalize_reference_id(normalized_external_id)
            if not normalized_reference_id:
                raise BusinessRuleError(
                    "Mercado Livre reference id is invalid",
                    code="CATALOG_ITEM_REFERENCE_INVALID",
                )
            return MercadoLivreReference(reference_id=normalized_reference_id, reference_type="item")

        normalized_product_url = self._normalize_optional_text(product_url)
        if not normalized_product_url:
            raise BusinessRuleError(
                "Either external_id or product_url is required to fetch Mercado Livre item",
                code="CATALOG_ITEM_REFERENCE_REQUIRED",
            )

        resolved_url, reference_id, reference_type = AdminProductImportService.resolve_mercado_livre_reference(
            normalized_product_url
        )
        return MercadoLivreReference(
            reference_id=reference_id,
            reference_type=reference_type,
            resolved_url=resolved_url,
        )

    def _get_json(self, path: str, *, access_token: str | None = None) -> dict:
        url = f"{settings.mercado_livre_api_base_url.rstrip('/')}{path}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "LinkShop/1.0 (+https://link-shop-navy.vercel.app)",
        }
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        request = Request(
            url,
            headers=headers,
        )
        try:
            with urlopen(request, timeout=settings.mercado_livre_timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = f"Mercado Livre API rejected catalog request with HTTP {exc.code}."
            if exc.code == 403:
                message = "Mercado Livre API rejected the catalog request with HTTP 403. Check account permissions, request headers, rate limits, or network policy."
            if exc.code == 404:
                raise NotFoundError("Mercado Livre item or catalog product was not found", code="MERCADO_LIVRE_ITEM_NOT_FOUND") from exc
            raise ExternalServiceError(
                message,
                code="MERCADO_LIVRE_HTTP_ERROR",
                status_code=502,
            ) from exc
        except (TimeoutError, SocketTimeout) as exc:
            raise ExternalServiceError(
                f"Mercado Livre API timed out after {settings.mercado_livre_timeout_seconds} seconds.",
                code="MERCADO_LIVRE_TIMEOUT",
                status_code=504,
            ) from exc
        except URLError as exc:
            reason = str(getattr(exc, "reason", exc))
            raise ExternalServiceError(
                f"Could not connect to Mercado Livre API: {reason}",
                code="MERCADO_LIVRE_NETWORK_ERROR",
                status_code=502,
            ) from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ExternalServiceError(
                "Mercado Livre API returned an invalid JSON response.",
                code="MERCADO_LIVRE_INVALID_RESPONSE",
                status_code=502,
            ) from exc

    def _get_optional_json(self, path: str, *, access_token: str | None = None) -> dict | None:
        try:
            return self._get_json(path, access_token=access_token)
        except Exception:
            return None

    def _extract_brand_from_attributes(self, attributes: object) -> str | None:
        if not isinstance(attributes, list):
            return None

        for attribute in attributes:
            if not isinstance(attribute, dict):
                continue

            attribute_id = str(attribute.get("id", "")).strip().upper()
            attribute_name = str(attribute.get("name", "")).strip().lower()
            if attribute_id != "BRAND" and attribute_name != "marca":
                continue

            value_name = self._normalize_optional_text(attribute.get("value_name"))
            if value_name:
                return value_name

        return None

    def _extract_thumbnail(self, item: dict) -> str | None:
        pictures = item.get("pictures")
        if isinstance(pictures, list):
            for picture in pictures:
                if not isinstance(picture, dict):
                    continue
                for key in ("secure_url", "url"):
                    candidate = self._normalize_optional_text(picture.get(key))
                    if candidate:
                        return candidate

        return self._normalize_optional_text(item.get("thumbnail"))

    def _extract_catalog_product_thumbnail(self, product: dict) -> str | None:
        pictures = product.get("pictures")
        if isinstance(pictures, list):
            for picture in pictures:
                if not isinstance(picture, dict):
                    continue
                for key in ("secure_url", "url"):
                    candidate = self._normalize_optional_text(picture.get(key))
                    if candidate:
                        return candidate

        return self._normalize_optional_text(product.get("thumbnail"))

    def _extract_catalog_product_description(self, product: dict) -> str | None:
        short_description = product.get("short_description")
        if isinstance(short_description, dict):
            for key in ("content", "plain_text"):
                candidate = self._normalize_optional_text(short_description.get(key))
                if candidate:
                    return candidate

        return None

    def _parse_marketplace_search_results(self, payload: dict) -> list[CatalogSearchItem]:
        items: list[CatalogSearchItem] = []
        for raw_item in payload.get("results", []):
            item_id = self._normalize_reference_id(raw_item.get("id"))
            title = self._normalize_optional_text(raw_item.get("title"))
            if not item_id or not title:
                continue

            items.append(
                CatalogSearchItem(
                    marketplace=self.marketplace,
                    external_id=item_id,
                    title=title,
                    category_id=self._normalize_optional_text(raw_item.get("category_id")),
                    thumbnail_url=self._normalize_optional_text(raw_item.get("thumbnail")),
                    canonical_url=self._normalize_optional_text(raw_item.get("permalink")),
                    brand=self._extract_brand_from_attributes(raw_item.get("attributes")),
                    condition=self._normalize_optional_text(raw_item.get("condition")),
                    currency_id=self._normalize_optional_text(raw_item.get("currency_id")) or "BRL",
                    price=self._to_decimal(raw_item.get("price")),
                    original_price=self._to_decimal(raw_item.get("original_price")),
                )
            )

        return items

    def _parse_catalog_product_search_results(self, payload: dict) -> list[CatalogSearchItem]:
        items: list[CatalogSearchItem] = []
        for raw_product in payload.get("results", []):
            product_id = self._normalize_reference_id(raw_product.get("id"))
            title = self._normalize_optional_text(raw_product.get("name"))
            if not product_id or not title:
                continue

            items.append(
                CatalogSearchItem(
                    marketplace=self.marketplace,
                    external_id=product_id,
                    title=title,
                    category_id=self._normalize_optional_text(raw_product.get("domain_id")),
                    thumbnail_url=self._extract_catalog_product_thumbnail(raw_product),
                    canonical_url=self._normalize_optional_text(raw_product.get("permalink"))
                    or self._build_fallback_product_url(product_id, reference_type="product"),
                    brand=self._extract_brand_from_attributes(raw_product.get("attributes")),
                    condition=self._normalize_optional_text(raw_product.get("condition")),
                    currency_id=self._normalize_optional_text((raw_product.get("buy_box_winner") or {}).get("currency_id")) or "BRL",
                    price=self._to_decimal((raw_product.get("buy_box_winner") or {}).get("price")),
                    original_price=self._to_decimal((raw_product.get("buy_box_winner") or {}).get("original_price")),
                )
            )

        return items

    def _build_fallback_product_url(self, external_id: str, *, reference_type: str) -> str:
        if reference_type == "product":
            return f"https://www.mercadolivre.com.br/p/{external_id}"
        return f"https://produto.mercadolivre.com.br/{external_id}"

    def _normalize_optional_text(self, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _normalize_reference_id(self, value: object) -> str | None:
        text = self._normalize_optional_text(value)
        if not text:
            return None

        match = re.search(r"([A-Z]{3})[-_]?(\d+)", text.upper())
        if not match:
            return text.upper()
        return f"{match.group(1)}{match.group(2)}"

    def _to_decimal(self, value: object) -> Decimal | None:
        if value is None:
            return None

        text = str(value).strip()
        if not text:
            return None

        normalized = re.sub(r"[^\d,.\-]", "", text)
        if not normalized:
            return None

        comma_index = normalized.rfind(",")
        dot_index = normalized.rfind(".")
        if comma_index > dot_index:
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")

        try:
            return Decimal(normalized)
        except InvalidOperation:
            return None

    def _to_int(self, value: object) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
