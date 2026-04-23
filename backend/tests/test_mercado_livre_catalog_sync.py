from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.catalog.types import CatalogOfferPayload, CatalogProductPayload
from app.models.offer import Offer
from app.models.product import Product
from app.services.mercado_livre_catalog_sync_service import MercadoLivreCatalogSyncService


class _FakeMercadoLivreProvider:
    provider_name = "mercado-livre-catalog"

    def fetch_product_details(self, *, external_id: str | None = None, product_url: str | None = None) -> CatalogProductPayload:
        reference = external_id or "MLB999999"
        now = datetime.now(timezone.utc)
        return CatalogProductPayload(
            marketplace="mercado-livre",
            external_id=reference,
            title="Galaxy S24 256 GB",
            category_id="MLB1055",
            category_name="Celulares",
            thumbnail_url="https://http2.mlstatic.com/test.jpg",
            canonical_url=f"https://www.mercadolivre.com.br/p/{reference}",
            brand="Samsung",
            condition="new",
            currency_id="BRL",
            description="Produto sincronizado de teste",
            is_active=True,
            last_synced_at=now,
            offers=[
                CatalogOfferPayload(
                    marketplace="mercado-livre",
                    external_id=reference,
                    seller_id="12345",
                    seller_name="Samsung Oficial",
                    title="Galaxy S24 256 GB",
                    price=Decimal("3499.00"),
                    original_price=Decimal("3999.00"),
                    product_url=f"https://www.mercadolivre.com.br/p/{reference}",
                    available_quantity=10,
                    status="active",
                    condition="new",
                    currency_id="BRL",
                    is_active=True,
                    fetched_at=now,
                )
            ],
        )


def test_mercado_livre_catalog_sync_persists_product_and_offer(db_session: Session) -> None:
    previous_provider = MercadoLivreCatalogSyncService.provider
    MercadoLivreCatalogSyncService.provider = _FakeMercadoLivreProvider()
    try:
        result = MercadoLivreCatalogSyncService.sync_product_by_external_id(db_session, external_id="MLB999999")
    finally:
        MercadoLivreCatalogSyncService.provider = previous_provider

    product = db_session.scalar(
        select(Product).where(Product.marketplace == "mercado-livre", Product.external_id == "MLB999999")
    )
    offer = db_session.scalar(select(Offer).where(Offer.external_offer_id == "MLB999999"))

    assert result["provider"] == "mercado-livre-catalog"
    assert result["product_status"] == "created"
    assert product is not None
    assert product.name == "Galaxy S24 256 GB"
    assert product.title == "Galaxy S24 256 GB"
    assert product.category_id == "MLB1055"
    assert product.canonical_url == "https://www.mercadolivre.com.br/p/MLB999999"
    assert offer is not None
    assert offer.marketplace == "mercado-livre"
    assert offer.product_url == "https://www.mercadolivre.com.br/p/MLB999999"
    assert offer.available_quantity == 10
    assert offer.affiliate_url == "https://www.mercadolivre.com.br/p/MLB999999"
