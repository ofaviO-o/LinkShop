from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from tests.factories import build_affiliate_link_cache, build_offer
from app.models.click_event import ClickEvent


def test_redirect_tracks_click_and_redirects(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session: Session,
) -> None:
    response = client.get(
        "/api/redirect/offer-1?source=product-page",
        headers={
            **auth_headers,
            "referer": "http://localhost:3000/ofertas/iphone-15-128gb",
            "user-agent": "pytest",
        },
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["location"] == "https://www.amazon.com.br/"

    events = list(db_session.scalars(select(ClickEvent)).all())
    assert len(events) == 1
    assert events[0].offer_id == "offer-1"
    assert events[0].product_id == "product-1"
    assert events[0].store_id == "store-amazon"
    assert events[0].source == "product-page"


def test_redirect_prefers_cached_affiliate_link_when_available(
    client: TestClient,
    db_session: Session,
) -> None:
    offer = build_offer(
        id="offer-mercado-livre-cache",
        product_id="product-1",
        store_id="store-mercado-livre",
        marketplace="mercado-livre",
        external_offer_id="MLB123456",
        seller_name="Mercado Livre Oficial",
        title="Apple iPhone 15 128GB",
        affiliate_url="https://www.mercadolivre.com.br/item/MLB123456",
        landing_url="https://www.mercadolivre.com.br/item/MLB123456",
        product_url="https://www.mercadolivre.com.br/item/MLB123456",
        price="4299.00",
        original_price="4599.00",
    )
    db_session.add(offer)
    db_session.add(
        build_affiliate_link_cache(
            marketplace="mercado-livre",
            external_id="MLB123456",
            original_url="https://www.mercadolivre.com.br/item/MLB123456",
            affiliate_url="https://meli.la/abc123",
            provider="assisted-manual",
        )
    )
    db_session.commit()

    response = client.get("/api/redirect/offer-mercado-livre-cache?source=product-page", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "https://meli.la/abc123"
