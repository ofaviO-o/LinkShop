from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from urllib.error import HTTPError

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ExternalServiceError, NotFoundError
from app.integrations.catalog.mercado_livre_provider import MercadoLivreCatalogProvider
from app.integrations.catalog.types import (
    CatalogOfferPayload,
    CatalogProductPayload,
    CatalogSearchItem,
    CatalogSearchResult,
)
from app.models.offer import Offer
from app.models.product import Product
from app.services.mercado_livre_catalog_sync_service import MercadoLivreCatalogSyncService
from app.services.admin_product_import_service import AdminProductImportService
from tests.factories import build_user


class _FakeMercadoLivreProvider:
    provider_name = "mercado-livre-catalog"

    def search_products(self, *, query: str, limit: int = 10, access_token: str | None = None) -> CatalogSearchResult:
        _ = access_token
        return CatalogSearchResult(
            provider=self.provider_name,
            query=query,
            items=[
                CatalogSearchItem(
                    marketplace="mercado-livre",
                    external_id="MLB999999",
                    title="Galaxy S24 256 GB",
                    category_id="MLB1055",
                    thumbnail_url="https://http2.mlstatic.com/test.jpg",
                    canonical_url="https://www.mercadolivre.com.br/p/MLB999999",
                    brand="Samsung",
                    condition="new",
                    currency_id="BRL",
                    price=Decimal("3499.00"),
                    original_price=Decimal("3999.00"),
                )
            ],
        )

    def fetch_product_details(
        self,
        *,
        external_id: str | None = None,
        product_url: str | None = None,
        access_token: str | None = None,
    ) -> CatalogProductPayload:
        _ = access_token
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


def test_admin_mercado_livre_search_requires_admin(client: TestClient) -> None:
    response = client.get("/api/admin/catalog/mercado-livre/search?q=iphone&limit=1")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_admin_mercado_livre_search_uses_stable_admin_route(
    client: TestClient,
    db_session: Session,
) -> None:
    db_session.add(
        build_user(
            id="admin-1",
            name="Admin",
            email="admin@linkshop.dev",
            password="123456",
            role="admin",
        )
    )
    db_session.commit()

    login_response = client.post(
        "/api/auth/login",
        json={"email": "admin@linkshop.dev", "password": "123456"},
    )
    token = login_response.json()["access_token"]

    previous_provider = MercadoLivreCatalogSyncService.provider
    MercadoLivreCatalogSyncService.provider = _FakeMercadoLivreProvider()
    try:
        response = client.get(
            "/api/admin/catalog/mercado-livre/search?q=galaxy&limit=1",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        MercadoLivreCatalogSyncService.provider = previous_provider

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "mercado-livre-catalog"
    assert payload["query"] == "galaxy"
    assert payload["items"][0]["external_id"] == "MLB999999"


def test_mercado_livre_provider_http_error_becomes_structured_external_error(
    monkeypatch,
) -> None:
    def raise_http_error(*args, **kwargs):
        raise HTTPError(
            url="https://api.mercadolibre.com/sites/MLB/search",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=BytesIO(b'{"message":"forbidden"}'),
        )

    monkeypatch.setattr("app.integrations.catalog.mercado_livre_provider.urlopen", raise_http_error)

    provider = MercadoLivreCatalogProvider()

    try:
        provider.search_products(query="iphone", limit=1)
    except ExternalServiceError as exc:
        assert exc.code == "MERCADO_LIVRE_HTTP_ERROR"
        assert exc.status_code == 502
        assert "HTTP 403" in exc.message
        assert "/sites/MLB/search" in exc.message
        assert "forbidden" in exc.message
    else:
        raise AssertionError("Expected ExternalServiceError")


def test_resolve_mercado_livre_reference_from_catalog_product_url(monkeypatch) -> None:
    monkeypatch.setattr(
        AdminProductImportService,
        "_fetch_html_with_redirects",
        staticmethod(lambda url: ('<html><body>ok</body></html>', "https://www.mercadolivre.com.br/iphone-13-128-gb-azul/p/MLB18500846")),
    )
    monkeypatch.setattr(
        AdminProductImportService,
        "_resolve_mercado_livre_social_destination",
        staticmethod(lambda *, resolved_url, html: (html, resolved_url)),
    )

    resolved_url, reference_id, reference_type = AdminProductImportService.resolve_mercado_livre_reference(
        "https://www.mercadolivre.com.br/iphone-13-128-gb-azul/p/MLB18500846"
    )

    assert resolved_url.endswith("/p/MLB18500846")
    assert reference_id == "MLB18500846"
    assert reference_type == "product"


def test_mercado_livre_provider_falls_back_to_catalog_product_when_item_lookup_fails(monkeypatch) -> None:
    provider = MercadoLivreCatalogProvider()
    expected_payload = CatalogProductPayload(
        marketplace="mercado-livre",
        external_id="MLB18500846",
        title="iPhone 13 128 GB Azul",
        category_id=None,
        category_name="MLB-CELLPHONES",
        thumbnail_url="https://http2.mlstatic.com/catalog.jpg",
        canonical_url="https://www.mercadolivre.com.br/iphone-13-128-gb-azul/p/MLB18500846",
        brand="Apple",
        condition="new",
        currency_id="BRL",
        description="Descricao de catalogo",
        is_active=True,
        last_synced_at=datetime.now(timezone.utc),
        offers=[
            CatalogOfferPayload(
                marketplace="mercado-livre",
                external_id="MLB111222333",
                seller_id="123",
                seller_name="Loja Oficial",
                title="iPhone 13 128 GB Azul",
                price=Decimal("4299.00"),
                original_price=Decimal("4599.00"),
                product_url="https://www.mercadolivre.com.br/iphone-13-128-gb-azul/p/MLB18500846",
                available_quantity=3,
                status="active",
                condition="new",
                currency_id="BRL",
                is_active=True,
                fetched_at=datetime.now(timezone.utc),
            )
        ],
    )

    monkeypatch.setattr(
        provider,
        "_fetch_item_details",
        lambda *, reference, product_url, access_token: (_ for _ in ()).throw(
            NotFoundError("Mercado Livre item or catalog product was not found", code="MERCADO_LIVRE_ITEM_NOT_FOUND")
        ),
    )
    monkeypatch.setattr(
        provider,
        "_fetch_catalog_product_details",
        lambda *, reference, product_url, access_token: expected_payload,
    )

    payload = provider.fetch_product_details(external_id="MLB18500846", access_token="token")

    assert payload.external_id == "MLB18500846"
    assert payload.offers[0].external_id == "MLB111222333"


def test_mercado_livre_search_uses_catalog_products_endpoint_when_token_exists(monkeypatch) -> None:
    provider = MercadoLivreCatalogProvider()
    requested_paths: list[str] = []

    def fake_get_json(path: str, *, access_token: str | None = None) -> dict:
        assert access_token == "token"
        requested_paths.append(path)

        if path.startswith("/sites/MLB/domain_discovery/search?"):
            return [{"domain_id": "MLB-CELLPHONES", "category_id": "MLB1055"}]

        if path.startswith("/products/search?"):
            return {
                "results": [
                    {
                        "id": "MLB18500846",
                        "name": "iPhone 13 128 GB Azul",
                        "domain_id": "MLB-CELLPHONES",
                        "attributes": [{"id": "BRAND", "name": "Marca", "value_name": "Apple"}],
                        "permalink": "https://www.mercadolivre.com.br/iphone-13-128-gb-azul/p/MLB18500846",
                    }
                ]
            }

        if path.startswith("/sites/MLB/search?"):
            return {
                "results": [
                    {
                        "id": "MLB111222333",
                        "title": "Capa para iPhone 13",
                        "category_id": "MLB1648",
                        "domain_id": "MLB-CELLPHONE_CASES",
                        "thumbnail": "https://http2.mlstatic.com/capa.jpg",
                        "permalink": "https://produto.mercadolivre.com.br/MLB111222333-capa",
                        "currency_id": "BRL",
                        "price": 49.9,
                    }
                ]
            }

        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(provider, "_get_json", fake_get_json)

    result = provider.search_products(query="iphone 13", limit=5, access_token="token")

    assert any(path.startswith("/products/search?") for path in requested_paths)
    assert any(path.startswith("/sites/MLB/search?") for path in requested_paths)
    assert result.items[0].external_id == "MLB18500846"
    assert result.items[0].title == "iPhone 13 128 GB Azul"


def test_mercado_livre_search_caps_upstream_fetch_limit_for_large_preview_requests(monkeypatch) -> None:
    provider = MercadoLivreCatalogProvider()
    requested_paths: list[str] = []

    def fake_get_json(path: str, *, access_token: str | None = None) -> dict:
        assert access_token == "token"
        requested_paths.append(path)

        if path.startswith("/sites/MLB/domain_discovery/search?"):
            return [{"domain_id": "MLB-CELLPHONES", "category_id": "MLB1055"}]

        if path.startswith("/products/search?"):
            return {"results": []}

        if path.startswith("/sites/MLB/search?"):
            raise ExternalServiceError(
                "Mercado Livre API rejected catalog request with HTTP 403 on /sites/MLB/search. Mercado Livre response: forbidden",
                code="MERCADO_LIVRE_HTTP_ERROR",
                status_code=502,
            )

        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(provider, "_get_json", fake_get_json)

    provider.search_products(query="iphone 13", limit=48, access_token="token")

    product_search_path = next(path for path in requested_paths if path.startswith("/products/search?"))
    assert "limit=50" in product_search_path


def test_mercado_livre_search_uses_catalog_results_when_marketplace_search_is_forbidden(monkeypatch) -> None:
    provider = MercadoLivreCatalogProvider()

    def fake_get_json(path: str, *, access_token: str | None = None) -> dict:
        assert access_token == "token"

        if path.startswith("/sites/MLB/domain_discovery/search?"):
            return [{"domain_id": "MLB-CELLPHONES", "category_id": "MLB1055"}]

        if path.startswith("/products/search?"):
            return {
                "results": [
                    {
                        "id": "MLB18500846",
                        "name": "iPhone 13 128 GB Azul",
                        "domain_id": "MLB-CELLPHONES",
                        "attributes": [{"id": "BRAND", "name": "Marca", "value_name": "Apple"}],
                        "permalink": "https://www.mercadolivre.com.br/iphone-13-128-gb-azul/p/MLB18500846",
                        "buy_box_winner": {"price": 4299.0, "currency_id": "BRL"},
                    }
                ]
            }

        if path.startswith("/sites/MLB/search?"):
            raise ExternalServiceError(
                "Mercado Livre API rejected catalog request with HTTP 403 on /sites/MLB/search. Mercado Livre response: forbidden",
                code="MERCADO_LIVRE_HTTP_ERROR",
                status_code=502,
            )

        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(provider, "_get_json", fake_get_json)

    result = provider.search_products(query="iphone 13", limit=5, access_token="token")

    assert len(result.items) == 1
    assert result.items[0].external_id == "MLB18500846"
    assert result.items[0].title == "iPhone 13 128 GB Azul"


def test_mercado_livre_search_penalizes_accessories_when_query_targets_main_product(monkeypatch) -> None:
    provider = MercadoLivreCatalogProvider()

    def fake_get_json(path: str, *, access_token: str | None = None) -> dict:
        _ = access_token

        if path.startswith("/sites/MLB/domain_discovery/search?"):
            return [{"domain_id": "MLB-AIR_CONDITIONERS", "category_id": "MLB1234"}]

        if path.startswith("/sites/MLB/search?"):
            return {
                "results": [
                    {
                        "id": "MLB1",
                        "title": "Ar Condicionado Split Inverter 12000 BTUs",
                        "category_id": "MLB1234",
                        "domain_id": "MLB-AIR_CONDITIONERS",
                        "permalink": "https://produto.mercadolivre.com.br/MLB1-ar-condicionado",
                        "currency_id": "BRL",
                        "price": 1999.0,
                    },
                    {
                        "id": "MLB2",
                        "title": "Ar Condicionado Automotivo para Carro Compacto",
                        "category_id": "MLB9999",
                        "domain_id": "MLB-CAR_AIR_CONDITIONING",
                        "permalink": "https://produto.mercadolivre.com.br/MLB2-ar-condicionado-automotivo",
                        "currency_id": "BRL",
                        "price": 599.0,
                    },
                ]
            }

        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(provider, "_get_json", fake_get_json)

    result = provider.search_products(query="ar condicionado", limit=5, access_token=None)

    assert result.items[0].external_id == "MLB1"
    assert "Automotivo" not in result.items[0].title
