import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_optional_current_user
from app.db.session import get_db
from app.models.user import User
from app.core.observability import observability_registry
from app.services.affiliate_link_resolver_service import AffiliateLinkResolverService
from app.services.click_event_service import ClickEventService
from app.services.mercado_livre_availability_service import (
    MercadoLivreAvailabilityService,
    extract_catalog_product_id,
)


router = APIRouter()
logger = logging.getLogger("linkshop.redirect")


def _redirect_to_offer_impl(
    offer_id: str,
    request: Request,
    source: str | None = Query(default=None),
    position: int | None = Query(default=None, ge=1),
    category: str | None = Query(default=None),
    search_term: str | None = Query(default=None),
    section_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_current_user),
) -> RedirectResponse:
    observability_registry.record_flow_request("redirect.tracking")
    request_id = getattr(request.state, "request_id", None)
    offer = ClickEventService.get_active_offer(db, offer_id)

    if not offer:
        observability_registry.record_flow_failure(
            "redirect.tracking",
            message="Offer not found for redirect",
            code="OFFER_NOT_FOUND",
            request_id=request_id,
            context={"offer_id": offer_id},
        )
        logger.warning("event=redirect.failure offer_id=%s reason=offer_not_found", offer_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Offer not found",
        )

    resolved_source = ClickEventService.resolve_source(
        source=source,
        referrer=request.headers.get("referer"),
    )

    ClickEventService.register_click(
        db,
        offer=offer,
        user=user,
        source=resolved_source,
        position=position,
        category=category,
        search_term=search_term,
        section_type=section_type,
        referrer=request.headers.get("referer"),
        user_agent=request.headers.get("user-agent"),
    )

    original_url = offer.product_url or offer.landing_url or offer.affiliate_url
    if offer.marketplace == "mercado-livre":
        catalog_url = offer.landing_url or offer.product_url or ""
        catalog_product_id = extract_catalog_product_id(catalog_url)
        if catalog_product_id:
            availability = MercadoLivreAvailabilityService.check(catalog_product_id, access_token=None)
            if availability.get("status") == "unavailable":
                logger.warning(
                    "event=redirect.blocked offer_id=%s product_id=%s reason=ml_product_unavailable",
                    offer.id,
                    catalog_product_id,
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Este produto está indisponível no Mercado Livre.",
                )

    target_url = AffiliateLinkResolverService.resolve_url(
        db,
        marketplace=offer.marketplace or getattr(offer.store, "code", None),
        external_id=offer.external_offer_id,
        original_url=original_url,
    )

    observability_registry.record_flow_success("redirect.tracking")
    observability_registry.record_flow_metric("redirect.tracking", "clicks_registered", 1)
    redirect_host = urlparse(target_url).netloc or "unknown"
    logger.info(
        "event=redirect.success offer_id=%s product_id=%s store_id=%s user_id=%s source=%s position=%s category=%s search_term=%s section_type=%s redirect_host=%s",
        offer.id,
        offer.product_id,
        offer.store_id,
        user.id if user else "anonymous",
        resolved_source,
        position,
        category,
        search_term,
        section_type,
        redirect_host,
    )
    return RedirectResponse(url=target_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/{offer_id}")
def redirect_to_offer(
    offer_id: str,
    request: Request,
    source: str | None = Query(default=None),
    position: int | None = Query(default=None, ge=1),
    category: str | None = Query(default=None),
    search_term: str | None = Query(default=None),
    section_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_current_user),
) -> RedirectResponse:
    return _redirect_to_offer_impl(
        offer_id=offer_id,
        request=request,
        source=source,
        position=position,
        category=category,
        search_term=search_term,
        section_type=section_type,
        db=db,
        user=user,
    )


@router.get("/offer/{offer_id}")
def redirect_to_offer_alias(
    offer_id: str,
    request: Request,
    source: str | None = Query(default=None),
    position: int | None = Query(default=None, ge=1),
    category: str | None = Query(default=None),
    search_term: str | None = Query(default=None),
    section_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_current_user),
) -> RedirectResponse:
    return _redirect_to_offer_impl(
        offer_id=offer_id,
        request=request,
        source=source,
        position=position,
        category=category,
        search_term=search_term,
        section_type=section_type,
        db=db,
        user=user,
    )
