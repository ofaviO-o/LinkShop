from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.catalog_integration import (
    MercadoLivreCatalogPreviewRead,
    MercadoLivreCatalogSearchRead,
    MercadoLivreCatalogSyncRead,
)
from app.services.mercado_livre_availability_service import MercadoLivreAvailabilityService
from app.services.mercado_livre_catalog_sync_service import MercadoLivreCatalogSyncService
from app.services.mercado_livre_oauth_service import MercadoLivreOAuthService


router = APIRouter()


@router.get("/catalog/mercado-livre/search", response_model=MercadoLivreCatalogSearchRead)
def search_mercado_livre_catalog(
    q: str = Query(min_length=1),
    limit: int = Query(default=10, ge=1, le=50),
    page: int = Query(default=1, ge=1),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogSearchRead:
    _ = current_user
    result = MercadoLivreCatalogSyncService.search_products(db, query=q, limit=limit, page=page)
    return MercadoLivreCatalogSearchRead.model_validate(result.model_dump())


@router.get("/catalog/mercado-livre/diagnostics/search")
def diagnose_mercado_livre_catalog_search(
    q: str = Query(default="iphone 16", min_length=1),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _ = current_user
    return MercadoLivreCatalogSyncService.run_search_diagnostics(db, query=q)


@router.get("/catalog/mercado-livre/preview/by-url", response_model=MercadoLivreCatalogPreviewRead)
def preview_mercado_livre_catalog_by_url(
    url: str = Query(min_length=1),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogPreviewRead:
    _ = current_user
    result = MercadoLivreCatalogSyncService.preview_product_by_url(db, product_url=url)
    return MercadoLivreCatalogPreviewRead.model_validate(result)


@router.get("/catalog/mercado-livre/preview/by-external-id", response_model=MercadoLivreCatalogPreviewRead)
def preview_mercado_livre_catalog_by_external_id(
    externalId: str = Query(min_length=1, alias="externalId"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogPreviewRead:
    _ = current_user
    result = MercadoLivreCatalogSyncService.preview_product_by_external_id(db, external_id=externalId)
    return MercadoLivreCatalogPreviewRead.model_validate(result)


@router.post("/catalog/mercado-livre/by-url", response_model=MercadoLivreCatalogSyncRead)
def sync_mercado_livre_catalog_by_url(
    url: str = Query(min_length=1),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogSyncRead:
    _ = current_user
    result = MercadoLivreCatalogSyncService.sync_product_by_url(db, product_url=url)
    return MercadoLivreCatalogSyncRead.model_validate(result)


@router.post("/catalog/mercado-livre/by-external-id", response_model=MercadoLivreCatalogSyncRead)
def sync_mercado_livre_catalog_by_external_id(
    externalId: str = Query(min_length=1, alias="externalId"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> MercadoLivreCatalogSyncRead:
    _ = current_user
    result = MercadoLivreCatalogSyncService.sync_product_by_external_id(db, external_id=externalId)
    return MercadoLivreCatalogSyncRead.model_validate(result)


@router.get("/catalog/mercado-livre/availability/{product_id}")
def check_mercado_livre_availability(
    product_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _ = current_user
    access_token = MercadoLivreOAuthService.resolve_access_token(db)
    return MercadoLivreAvailabilityService.check(product_id, access_token=access_token)
