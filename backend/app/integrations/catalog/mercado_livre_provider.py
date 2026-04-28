import json
import math
import logging
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


@dataclass(frozen=True)
class MercadoLivreSearchContext:
    domain_id: str | None = None
    category_id: str | None = None


class MercadoLivreCatalogProvider(BaseCatalogProvider):
    provider_name = "mercado-livre-catalog"
    marketplace = "mercado-livre"
    _AVAILABILITY_CONFIDENCE_PRIORITY = {
        "high": 5,
        "moderate": 4,
        "neutral": 3,
        "uncertain": 2,
        "low": 1,
    }
    _ACCESSORY_TERMS = {
        "acessorio",
        "acessorios",
        "adaptador",
        "adaptadores",
        "cabo",
        "cabos",
        "capa",
        "capa protetora",
        "capinha",
        "capinhas",
        "carregador",
        "case",
        "cases",
        "controle remoto",
        "fone",
        "fones",
        "pelicula",
        "peliculas",
        "pelicula de vidro",
        "suporte",
        "suportes",
    }
    _AUTOMOTIVE_TERMS = {
        "automotivo",
        "automotiva",
        "carro",
        "veicular",
        "veiculo",
        "veiculos",
    }
    logger = logging.getLogger("linkshop.mercado_livre")

    def search_products(
        self,
        *,
        query: str,
        limit: int = 10,
        page: int = 1,
        access_token: str | None = None,
    ) -> CatalogSearchResult:
        normalized_query = query.strip()
        if not normalized_query:
            raise BusinessRuleError("Query is required to search Mercado Livre catalog", code="CATALOG_QUERY_REQUIRED")

        requested_limit = max(1, min(limit, 50))
        requested_page = max(1, page)
        requested_offset = (requested_page - 1) * requested_limit
        search_context = self._discover_search_context(normalized_query, access_token=access_token)
        if access_token:
            catalog_fetch_limit, catalog_fetch_offset = self._build_catalog_rerank_window(
                requested_limit=requested_limit,
                requested_page=requested_page,
            )
            catalog_search_path = self._build_catalog_search_path(
                query=normalized_query,
                limit=catalog_fetch_limit,
                offset=catalog_fetch_offset,
                search_context=search_context,
            )
            catalog_payload = self._get_json(
                catalog_search_path,
                access_token=access_token,
            )
            catalog_items = self._parse_catalog_product_search_results(catalog_payload)
            total = self._extract_total_from_paging(catalog_payload, fallback=len(catalog_items))
            total_pages = max(1, math.ceil(total / requested_limit)) if total else 1
            items = self._rank_search_results(
                query=normalized_query,
                items=catalog_items,
                search_context=search_context,
                limit=catalog_fetch_limit,
            )
            items = self._resolve_catalog_display_items(items, access_token=access_token)
            items = self._slice_catalog_reranked_page(
                items=items,
                requested_limit=requested_limit,
                requested_offset=requested_offset,
                catalog_fetch_offset=catalog_fetch_offset,
            )
            return CatalogSearchResult(
                provider=self.provider_name,
                query=normalized_query,
                page=requested_page,
                page_size=requested_limit,
                total=total,
                total_pages=total_pages,
                items=items,
            )

        try:
            marketplace_payload = self._get_json(
                f"/sites/{settings.mercado_livre_site_id}/search?q={quote(normalized_query)}&limit={requested_limit}&offset={requested_offset}",
                access_token=access_token,
            )
        except ExternalServiceError:
            raise
        else:
            marketplace_items = self._parse_marketplace_search_results(marketplace_payload)
            total = self._extract_total_from_paging(marketplace_payload, fallback=len(marketplace_items))
            total_pages = max(1, math.ceil(total / requested_limit)) if total else 1
            items = self._rank_search_results(
                query=normalized_query,
                items=marketplace_items,
                search_context=search_context,
                limit=requested_limit,
            )
            return CatalogSearchResult(
                provider=self.provider_name,
                query=normalized_query,
                page=requested_page,
                page_size=requested_limit,
                total=total,
                total_pages=total_pages,
                items=items,
            )

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
            error_detail = self._extract_http_error_detail(exc)
            if exc.code == 404:
                raise NotFoundError("Mercado Livre item or catalog product was not found", code="MERCADO_LIVRE_ITEM_NOT_FOUND") from exc
            message = self._build_http_error_message(path=path, status_code=exc.code, detail=error_detail)
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

    def _extract_http_error_detail(self, exc: HTTPError) -> str | None:
        try:
            raw_body = exc.read()
        except Exception:
            return None

        if not raw_body:
            return None

        try:
            body_text = raw_body.decode("utf-8")
        except UnicodeDecodeError:
            return None

        normalized_body = body_text.strip()
        if not normalized_body:
            return None

        try:
            payload = json.loads(normalized_body)
        except json.JSONDecodeError:
            return self._normalize_http_error_text(normalized_body)

        if isinstance(payload, dict):
            parts: list[str] = []
            message = self._normalize_optional_text(payload.get("message"))
            error = self._normalize_optional_text(payload.get("error"))
            if message:
                parts.append(message)
            if error and error.lower() not in {part.lower() for part in parts}:
                parts.append(f"error={error}")

            cause = payload.get("cause")
            if isinstance(cause, list):
                cause_parts = [
                    self._normalize_http_error_text(str(entry))
                    for entry in cause
                    if self._normalize_optional_text(entry)
                ]
                if cause_parts:
                    parts.append(f"cause={' | '.join(cause_parts[:3])}")

            if parts:
                return "; ".join(parts)

        return self._normalize_http_error_text(normalized_body)

    def _build_http_error_message(self, *, path: str, status_code: int, detail: str | None) -> str:
        endpoint = path.split("?", maxsplit=1)[0]
        base_message = f"Mercado Livre API rejected catalog request with HTTP {status_code} on {endpoint}."
        if not detail:
            return base_message
        return f"{base_message} Mercado Livre response: {detail}"

    def _build_catalog_search_path(
        self,
        *,
        query: str,
        limit: int,
        offset: int,
        search_context: MercadoLivreSearchContext,
    ) -> str:
        path = (
            f"/products/search?status=active&site_id={settings.mercado_livre_site_id}"
            f"&q={quote(query)}&limit={limit}&offset={offset}"
        )
        if search_context.domain_id:
            path = f"{path}&domain_id={quote(search_context.domain_id)}"
        return path

    def _extract_total_from_paging(self, payload: dict, *, fallback: int) -> int:
        paging = payload.get("paging")
        if isinstance(paging, dict):
            total = paging.get("total")
            try:
                if total is not None:
                    return max(int(total), 0)
            except (TypeError, ValueError):
                pass
        return fallback

    def _normalize_http_error_text(self, value: str) -> str:
        normalized = re.sub(r"\s+", " ", value).strip()
        if len(normalized) > 240:
            return f"{normalized[:237]}..."
        return normalized

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

    def _discover_search_context(self, query: str, *, access_token: str | None) -> MercadoLivreSearchContext:
        try:
            payload = self._get_json(
                f"/sites/{settings.mercado_livre_site_id}/domain_discovery/search?limit=1&q={quote(query)}",
                access_token=access_token,
            )
        except Exception:
            return MercadoLivreSearchContext()

        if isinstance(payload, list):
            first_match = payload[0] if payload else {}
        elif isinstance(payload, dict):
            first_match = (payload.get("results") or [None])[0] or {}
        else:
            first_match = {}

        if not isinstance(first_match, dict):
            return MercadoLivreSearchContext()

        return MercadoLivreSearchContext(
            domain_id=self._normalize_optional_text(first_match.get("domain_id")),
            category_id=self._normalize_optional_text(first_match.get("category_id")),
        )

    def _parse_marketplace_search_results(self, payload: dict) -> list[CatalogSearchItem]:
        items: list[CatalogSearchItem] = []
        for raw_item in payload.get("results", []):
            item_id = self._normalize_reference_id(raw_item.get("id"))
            title = self._normalize_optional_text(raw_item.get("title"))
            if not item_id or not title:
                continue

            status = self._normalize_optional_text(raw_item.get("status")) or "active"
            if status != "active":
                continue

            available_quantity = self._to_int(raw_item.get("available_quantity"))
            if available_quantity is not None and available_quantity <= 0:
                continue

            items.append(
                CatalogSearchItem(
                    marketplace=self.marketplace,
                    external_id=item_id,
                    title=title,
                    category_id=self._normalize_optional_text(raw_item.get("domain_id"))
                    or self._normalize_optional_text(raw_item.get("category_id")),
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

            status = self._normalize_optional_text(raw_product.get("status")) or "active"
            if status != "active":
                continue

            buy_box_winner = raw_product.get("buy_box_winner") if isinstance(raw_product.get("buy_box_winner"), dict) else {}
            price = self._to_decimal(buy_box_winner.get("price"))

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
                    currency_id=self._normalize_optional_text(buy_box_winner.get("currency_id")) or "BRL",
                    price=price,
                    original_price=self._to_decimal(buy_box_winner.get("original_price")),
                )
            )

        return items

    def _order_catalog_items_by_availability_confidence(self, items: list[CatalogSearchItem]) -> list[CatalogSearchItem]:
        if not items:
            return items

        ranked_items: list[CatalogSearchItem] = []
        before_count = len(items)
        confidence_counts = {key: 0 for key in self._AVAILABILITY_CONFIDENCE_PRIORITY}

        for item in items:
            try:
                confidence, reason = self._classify_search_item_availability_confidence(item)
            except Exception as exc:  # noqa: BLE001 - keep search permissive
                confidence = "uncertain"
                reason = f"availability_validation_failed:{exc.__class__.__name__}"
                self.logger.warning(
                    "Mercado Livre availability validation failed url=%s reason=%s confidence=%s action=kept",
                    item.canonical_url,
                    exc.__class__.__name__,
                    confidence,
                )
            confidence_counts[confidence] += 1
            ranked_items.append(
                item.model_copy(
                    update={
                        "availability_confidence": confidence,
                        "availability_reason": reason,
                    }
                )
            )
            self.logger.info(
                "Mercado Livre availability ranking url=%s confidence=%s reason=%s action=kept",
                item.canonical_url,
                confidence,
                reason,
            )

        ranked_items.sort(
            key=lambda current: (
                self._AVAILABILITY_CONFIDENCE_PRIORITY.get(current.availability_confidence or "neutral", 0),
                1 if current.price is not None else 0,
            ),
            reverse=True,
        )

        self.logger.info(
            "Mercado Livre availability ranking summary before=%s after=%s buckets=%s",
            before_count,
            len(ranked_items),
            confidence_counts,
        )
        return ranked_items

    def _resolve_catalog_display_items(
        self,
        items: list[CatalogSearchItem],
        *,
        access_token: str | None,
    ) -> list[CatalogSearchItem]:
        if not items:
            return items

        resolved_items: list[CatalogSearchItem] = []
        rejected_count = 0
        for item in items:
            resolved_item = self._resolve_catalog_display_item(item=item, access_token=access_token)
            if resolved_item is None:
                rejected_count += 1
                continue
            resolved_items.append(resolved_item)

        resolved_items.sort(
            key=lambda current: (
                self._AVAILABILITY_CONFIDENCE_PRIORITY.get(current.availability_confidence or "uncertain", 0),
                1 if current.price is not None else 0,
            ),
            reverse=True,
        )
        self.logger.info(
            "Mercado Livre strict availability filter before=%s after=%s rejected=%s",
            len(items),
            len(resolved_items),
            rejected_count,
        )
        return resolved_items

    def _resolve_catalog_display_item(
        self,
        *,
        item: CatalogSearchItem,
        access_token: str | None,
    ) -> CatalogSearchItem | None:
        product = self._get_optional_json(f"/products/{quote(item.external_id)}", access_token=access_token)
        if not isinstance(product, dict):
            confidence, reason = self._classify_search_item_availability_confidence(item)
            self.logger.warning(
                "Mercado Livre strict availability external_id=%s decision=kept reason=missing_product_detail confidence=%s fallback_reason=%s",
                item.external_id,
                confidence,
                reason,
            )
            return item.model_copy(
                update={
                    "availability_confidence": confidence,
                    "availability_reason": f"missing_product_detail:{reason}",
                }
            )

        product_status = self._normalize_optional_text(product.get("status")) or "inactive"
        if product_status != "active":
            self.logger.info(
                "Mercado Livre strict availability external_id=%s decision=rejected reason=inactive_product",
                item.external_id,
            )
            return None

        children_ids = product.get("children_ids")
        if isinstance(children_ids, list) and children_ids:
            self.logger.info(
                "Mercado Livre strict availability external_id=%s decision=rejected reason=parent_product",
                item.external_id,
            )
            return None

        canonical_url = self._normalize_optional_text(product.get("permalink")) or self._normalize_optional_text(item.canonical_url)
        if not canonical_url:
            self.logger.info(
                "Mercado Livre strict availability external_id=%s decision=rejected reason=missing_permalink",
                item.external_id,
            )
            return None

        if self._is_current_product_disabled_in_pickers(item.external_id, product.get("pickers")):
            self.logger.info(
                "Mercado Livre strict availability external_id=%s decision=rejected reason=picker_disabled",
                item.external_id,
            )
            return None

        buy_box_winner = product.get("buy_box_winner") if isinstance(product.get("buy_box_winner"), dict) else {}
        buy_box_price = self._to_decimal(buy_box_winner.get("price"))
        has_buy_box_signal = bool(
            self._normalize_reference_id(buy_box_winner.get("item_id"))
            or (buy_box_price is not None and buy_box_price > 0)
        )
        if has_buy_box_signal:
            confidence = "high"
            reason = "buy_box_winner"
        elif isinstance(product.get("pickers"), list) and product.get("pickers"):
            confidence = "moderate"
            reason = "active_child_with_pickers"
        else:
            confidence = "neutral"
            reason = "active_child_product"
        resolved_item = item.model_copy(
            update={
                "canonical_url": canonical_url,
                "thumbnail_url": self._extract_catalog_product_thumbnail(product) or item.thumbnail_url,
                "price": buy_box_price or item.price,
                "original_price": self._to_decimal(buy_box_winner.get("original_price")) or item.original_price,
                "availability_confidence": confidence,
                "availability_reason": reason,
            }
        )
        self.logger.info(
            "Mercado Livre strict availability external_id=%s decision=accepted confidence=%s reason=%s",
            item.external_id,
            confidence,
            reason,
        )
        return resolved_item

    def _classify_search_item_availability_confidence(self, item: CatalogSearchItem) -> tuple[str, str]:
        canonical_url = self._normalize_optional_text(item.canonical_url)
        has_price = item.price is not None and item.price > 0
        has_thumbnail = bool(self._normalize_optional_text(item.thumbnail_url))

        if not canonical_url or "/p/" not in canonical_url.lower():
            if has_price and has_thumbnail:
                return ("moderate", "non_catalog_listing_with_price")
            if has_price or has_thumbnail:
                return ("neutral", "non_catalog_listing_partial_signals")
            return ("uncertain", "non_catalog_listing_without_price_or_thumbnail")
        if has_price and has_thumbnail:
            return ("moderate", "catalog_product_with_price_and_thumbnail")
        if has_thumbnail:
            return ("neutral", "catalog_product_with_thumbnail")
        return ("uncertain", "catalog_product_without_price_or_thumbnail")

    def _is_current_product_disabled_in_pickers(self, product_id: str, pickers: object) -> bool:
        if not isinstance(pickers, list):
            return False

        normalized_product_id = product_id.strip().upper()
        for picker in pickers:
            if not isinstance(picker, dict):
                continue
            products = picker.get("products")
            if not isinstance(products, list):
                continue
            for picker_product in products:
                if not isinstance(picker_product, dict):
                    continue
                picker_product_id = self._normalize_reference_id(picker_product.get("product_id"))
                if picker_product_id != normalized_product_id:
                    continue
                tags = picker_product.get("tags")
                if isinstance(tags, list) and any(str(tag).strip().lower() == "disabled" for tag in tags):
                    return True
        return False

    def _build_catalog_rerank_window(self, *, requested_limit: int, requested_page: int) -> tuple[int, int]:
        pool_limit = min(50, max(requested_limit * 4, requested_limit))
        requested_offset = (requested_page - 1) * requested_limit
        pool_offset = max(0, requested_offset - max(pool_limit - requested_limit, 0))
        return pool_limit, pool_offset

    def _slice_catalog_reranked_page(
        self,
        *,
        items: list[CatalogSearchItem],
        requested_limit: int,
        requested_offset: int,
        catalog_fetch_offset: int,
    ) -> list[CatalogSearchItem]:
        local_start = max(0, requested_offset - catalog_fetch_offset)
        local_end = local_start + requested_limit
        return items[local_start:local_end]

    def _rank_search_results(
        self,
        *,
        query: str,
        items: list[CatalogSearchItem],
        search_context: MercadoLivreSearchContext,
        limit: int,
    ) -> list[CatalogSearchItem]:
        query_text = self._normalize_search_text(query)
        query_tokens = self._tokenize_search_text(query_text)
        query_term_set = set(query_tokens)
        scored_items: list[tuple[int, CatalogSearchItem]] = []
        seen_keys: set[str] = set()

        for item in items:
            dedupe_key = self._build_search_dedupe_key(item)
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            score = self._score_search_item(
                item=item,
                query_text=query_text,
                query_tokens=query_tokens,
                query_term_set=query_term_set,
                search_context=search_context,
            )
            if score <= -100:
                continue
            scored_items.append((score, item))

        scored_items.sort(
            key=lambda entry: (
                entry[0],
                1 if entry[1].price is not None else 0,
                len(entry[1].title),
            ),
            reverse=True,
        )
        return [item for _, item in scored_items[:limit]]

    def _score_search_item(
        self,
        *,
        item: CatalogSearchItem,
        query_text: str,
        query_tokens: list[str],
        query_term_set: set[str],
        search_context: MercadoLivreSearchContext,
    ) -> int:
        title_text = self._normalize_search_text(item.title)
        title_tokens = self._tokenize_search_text(title_text)
        title_token_set = set(title_tokens)
        accessory_terms = self._contains_term_group(title_text, self._ACCESSORY_TERMS)
        automotive_terms = self._contains_term_group(title_text, self._AUTOMOTIVE_TERMS)

        overlap_count = sum(1 for token in query_tokens if token in title_token_set)
        score = overlap_count * 18

        if query_text and query_text in title_text:
            score += 70

        if title_text.startswith(query_text):
            score += 35

        if overlap_count == len(query_tokens) and query_tokens:
            score += 40

        if item.brand and self._normalize_search_text(item.brand) in title_text:
            score += 8

        if search_context.domain_id and item.category_id and item.category_id == search_context.domain_id:
            score += 60
        elif search_context.category_id and item.category_id and item.category_id == search_context.category_id:
            score += 45
        elif search_context.domain_id and item.category_id and item.category_id != search_context.domain_id:
            score -= 20

        if accessory_terms and not any(term in query_text for term in accessory_terms):
            score -= 110

        if automotive_terms and not any(term in query_text for term in automotive_terms):
            score -= 95

        if self._looks_like_storage_or_device_variant(title_tokens) and not accessory_terms:
            score += 22

        if item.price is not None:
            score += 5

        return score

    def _looks_like_storage_or_device_variant(self, tokens: list[str]) -> bool:
        return any(token in {"64", "128", "256", "512"} for token in tokens) or any(
            token.endswith("gb") or token.endswith("tb") for token in tokens
        )

    def _build_search_dedupe_key(self, item: CatalogSearchItem) -> str:
        canonical = self._normalize_optional_text(item.canonical_url)
        if canonical:
            return canonical.lower()
        return f"{item.external_id.lower()}::{self._normalize_search_text(item.title)}"

    def _contains_term_group(self, text: str, terms: set[str]) -> set[str]:
        matches: set[str] = set()
        for term in terms:
            normalized_term = self._normalize_search_text(term)
            if normalized_term and normalized_term in text:
                matches.add(normalized_term)
        return matches

    def _normalize_search_text(self, value: str) -> str:
        normalized = value.lower()
        normalized = normalized.replace("-", " ")
        normalized = normalized.replace("_", " ")
        normalized = normalized.replace("á", "a").replace("à", "a").replace("â", "a").replace("ã", "a")
        normalized = normalized.replace("é", "e").replace("ê", "e")
        normalized = normalized.replace("í", "i")
        normalized = normalized.replace("ó", "o").replace("ô", "o").replace("õ", "o")
        normalized = normalized.replace("ú", "u")
        normalized = normalized.replace("ç", "c")
        normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
        return re.sub(r"\s+", " ", normalized).strip()

    def _tokenize_search_text(self, value: str) -> list[str]:
        if not value:
            return []
        return [token for token in value.split(" ") if len(token) > 1]

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
