import logging
import re
import time
from datetime import datetime, timezone

logger = logging.getLogger("linkshop.mercado_livre.availability")

_CATALOG_ID_RE = re.compile(r"/p/(MLB\d+)", re.IGNORECASE)


def extract_catalog_product_id(url: str) -> str | None:
    match = _CATALOG_ID_RE.search(url)
    return match.group(1).upper() if match else None


class MercadoLivreAvailabilityService:
    _cache: dict[str, dict] = {}
    _cache_ttl_seconds: int = 600  # 10 minutes

    @classmethod
    def check(cls, product_id: str, *, access_token: str | None) -> dict:
        normalized = product_id.strip().upper()
        cached = cls._cache.get(normalized)
        if cached and (time.monotonic() - cached["_checked_mono"]) < cls._cache_ttl_seconds:
            return {k: v for k, v in cached.items() if not k.startswith("_")}

        result = cls._fetch(normalized, access_token=access_token)
        cls._cache[normalized] = {**result, "_checked_mono": time.monotonic()}
        return result

    @classmethod
    def _fetch(cls, product_id: str, *, access_token: str | None) -> dict:
        from app.integrations.catalog.mercado_livre_provider import MercadoLivreCatalogProvider

        provider = MercadoLivreCatalogProvider()
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            product = provider._get_optional_json(f"/products/{product_id}", access_token=access_token)
        except Exception as exc:
            logger.warning("ML availability check failed product_id=%s reason=%s", product_id, exc)
            return {"product_id": product_id, "status": "unknown", "confidence": "low", "checked_at": checked_at}

        if not isinstance(product, dict):
            return {"product_id": product_id, "status": "unknown", "confidence": "low", "checked_at": checked_at}

        product_status = str(product.get("status") or "").strip().lower()
        if product_status and product_status != "active":
            logger.info("ML availability product_id=%s status=%s decision=unavailable", product_id, product_status)
            return {"product_id": product_id, "status": "unavailable", "confidence": "high", "checked_at": checked_at}

        buy_box = product.get("buy_box_winner")
        if not isinstance(buy_box, dict):
            logger.info("ML availability product_id=%s decision=unavailable reason=no_buy_box", product_id)
            return {"product_id": product_id, "status": "unavailable", "confidence": "high", "checked_at": checked_at}

        item_id = str(buy_box.get("item_id") or "").strip()
        price = buy_box.get("price")
        has_signal = bool(item_id) or (price is not None and float(price) > 0)
        if not has_signal:
            logger.info("ML availability product_id=%s decision=unavailable reason=empty_buy_box", product_id)
            return {"product_id": product_id, "status": "unavailable", "confidence": "high", "checked_at": checked_at}

        logger.info("ML availability product_id=%s decision=available", product_id)
        return {"product_id": product_id, "status": "available", "confidence": "high", "checked_at": checked_at}
