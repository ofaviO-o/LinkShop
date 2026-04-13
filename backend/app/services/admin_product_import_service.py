import json
import re
from decimal import Decimal, InvalidOperation
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.core.exceptions import BusinessRuleError
from app.schemas.admin_product import AdminProductImportRead


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
        normalized_url = url.strip()
        provider = AdminProductImportService._detect_provider(normalized_url)

        if provider != "mercado-livre":
            raise BusinessRuleError(
                "Unsupported provider URL",
                code="IMPORT_PROVIDER_NOT_SUPPORTED",
            )

        return AdminProductImportService._import_mercado_livre(normalized_url)

    @staticmethod
    def _detect_provider(url: str) -> str:
        parsed = urlparse(url)

        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise BusinessRuleError(
                "Invalid product URL",
                code="IMPORT_URL_INVALID",
            )

        host = parsed.netloc.lower()

        if any(marker in host for marker in AdminProductImportService._MERCADO_LIVRE_HOST_MARKERS):
            return "mercado-livre"

        raise BusinessRuleError(
            "Provider not supported yet. Use a Mercado Livre product URL.",
            code="IMPORT_PROVIDER_NOT_SUPPORTED",
        )

    @staticmethod
    def _import_mercado_livre(url: str) -> AdminProductImportRead:
        html = AdminProductImportService._fetch_html(url)
        meta = AdminProductImportService._extract_meta_tags(html)
        product_json = AdminProductImportService._extract_product_json_ld(html)

        external_id = AdminProductImportService._extract_external_id(url, html)
        name = AdminProductImportService._extract_name(product_json, meta)
        description = AdminProductImportService._extract_description(product_json, meta)
        thumbnail_url = AdminProductImportService._extract_thumbnail_url(product_json, meta)
        brand = AdminProductImportService._extract_brand(product_json)
        category = AdminProductImportService._extract_category(product_json)
        seller_name = AdminProductImportService._extract_seller_name(product_json)
        price = AdminProductImportService._extract_price(product_json, meta)
        original_price = AdminProductImportService._extract_original_price(product_json, price)

        if not name:
            raise BusinessRuleError(
                "Could not extract product name from URL",
                code="IMPORT_PARSE_FAILED",
            )

        return AdminProductImportRead(
            provider="mercado-livre",
            source_url=url,
            store_code="mercado-livre",
            external_id=external_id,
            name=name,
            slug=_slugify(name),
            brand=brand or "Sem marca",
            category=category or "Marketplace",
            description=description or "Produto importado via link de afiliado.",
            thumbnail_url=thumbnail_url,
            seller_name=seller_name or "Mercado Livre",
            affiliate_url=url,
            price=price,
            original_price=original_price,
        )

    @staticmethod
    def _fetch_html(url: str) -> str:
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
        except HTTPError as exc:
            raise BusinessRuleError(
                "Provider returned an error while importing product URL",
                code="IMPORT_FETCH_FAILED",
                status_code=502,
            ) from exc
        except URLError as exc:
            raise BusinessRuleError(
                "Could not reach provider URL",
                code="IMPORT_FETCH_FAILED",
                status_code=502,
            ) from exc

        return content.decode("utf-8", errors="ignore")

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
        url_match = re.search(r"/(MLB-\d+)", url, flags=re.IGNORECASE)
        if url_match:
            return url_match.group(1).upper()

        html_match = re.search(r"(MLB[-]?\d+)", html, flags=re.IGNORECASE)
        if html_match:
            return html_match.group(1).upper().replace("MLB", "MLB-") if "-" not in html_match.group(1) else html_match.group(1).upper()

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
