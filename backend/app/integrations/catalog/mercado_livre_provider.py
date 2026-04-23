import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from app.core.config import settings
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.integrations.catalog.base import BaseCatalogProvider
from app.integrations.catalog.types import CatalogOfferPayload, CatalogProductPayload, CatalogSearchItem, CatalogSearchResult
from app.services.admin_product_import_service import AdminProductImportService


class MercadoLivreCatalogProvider(BaseCatalogProvider):
    provider_name = "mercado-livre-catalog"
    marketplace = "mercado-livre"

    def search_products(self, *, query: str, limit: int = 10) -> CatalogSearchResult:
        normalized_query = query.strip()
        if not normalized_query:
            raise BusinessRuleError("Query is required to search Mercado Livre catalog", code="CATALOG_QUERY_REQUIRED")

        payload = self._get_json(
            f"/sites/{settings.mercado_livre_site_id}/search?q={quote(normalized_query)}&limit={max(1, min(limit, 50))}"
        )

        items: list[CatalogSearchItem] = []
        for raw_item in payload.get("results", []):
            item_id = self._normalize_optional_text(raw_item.get("id"))
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

        return CatalogSearchResult(provider=self.provider_name, query=normalized_query, items=items)

    def fetch_product_details(
        self,
        *,
        external_id: str | None = None,
        product_url: str | None = None,
    ) -> CatalogProductPayload:
        resolved_external_id = self._resolve_external_id(external_id=external_id, product_url=product_url)
        item = self._get_json(f"/items/{quote(resolved_external_id)}")
        description_payload = self._get_optional_json(f"/items/{quote(resolved_external_id)}/description")
        seller_payload = self._get_optional_json(f"/users/{item['seller_id']}") if item.get("seller_id") else None
        synced_at = datetime.now(timezone.utc)

        title = self._normalize_optional_text(item.get("title"))
        if not title:
            raise BusinessRuleError("Mercado Livre item payload is missing title", code="CATALOG_ITEM_TITLE_MISSING")

        price = self._to_decimal(item.get("price"))
        if price is None or price <= 0:
            raise BusinessRuleError("Mercado Livre item payload is missing price", code="CATALOG_ITEM_PRICE_MISSING")

        canonical_url = (
            self._normalize_optional_text(item.get("permalink"))
            or self._normalize_optional_text(product_url)
            or self._build_fallback_product_url(resolved_external_id)
        )

        seller_name = self._normalize_optional_text((seller_payload or {}).get("nickname")) or self.marketplace.title()
        offer = CatalogOfferPayload(
            marketplace=self.marketplace,
            external_id=resolved_external_id,
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
            external_id=resolved_external_id,
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

    def _resolve_external_id(self, *, external_id: str | None, product_url: str | None) -> str:
        normalized_external_id = self._normalize_optional_text(external_id)
        if normalized_external_id:
            return normalized_external_id

        normalized_product_url = self._normalize_optional_text(product_url)
        if not normalized_product_url:
            raise BusinessRuleError(
                "Either external_id or product_url is required to fetch Mercado Livre item",
                code="CATALOG_ITEM_REFERENCE_REQUIRED",
            )

        parsed = AdminProductImportService.import_by_url(normalized_product_url)
        parsed_external_id = self._normalize_optional_text(parsed.external_id)
        if not parsed_external_id:
            raise NotFoundError("Could not resolve Mercado Livre external id from URL", code="CATALOG_ITEM_ID_NOT_FOUND")

        return parsed_external_id

    def _get_json(self, path: str) -> dict:
        request = Request(
            f"{settings.mercado_livre_api_base_url.rstrip('/')}{path}",
            headers={
                "Accept": "application/json",
                "User-Agent": "LinkShopBot/1.0",
            },
        )
        with urlopen(request, timeout=settings.mercado_livre_timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))

    def _get_optional_json(self, path: str) -> dict | None:
        try:
            return self._get_json(path)
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

    def _build_fallback_product_url(self, external_id: str) -> str:
        return f"https://www.mercadolivre.com.br/p/{external_id}"

    def _normalize_optional_text(self, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

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
