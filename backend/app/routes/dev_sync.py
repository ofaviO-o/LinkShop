from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError
from app.core.config import settings
from app.db.session import get_db
from app.schemas.catalog_integration import (
    MercadoLivreCatalogPreviewRead,
    MercadoLivreCatalogSearchRead,
    MercadoLivreCatalogSyncRead,
)
from app.schemas.offer_sync import OfferSyncSummary
from app.services.mercado_livre_catalog_sync_service import MercadoLivreCatalogSyncService
from app.services.offer_sync_service import OfferSyncService


router = APIRouter()


@router.post("/sync/offers", response_model=OfferSyncSummary)
def trigger_offer_sync(
    provider: str = Query(default="mock-marketplace"),
    db: Session = Depends(get_db),
) -> OfferSyncSummary:
    if not settings.app_debug:
        raise ForbiddenError("Offer sync trigger is only available in development mode")

    summary = OfferSyncService.sync_provider(db, provider)
    return OfferSyncSummary.model_validate(summary)


@router.get("/catalog/mercado-livre/search", response_model=MercadoLivreCatalogSearchRead)
def search_mercado_livre_catalog(
    q: str = Query(min_length=1),
    limit: int = Query(default=10, ge=1, le=50),
) -> MercadoLivreCatalogSearchRead:
    if not settings.app_debug:
        raise ForbiddenError("Mercado Livre catalog search is only available in development mode")

    result = MercadoLivreCatalogSyncService.search_products(query=q, limit=limit)
    return MercadoLivreCatalogSearchRead.model_validate(result)


@router.get("/catalog/mercado-livre/preview/by-url", response_model=MercadoLivreCatalogPreviewRead)
def preview_mercado_livre_catalog_by_url(url: str = Query(min_length=1)) -> MercadoLivreCatalogPreviewRead:
    if not settings.app_debug:
        raise ForbiddenError("Mercado Livre catalog preview is only available in development mode")

    result = MercadoLivreCatalogSyncService.preview_product_by_url(product_url=url)
    return MercadoLivreCatalogPreviewRead.model_validate(result)


@router.get("/catalog/mercado-livre/preview/by-external-id", response_model=MercadoLivreCatalogPreviewRead)
def preview_mercado_livre_catalog_by_external_id(
    externalId: str = Query(min_length=1, alias="externalId"),
) -> MercadoLivreCatalogPreviewRead:
    if not settings.app_debug:
        raise ForbiddenError("Mercado Livre catalog preview is only available in development mode")

    result = MercadoLivreCatalogSyncService.preview_product_by_external_id(external_id=externalId)
    return MercadoLivreCatalogPreviewRead.model_validate(result)


@router.post("/catalog/mercado-livre/by-url", response_model=MercadoLivreCatalogSyncRead)
def sync_mercado_livre_catalog_by_url(
    url: str = Query(min_length=1),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogSyncRead:
    if not settings.app_debug:
        raise ForbiddenError("Mercado Livre catalog sync is only available in development mode")

    result = MercadoLivreCatalogSyncService.sync_product_by_url(db, product_url=url)
    return MercadoLivreCatalogSyncRead.model_validate(result)


@router.post("/catalog/mercado-livre/by-external-id", response_model=MercadoLivreCatalogSyncRead)
def sync_mercado_livre_catalog_by_external_id(
    externalId: str = Query(min_length=1, alias="externalId"),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogSyncRead:
    if not settings.app_debug:
        raise ForbiddenError("Mercado Livre catalog sync is only available in development mode")

    result = MercadoLivreCatalogSyncService.sync_product_by_external_id(db, external_id=externalId)
    return MercadoLivreCatalogSyncRead.model_validate(result)
