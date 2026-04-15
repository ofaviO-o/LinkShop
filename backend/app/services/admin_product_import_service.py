import json
import re
from decimal import Decimal, InvalidOperation
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urljoin, urlparse
from urllib.request import Request, urlopen

from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BusinessRuleError, ConflictError
from app.models.offer import Offer
from app.models.product import Product
from app.models.store import Store
from app.schemas.admin_product import (
    AdminProductImportBatchInput,
    AdminProductImportBatchItemRead,
    AdminProductImportBatchRead,
    AdminProductImportBatchSummaryRead,
    AdminProductImportRead,
    AdminProductWriteInput,
)
from app.schemas.product import CatalogItemRead
from app.services.admin_product_service import AdminProductService


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized


class AdminProductImportService:
    _MERCADO_LIVRE_HOST_MARKERS: tuple[str, ...] = (
        "mercadolivre.com.br",
        "mercadolibre.com",
    )

    @staticmethod
    def import_by_url(url: str) -> AdminProductImportRead:
        source_url = AdminProductImportService._normalize_input_url(url)
        html, resolved_url = AdminProductImportService._fetch_html_with_redirects(source_url)
        provider = AdminProductImportService._detect_provider(resolved_url)

        if provider != "mercado-livre":
            raise BusinessRuleError(
                "Provider not supported yet. Use a Mercado Livre product URL.",
                code="IMPORT_PROVIDER_NOT_SUPPORTED",
            )

        html, resolved_url = AdminProductImportService._resolve_mercado_livre_social_destination(
            resolved_url=resolved_url,
            html=html,
        )

        return AdminProductImportService._import_mercado_livre(
            source_url=source_url,
            resolved_url=resolved_url,
            html=html,
        )

    @staticmethod
    def import_batch(db: Session, payload: AdminProductImportBatchInput) -> AdminProductImportBatchRead:
        results: list[AdminProductImportBatchItemRead] = []
        counters = {
            "imported": 0,
            "duplicates": 0,
            "invalid": 0,
            "extraction_failed": 0,
            "not_supported": 0,
        }

        for raw_url in payload.urls:
            url = raw_url.strip()
            if not url:
                results.append(
                    AdminProductImportBatchItemRead(
                        url=raw_url,
                        resolved_url=None,
                        status="invalid",
                        message="Empty URL entry",
                    )
                )
                counters["invalid"] += 1
                continue

            resolved_url: str | None = None
            try:
                imported = AdminProductImportService.import_by_url(url)
                resolved_url = imported.resolved_url
            except BusinessRuleError as exc:
                status = AdminProductImportService._classify_error_status(exc.code)
                resolved_url = AdminProductImportService._resolve_url_for_diagnostics(url)
                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status=status,
                        message=exc.message,
                    )
                )
                counters[AdminProductImportService._counter_key_for_status(status)] += 1
                continue
            except Exception:
                resolved_url = AdminProductImportService._resolve_url_for_diagnostics(url)
                status, message = AdminProductImportService._classify_residual_import_failure(resolved_url)
                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status=status,
                        message=message,
                    )
                )
                counters[AdminProductImportService._counter_key_for_status(status)] += 1
                continue

            duplicate = AdminProductImportService._find_duplicate(db, imported)
            if duplicate:
                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status="duplicate",
                        message=duplicate["message"],
                        product_id=duplicate["product_id"],
                        product_slug=duplicate["product_slug"],
                    )
                )
                counters["duplicates"] += 1
                continue

            missing_fields = AdminProductImportService._collect_missing_required_fields(imported)
            if missing_fields:
                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status="extraction_failed",
                        message=f"missing_required_field: {', '.join(missing_fields)}",
                    )
                )
                counters["extraction_failed"] += 1
                continue

            try:
                assert imported.price is not None
                assert imported.thumbnail_url is not None

                write_payload = AdminProductWriteInput(
                    slug=imported.slug,
                    name=imported.name or "",
                    brand=imported.brand or "Sem marca",
                    category=imported.category or "Marketplace",
                    description=imported.description or "Produto importado via lote.",
                    thumbnail_url=imported.thumbnail_url.strip(),
                    popularity_score=0,
                    is_active=True,
                    offer_id=None,
                    store_code=imported.store_code,
                    external_offer_id=imported.external_id,
                    seller_name=imported.seller_name or "Marketplace",
                    affiliate_url=imported.affiliate_url,
                    landing_url=imported.landing_url,
                    price=imported.price,
                    original_price=imported.original_price,
                    installment_text=None,
                    shipping_cost=None,
                    is_featured=False,
                    availability="in_stock",
                )
            except Exception:
                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status="extraction_failed",
                        message="Insufficient data to build product payload",
                    )
                )
                counters["extraction_failed"] += 1
                continue

            try:
                created_item = AdminProductService.create_product(db, write_payload)
                catalog_item = CatalogItemRead.model_validate(created_item)
                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status="imported",
                        message="Imported successfully",
                        product_id=catalog_item.product.id,
                        product_slug=catalog_item.product.slug,
                        catalog_item=catalog_item,
                    )
                )
                counters["imported"] += 1
            except Exception as exc:
                mapped_status = "extraction_failed"
                mapped_message = "Failed to persist imported product"

                if isinstance(exc, (ConflictError, IntegrityError)):
                    mapped_status = "duplicate"
                    mapped_message = "Duplicate detected while persisting item"
                elif isinstance(exc, BusinessRuleError):
                    mapped_status = AdminProductImportService._classify_error_status(exc.code)
                    mapped_message = exc.message

                results.append(
                    AdminProductImportBatchItemRead(
                        url=url,
                        resolved_url=resolved_url,
                        status=mapped_status,
                        message=mapped_message,
                    )
                )
                counters[AdminProductImportService._counter_key_for_status(mapped_status)] += 1

        return AdminProductImportBatchRead(
            summary=AdminProductImportBatchSummaryRead(
                total=len(payload.urls),
                imported=counters["imported"],
                duplicates=counters["duplicates"],
                invalid=counters["invalid"],
                extraction_failed=counters["extraction_failed"],
                not_supported=counters["not_supported"],
            ),
            results=results,
        )

    @staticmethod
    def _normalize_input_url(url: str) -> str:
        normalized_url = url.strip()
        parsed = urlparse(normalized_url)

        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise BusinessRuleError(
                "Invalid product URL",
                code="IMPORT_URL_INVALID",
            )

        return normalized_url

    @staticmethod
    def _detect_provider(url: str) -> str:
        parsed = urlparse(url)
        host = parsed.netloc.lower()

        if any(marker in host for marker in AdminProductImportService._MERCADO_LIVRE_HOST_MARKERS):
            return "mercado-livre"

        raise BusinessRuleError(
            "Provider not supported yet. Use a Mercado Livre product URL.",
            code="IMPORT_PROVIDER_NOT_SUPPORTED",
        )

    @staticmethod
    def _fetch_html_with_redirects(url: str) -> tuple[str, str]:
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; LinkShopBot/1.0)",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            },
        )

        try:
            with urlopen(request, timeout=12) as response:
                content = response.read()
                resolved_url = response.geturl()
        except HTTPError as exc:
            raise BusinessRuleError(
                "Provider returned an error while importing product URL",
                code="IMPORT_REDIRECT_FAILED",
                status_code=502,
            ) from exc
        except URLError as exc:
            raise BusinessRuleError(
                "Could not resolve product URL redirects",
                code="IMPORT_REDIRECT_FAILED",
                status_code=502,
            ) from exc

        parsed = urlparse(resolved_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise BusinessRuleError(
                "Redirect destination is invalid",
                code="IMPORT_REDIRECT_INVALID_DESTINATION",
                status_code=400,
            )

        return content.decode("utf-8", errors="ignore"), resolved_url

    @staticmethod
    def _resolve_url_for_diagnostics(url: str) -> str | None:
        try:
            normalized_url = AdminProductImportService._normalize_input_url(url)
            _, resolved_url = AdminProductImportService._fetch_html_with_redirects(normalized_url)
            return resolved_url
        except Exception:
            return None

    @staticmethod
    def _resolve_mercado_livre_social_destination(*, resolved_url: str, html: str) -> tuple[str, str]:
        if not AdminProductImportService._is_mercado_livre_social_page(resolved_url):
            return html, resolved_url

        candidates = AdminProductImportService._extract_mercado_livre_product_candidates(
            source_url=resolved_url,
            html=html,
        )

        for candidate in candidates:
            if not AdminProductImportService._url_matches_mercado_livre_host(candidate):
                continue

            try:
                candidate_html, candidate_resolved_url = AdminProductImportService._fetch_html_with_redirects(candidate)
            except BusinessRuleError:
                continue
            except Exception:
                continue

            snapshots = AdminProductImportService._extract_structured_state_snapshots(candidate_html)
            if AdminProductImportService._looks_like_mercado_livre_product_page(
                candidate_resolved_url,
                candidate_html,
                snapshots,
            ):
                return candidate_html, candidate_resolved_url

        raise BusinessRuleError(
            "redirect_resolved_non_product_page:social_without_product_url",
            code="IMPORT_REDIRECT_RESOLVED_NON_PRODUCT_PAGE",
            status_code=400,
        )

    @staticmethod
    def _is_mercado_livre_social_page(url: str) -> bool:
        parsed = urlparse(url)
        return AdminProductImportService._url_matches_mercado_livre_host(url) and parsed.path.lower().startswith("/social/")

    @staticmethod
    def _extract_mercado_livre_product_candidates(*, source_url: str, html: str) -> list[str]:
        candidates: list[str] = []

        parsed_source = urlparse(source_url)
        query_params = parse_qs(parsed_source.query)
        for key in ("url", "target", "redirect", "redirect_url", "destination", "dest", "to", "u", "href"):
            for value in query_params.get(key, []):
                normalized = AdminProductImportService._normalize_candidate_url(value, source_url)
                if normalized:
                    candidates.append(normalized)

        meta = AdminProductImportService._extract_meta_tags(html)
        canonical_url = AdminProductImportService._extract_canonical_url(html, meta)
        for value in (canonical_url, meta.get("og:url"), meta.get("twitter:url")):
            normalized = AdminProductImportService._normalize_candidate_url(value, source_url)
            if normalized:
                candidates.append(normalized)

        for match in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\']', html, flags=re.IGNORECASE):
            normalized = AdminProductImportService._normalize_candidate_url(match.group(1), source_url)
            if normalized:
                candidates.append(normalized)

        for match in re.finditer(r'https?://[^"\s\'<>]+', html, flags=re.IGNORECASE):
            normalized = AdminProductImportService._normalize_candidate_url(match.group(0), source_url)
            if normalized:
                candidates.append(normalized)

        for match in re.finditer(r'https?:\\?/\\?/[^"\s\'<>]+', html, flags=re.IGNORECASE):
            normalized = AdminProductImportService._normalize_candidate_url(match.group(0), source_url)
            if normalized:
                candidates.append(normalized)

        deduplicated: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            if candidate in seen:
                continue
            seen.add(candidate)
            if (
                AdminProductImportService._url_matches_mercado_livre_host(candidate)
                and AdminProductImportService._looks_like_mercado_livre_product_path(candidate)
            ):
                deduplicated.append(candidate)

        return deduplicated

    @staticmethod
    def _normalize_candidate_url(value: str | None, base_url: str) -> str | None:
        if not value:
            return None

        cleaned = unescape(unquote(value.strip()))
        if not cleaned:
            return None

        cleaned = cleaned.replace("\\/", "/")

        if cleaned.startswith("//"):
            cleaned = f"https:{cleaned}"
        elif cleaned.startswith("/"):
            cleaned = urljoin(base_url, cleaned)
        elif not cleaned.startswith(("http://", "https://")):
            return None

        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None

        return cleaned

    @staticmethod
    def _import_mercado_livre(*, source_url: str, resolved_url: str, html: str) -> AdminProductImportRead:
        if AdminProductImportService._looks_like_blocked_or_challenge_page(html):
            raise BusinessRuleError(
                "blocked_or_challenge_page",
                code="IMPORT_BLOCKED_OR_CHALLENGE_PAGE",
                status_code=502,
            )

        snapshots = AdminProductImportService._extract_structured_state_snapshots(html)
        if not AdminProductImportService._looks_like_mercado_livre_product_page(resolved_url, html, snapshots):
            raise BusinessRuleError(
                "redirect_resolved_non_product_page",
                code="IMPORT_REDIRECT_RESOLVED_NON_PRODUCT_PAGE",
                status_code=400,
            )

        meta = AdminProductImportService._extract_meta_tags(html)
        product_json = AdminProductImportService._extract_product_json_ld(html)

        external_id = AdminProductImportService._extract_external_id(resolved_url, html)
        name = AdminProductImportService._extract_name(product_json, meta)
        description = AdminProductImportService._extract_description(product_json, meta)
        thumbnail_url = AdminProductImportService._extract_thumbnail_url(product_json, meta)
        if not thumbnail_url:
            thumbnail_url = AdminProductImportService._extract_thumbnail_url_from_snapshots(snapshots)
        if not thumbnail_url:
            thumbnail_url = AdminProductImportService._extract_thumbnail_url_from_html(html)
        brand = AdminProductImportService._extract_brand(product_json)
        category = AdminProductImportService._extract_category(product_json)
        seller_name = AdminProductImportService._extract_seller_name(product_json)
        price = AdminProductImportService._extract_price(product_json, meta)
        if price is None:
            price = AdminProductImportService._extract_price_from_snapshots(snapshots)
        if price is None:
            price = AdminProductImportService._extract_price_from_html(html)
        original_price = AdminProductImportService._extract_original_price(product_json, price)

        if not name:
            raise BusinessRuleError(
                "Could not extract enough product data from destination URL",
                code="IMPORT_PARSE_FAILED",
            )

        return AdminProductImportRead(
            provider="mercado-livre",
            source_url=source_url,
            resolved_url=resolved_url,
            store_code="mercado-livre",
            external_id=external_id,
            name=name,
            slug=_slugify(name),
            brand=brand or "Sem marca",
            category=category or "Marketplace",
            description=description or "Produto importado via link de afiliado.",
            thumbnail_url=thumbnail_url,
            seller_name=seller_name or "Mercado Livre",
            affiliate_url=source_url,
            landing_url=resolved_url,
            price=price,
            original_price=original_price,
        )

    @staticmethod
    def _extract_meta_tags(html: str) -> dict[str, str]:
        tags: dict[str, str] = {}
        meta_pattern = re.compile(r"<meta\s+[^>]*>", flags=re.IGNORECASE)
        attr_pattern = re.compile(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["\'](.*?)["\']')

        for tag in meta_pattern.findall(html):
            attrs = {key.lower(): unescape(value.strip()) for key, value in attr_pattern.findall(tag)}
            key = attrs.get("property") or attrs.get("name")
            value = attrs.get("content")

            if key and value and key not in tags:
                tags[key.lower()] = value

        return tags

    @staticmethod
    def _extract_product_json_ld(html: str) -> dict:
        script_pattern = re.compile(
            r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
            flags=re.IGNORECASE | re.DOTALL,
        )

        for raw_content in script_pattern.findall(html):
            content = raw_content.strip()
            if not content:
                continue

            try:
                parsed = json.loads(unescape(content))
            except json.JSONDecodeError:
                continue

            for node in AdminProductImportService._iter_json_nodes(parsed):
                node_type = node.get("@type")

                if AdminProductImportService._has_product_type(node_type):
                    return node

        return {}

    @staticmethod
    def _iter_json_nodes(value: object):
        if isinstance(value, dict):
            yield value
            for nested in value.values():
                yield from AdminProductImportService._iter_json_nodes(nested)
            return

        if isinstance(value, list):
            for item in value:
                yield from AdminProductImportService._iter_json_nodes(item)

    @staticmethod
    def _has_product_type(value: object) -> bool:
        if isinstance(value, str):
            return value.lower() == "product"

        if isinstance(value, list):
            return any(isinstance(item, str) and item.lower() == "product" for item in value)

        return False

    @staticmethod
    def _extract_external_id(url: str, html: str) -> str | None:
        url_match = re.search(r"(MLB[-]?\d+)", url, flags=re.IGNORECASE)
        if url_match:
            raw = url_match.group(1).upper().replace("MLB", "MLB-")
            return raw if raw.startswith("MLB-") else f"MLB-{raw[3:]}"

        html_match = re.search(r"(MLB[-]?\d+)", html, flags=re.IGNORECASE)
        if html_match:
            raw = html_match.group(1).upper().replace("MLB", "MLB-")
            return raw if raw.startswith("MLB-") else f"MLB-{raw[3:]}"

        return None

    @staticmethod
    def _extract_name(product_json: dict, meta: dict[str, str]) -> str | None:
        candidate = product_json.get("name")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

        for key in ("og:title", "twitter:title", "title"):
            value = meta.get(key)
            if value:
                return value.strip()

        return None

    @staticmethod
    def _extract_description(product_json: dict, meta: dict[str, str]) -> str | None:
        candidate = product_json.get("description")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

        for key in ("og:description", "description", "twitter:description"):
            value = meta.get(key)
            if value:
                return value.strip()

        return None

    @staticmethod
    def _extract_thumbnail_url(product_json: dict, meta: dict[str, str]) -> str | None:
        image = product_json.get("image")

        if isinstance(image, str) and image.strip():
            return image.strip()

        if isinstance(image, list):
            for entry in image:
                if isinstance(entry, str) and entry.strip():
                    return entry.strip()

        for key in ("og:image", "twitter:image"):
            value = meta.get(key)
            if value:
                return value.strip()

        return None

    @staticmethod
    def _extract_brand(product_json: dict) -> str | None:
        brand = product_json.get("brand")

        if isinstance(brand, str) and brand.strip():
            return brand.strip()

        if isinstance(brand, dict):
            name = brand.get("name")
            if isinstance(name, str) and name.strip():
                return name.strip()

        return None

    @staticmethod
    def _extract_category(product_json: dict) -> str | None:
        category = product_json.get("category")
        if isinstance(category, str) and category.strip():
            return category.strip()

        return None

    @staticmethod
    def _extract_seller_name(product_json: dict) -> str | None:
        offers = product_json.get("offers")

        if isinstance(offers, list):
            offers = offers[0] if offers else None

        if isinstance(offers, dict):
            seller = offers.get("seller")
            if isinstance(seller, dict):
                seller_name = seller.get("name")
                if isinstance(seller_name, str) and seller_name.strip():
                    return seller_name.strip()

        return None

    @staticmethod
    def _extract_price(product_json: dict, meta: dict[str, str]) -> Decimal | None:
        offers = product_json.get("offers")

        if isinstance(offers, list):
            offers = offers[0] if offers else None

        if isinstance(offers, dict):
            for key in ("price", "lowPrice"):
                price = AdminProductImportService._to_decimal(offers.get(key))
                if price is not None:
                    return price

        for key in ("product:price:amount", "og:price:amount"):
            price = AdminProductImportService._to_decimal(meta.get(key))
            if price is not None:
                return price

        return None

    @staticmethod
    def _extract_original_price(product_json: dict, price: Decimal | None) -> Decimal | None:
        offers = product_json.get("offers")

        if isinstance(offers, list):
            offers = offers[0] if offers else None

        if isinstance(offers, dict):
            candidate = AdminProductImportService._to_decimal(offers.get("highPrice"))
            if candidate is not None and (price is None or candidate >= price):
                return candidate

        return None

    @staticmethod
    def _to_decimal(value: object) -> Decimal | None:
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

    @staticmethod
    def _extract_structured_state_snapshots(html: str) -> list[object]:
        snapshots: list[object] = []

        next_data = AdminProductImportService._extract_script_json_by_id(html, "__NEXT_DATA__")
        if next_data is not None:
            snapshots.append(next_data)

        for token in (
            "window.__PRELOADED_STATE__",
            "__PRELOADED_STATE__",
            "window.__INITIAL_STATE__",
            "__INITIAL_STATE__",
        ):
            parsed = AdminProductImportService._extract_json_object_after_token(html, token)
            if parsed is not None:
                snapshots.append(parsed)

        return snapshots

    @staticmethod
    def _extract_script_json_by_id(html: str, script_id: str) -> object | None:
        pattern = re.compile(
            rf"<script[^>]*id=[\"']{re.escape(script_id)}[\"'][^>]*>(.*?)</script>",
            flags=re.IGNORECASE | re.DOTALL,
        )
        match = pattern.search(html)
        if not match:
            return None

        content = match.group(1).strip()
        if not content:
            return None

        try:
            return json.loads(unescape(content))
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _extract_json_object_after_token(html: str, token: str) -> dict | None:
        token_index = html.find(token)
        if token_index < 0:
            return None

        start_index = html.find("{", token_index)
        if start_index < 0:
            return None

        object_source = AdminProductImportService._extract_balanced_braces(html, start_index)
        if not object_source:
            return None

        try:
            parsed = json.loads(unescape(object_source))
        except json.JSONDecodeError:
            return None

        return parsed if isinstance(parsed, dict) else None

    @staticmethod
    def _extract_balanced_braces(text: str, start_index: int) -> str | None:
        depth = 0
        in_string = False
        quote_char = ""
        escaping = False

        for index in range(start_index, len(text)):
            char = text[index]

            if in_string:
                if escaping:
                    escaping = False
                    continue
                if char == "\\":
                    escaping = True
                    continue
                if char == quote_char:
                    in_string = False
                continue

            if char in {"\"", "'"}:
                in_string = True
                quote_char = char
                continue

            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start_index : index + 1]

        return None

    @staticmethod
    def _looks_like_blocked_or_challenge_page(html: str) -> bool:
        sample = html.lower()
        markers = (
            "captcha",
            "cf-challenge",
            "cloudflare",
            "are you human",
            "acesso suspeito",
            "verifique se voce e humano",
            "verify you are human",
            "perimeterx",
            "px-captcha",
            "robot check",
        )
        return any(marker in sample for marker in markers)

    @staticmethod
    def _looks_like_mercado_livre_product_page(resolved_url: str, html: str, snapshots: list[object]) -> bool:
        if not AdminProductImportService._url_matches_mercado_livre_host(resolved_url):
            return False

        if re.search(r"MLB[-_]?\d+", resolved_url, flags=re.IGNORECASE):
            return True

        if re.search(r'"(?:id|item_id|itemId)"\s*:\s*"MLB[-_]?\d+"', html, flags=re.IGNORECASE):
            return True

        for snapshot in snapshots:
            for node in AdminProductImportService._iter_json_nodes(snapshot):
                if not isinstance(node, dict):
                    continue
                for key in ("id", "item_id", "itemId"):
                    value = node.get(key)
                    if isinstance(value, str) and re.search(r"MLB[-_]?\d+", value, flags=re.IGNORECASE):
                        return True

        meta = AdminProductImportService._extract_meta_tags(html)
        canonical_url = AdminProductImportService._extract_canonical_url(html, meta)
        og_url = meta.get("og:url")

        path_signal = any(
            AdminProductImportService._looks_like_mercado_livre_product_path(candidate_url)
            for candidate_url in (resolved_url, canonical_url, og_url)
            if candidate_url
        )
        canonical_host_signal = any(
            AdminProductImportService._url_matches_mercado_livre_host(candidate_url)
            for candidate_url in (canonical_url, og_url)
            if candidate_url
        )
        og_type_product_signal = meta.get("og:type", "").strip().lower() == "product"
        name_signal = bool(meta.get("og:title") or meta.get("twitter:title") or meta.get("title"))
        price_signal = (
            AdminProductImportService._extract_price({}, meta) is not None
            or AdminProductImportService._extract_price_from_snapshots(snapshots) is not None
            or AdminProductImportService._extract_price_from_html(html) is not None
        )
        thumbnail_signal = bool(
            AdminProductImportService._extract_thumbnail_url({}, meta)
            or AdminProductImportService._extract_thumbnail_url_from_snapshots(snapshots)
            or AdminProductImportService._extract_thumbnail_url_from_html(html)
        )

        if og_type_product_signal and (price_signal or thumbnail_signal):
            return True

        if path_signal and price_signal and thumbnail_signal:
            return True

        if canonical_host_signal and name_signal and price_signal and thumbnail_signal:
            return True

        return False

    @staticmethod
    def _url_matches_mercado_livre_host(url: str) -> bool:
        host = urlparse(url).netloc.lower()
        return any(marker in host for marker in AdminProductImportService._MERCADO_LIVRE_HOST_MARKERS)

    @staticmethod
    def _looks_like_mercado_livre_product_path(url: str) -> bool:
        parsed = urlparse(url)
        path = parsed.path.lower()
        return bool(re.search(r"/(mlb[-_]?\d+|p/|item/|produto/)", path, flags=re.IGNORECASE))

    @staticmethod
    def _extract_canonical_url(html: str, meta: dict[str, str]) -> str | None:
        for key in ("og:url", "twitter:url"):
            value = meta.get(key)
            if value and value.strip():
                return value.strip()

        canonical_match = re.search(
            r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']',
            html,
            flags=re.IGNORECASE,
        )
        if canonical_match:
            return unescape(canonical_match.group(1).strip())

        return None

    @staticmethod
    def _extract_price_from_snapshots(snapshots: list[object]) -> Decimal | None:
        candidate_keys = ("price", "sale_price", "current_price", "price_to_show", "raw_price")

        for snapshot in snapshots:
            for node in AdminProductImportService._iter_json_nodes(snapshot):
                if not isinstance(node, dict):
                    continue

                for key in candidate_keys:
                    value = node.get(key)
                    price = AdminProductImportService._to_decimal(value)
                    if price is not None and price > 0:
                        return price

                nested_price = node.get("price")
                if isinstance(nested_price, dict):
                    for nested_key in ("amount", "value", "current_price", "sale_price"):
                        price = AdminProductImportService._to_decimal(nested_price.get(nested_key))
                        if price is not None and price > 0:
                            return price

                if any(key in node for key in ("currency", "currency_id", "currencyId")):
                    price = AdminProductImportService._to_decimal(node.get("amount"))
                    if price is not None and price > 0:
                        return price

        return None

    @staticmethod
    def _extract_price_from_html(html: str) -> Decimal | None:
        patterns = (
            r'"price"\s*:\s*"?([0-9][0-9.,]{0,20})"?',
            r'"current_price"\s*:\s*"?([0-9][0-9.,]{0,20})"?',
            r'"sale_price"\s*:\s*"?([0-9][0-9.,]{0,20})"?',
            r'"amount"\s*:\s*"?([0-9][0-9.,]{0,20})"?',
        )

        for pattern in patterns:
            for match in re.finditer(pattern, html, flags=re.IGNORECASE):
                price = AdminProductImportService._to_decimal(match.group(1))
                if price is not None and price > 0:
                    return price

        return None

    @staticmethod
    def _extract_thumbnail_url_from_snapshots(snapshots: list[object]) -> str | None:
        image_keys = (
            "thumbnail",
            "secure_thumbnail",
            "thumbnail_url",
            "picture",
            "picture_url",
            "image",
            "image_url",
            "secure_url",
            "url",
        )

        for snapshot in snapshots:
            for node in AdminProductImportService._iter_json_nodes(snapshot):
                if not isinstance(node, dict):
                    continue

                for key in image_keys:
                    candidate = node.get(key)
                    image_url = AdminProductImportService._extract_image_url_from_value(candidate)
                    if image_url:
                        return image_url

        return None

    @staticmethod
    def _extract_thumbnail_url_from_html(html: str) -> str | None:
        patterns = (
            r'https?://[^"\'\s>]*mlstatic[^"\'\s>]*\.(?:jpg|jpeg|png|webp)(?:\?[^"\'\s>]*)?',
            r'https?://[^"\'\s>]*mlstatic[^"\'\s>]*',
        )

        for pattern in patterns:
            match = re.search(pattern, html, flags=re.IGNORECASE)
            if match:
                candidate = match.group(0)
                if AdminProductImportService._is_valid_image_url(candidate):
                    return candidate

        return None

    @staticmethod
    def _extract_image_url_from_value(value: object) -> str | None:
        if isinstance(value, str):
            candidate = value.strip()
            if AdminProductImportService._is_valid_image_url(candidate):
                return candidate
            return None

        if isinstance(value, list):
            for item in value:
                resolved = AdminProductImportService._extract_image_url_from_value(item)
                if resolved:
                    return resolved
            return None

        if isinstance(value, dict):
            for key in ("secure_url", "url", "src", "source", "original"):
                resolved = AdminProductImportService._extract_image_url_from_value(value.get(key))
                if resolved:
                    return resolved

        return None

    @staticmethod
    def _is_valid_image_url(url: str) -> bool:
        lowered = url.lower()
        if not lowered.startswith(("http://", "https://")):
            return False

        if "mlstatic" in lowered:
            return True

        return bool(re.search(r"\.(jpg|jpeg|png|webp)(?:$|\?)", lowered))

    @staticmethod
    def _collect_missing_required_fields(imported: AdminProductImportRead) -> list[str]:
        missing_fields: list[str] = []

        if imported.price is None or imported.price <= 0:
            missing_fields.append("price")

        if not imported.thumbnail_url or not imported.thumbnail_url.strip():
            missing_fields.append("thumbnail_url")

        return missing_fields

    @staticmethod
    def _classify_error_status(error_code: str | None) -> str:
        if error_code == "IMPORT_PROVIDER_NOT_SUPPORTED":
            return "not_supported"

        if error_code in {
            "IMPORT_URL_INVALID",
            "IMPORT_REDIRECT_INVALID_DESTINATION",
            "IMPORT_REDIRECT_FAILED",
            "IMPORT_REDIRECT_RESOLVED_NON_PRODUCT_PAGE",
        }:
            return "invalid"

        if error_code in {"IMPORT_PARSE_FAILED", "IMPORT_FETCH_FAILED", "IMPORT_BLOCKED_OR_CHALLENGE_PAGE"}:
            return "extraction_failed"

        return "invalid"

    @staticmethod
    def _classify_residual_import_failure(resolved_url: str | None) -> tuple[str, str]:
        if resolved_url and AdminProductImportService._is_mercado_livre_social_page(resolved_url):
            return "invalid", "redirect_resolved_non_product_page:social_without_product_url"

        return "extraction_failed", "Unexpected import failure for URL"

    @staticmethod
    def _counter_key_for_status(status: str) -> str:
        if status == "imported":
            return "imported"
        if status == "duplicate":
            return "duplicates"
        if status == "not_supported":
            return "not_supported"
        if status == "extraction_failed":
            return "extraction_failed"
        return "invalid"

    @staticmethod
    def _find_duplicate(db: Session, imported: AdminProductImportRead) -> dict[str, str] | None:
        if imported.external_id:
            existing_offer = db.scalar(
                select(Offer)
                .join(Store, Offer.store_id == Store.id)
                .where(Store.code == imported.store_code, Offer.external_offer_id == imported.external_id)
                .options(selectinload(Offer.product))
            )
            if existing_offer and existing_offer.product:
                return {
                    "message": "Duplicate by external offer id",
                    "product_id": existing_offer.product.id,
                    "product_slug": existing_offer.product.slug,
                }

        existing_by_landing = db.scalar(
            select(Offer)
            .where(Offer.landing_url == imported.landing_url)
            .options(selectinload(Offer.product))
        )
        if existing_by_landing and existing_by_landing.product:
            return {
                "message": "Duplicate by landing URL",
                "product_id": existing_by_landing.product.id,
                "product_slug": existing_by_landing.product.slug,
            }

        existing_by_affiliate = db.scalar(
            select(Offer)
            .where(Offer.affiliate_url == imported.affiliate_url)
            .options(selectinload(Offer.product))
        )
        if existing_by_affiliate and existing_by_affiliate.product:
            return {
                "message": "Duplicate by affiliate URL",
                "product_id": existing_by_affiliate.product.id,
                "product_slug": existing_by_affiliate.product.slug,
            }

        if imported.slug:
            existing_product = db.scalar(select(Product).where(Product.slug == imported.slug))
            if existing_product:
                return {
                    "message": "Duplicate by product slug",
                    "product_id": existing_product.id,
                    "product_slug": existing_product.slug,
                }

        return None
