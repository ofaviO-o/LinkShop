from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin_user
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin_product import AdminProductWriteInput
from app.schemas.product import CatalogItemRead
from app.services.admin_product_service import AdminProductService


router = APIRouter()


@router.post("/products", response_model=CatalogItemRead, status_code=status.HTTP_201_CREATED)
def create_admin_product(
    payload: AdminProductWriteInput,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> CatalogItemRead:
    _ = current_user
    item = AdminProductService.create_product(db, payload)
    return CatalogItemRead.model_validate(item)


@router.patch("/products/{product_id}", response_model=CatalogItemRead)
def update_admin_product(
    product_id: str,
    payload: AdminProductWriteInput,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> CatalogItemRead:
    _ = current_user
    item = AdminProductService.update_product(db, product_id, payload)
    return CatalogItemRead.model_validate(item)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_product(
    product_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Response:
    _ = current_user
    deleted = AdminProductService.delete_product(db, product_id)

    if not deleted:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    return Response(status_code=status.HTTP_204_NO_CONTENT)
