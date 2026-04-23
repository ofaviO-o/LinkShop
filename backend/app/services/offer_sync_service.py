import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.observability import observability_registry
from app.integrations.registry import integration_registry
from app.integrations.types import NormalizedOfferPayload, SyncErrorEntry
from app.models.integration_sync_run import IntegrationSyncRun
from app.models.offer import Offer
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.store import Store


logger = logging.getLogger(__name__)

MAX_SUMMARY_MESSAGES = 10


class OfferSyncService:
    @staticmethod
    def sync_provider(db: Session, provider_name: str) -> dict[str, object]:
        observability_registry.record_flow_request("offers.sync")
        integration = integration_registry.get(provider_name)

        if not integration:
            observability_registry.record_flow_failure(
                "offers.sync",
                message="Provider not found",
                code="SYNC_PROVIDER_NOT_FOUND",
                context={"provider": provider_name},
            )
            raise NotFoundError("Unknown provider", code="SYNC_PROVIDER_NOT_FOUND")

        started_at = datetime.now(timezone.utc)
        summary: dict[str, object] = {
            "provider": provider_name,
            "source_reference": None,
            "status": "success",
            "processed": 0,
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "failed": 0,
            "history_created": 0,
            "warning_count": 0,
            "error_count": 0,
            "warnings": [],
            "errors": [],
            "started_at": started_at,
            "finished_at": started_at,
        }

        logger.info("Starting offer sync for provider '%s'", provider_name)

        try:
            fetch_result = integration.provider.fetch_offers()
            summary["source_reference"] = fetch_result.source_reference
            summary["warning_count"] = len(fetch_result.warnings)
            summary["warnings"] = fetch_result.warnings[:MAX_SUMMARY_MESSAGES]
            if fetch_result.warnings:
                logger.warning(
                    "Offer sync provider returned warnings provider=%s warnings=%s",
                    provider_name,
                    len(fetch_result.warnings),
                )

            for raw_payload in fetch_result.offers:
                summary["processed"] = int(summary["processed"]) + 1

                try:
                    normalized = integration.adapter.normalize(raw_payload)
                    result = OfferSyncService._upsert_offer(db, normalized, started_at)
                    summary[result] = int(summary[result]) + 1

                    if result in {"created", "updated"}:
                        summary["history_created"] = int(summary["history_created"]) + 1
                except (BusinessRuleError, NotFoundError) as exc:
                    OfferSyncService._append_error(
                        summary,
                        SyncErrorEntry(
                            stage="upsert",
                            message=str(exc),
                            external_offer_id=raw_payload.external_offer_id,
                            product_id=raw_payload.product_id,
                            store_code=raw_payload.store_code,
                        ),
                    )
                    logger.warning(
                        "Offer sync skipped invalid payload provider=%s product_id=%s store_code=%s external_offer_id=%s error=%s",
                        provider_name,
                        raw_payload.product_id,
                        raw_payload.store_code,
                        raw_payload.external_offer_id,
                        exc,
                    )
                except Exception as exc:  # pragma: no cover - defensive logging path
                    OfferSyncService._append_error(
                        summary,
                        SyncErrorEntry(
                            stage="unexpected",
                            message="Unexpected sync error",
                            external_offer_id=raw_payload.external_offer_id,
                            product_id=raw_payload.product_id,
                            store_code=raw_payload.store_code,
                        ),
                    )
                    logger.exception(
                        "Unexpected offer sync error provider=%s product_id=%s store_code=%s external_offer_id=%s",
                        provider_name,
                        raw_payload.product_id,
                        raw_payload.store_code,
                        raw_payload.external_offer_id,
                    )

            summary["status"] = OfferSyncService._resolve_status(summary)
            summary["finished_at"] = datetime.now(timezone.utc)
            OfferSyncService._record_sync_run(db, summary)
            db.commit()
            observability_registry.record_flow_metric("offers.sync", "processed", int(summary["processed"]))
            observability_registry.record_flow_metric("offers.sync", "created", int(summary["created"]))
            observability_registry.record_flow_metric("offers.sync", "updated", int(summary["updated"]))
            observability_registry.record_flow_metric("offers.sync", "failed_records", int(summary["failed"]))
            observability_registry.record_flow_metric("offers.sync", "history_created", int(summary["history_created"]))
            observability_registry.record_flow_metric("offers.sync", "warning_count", int(summary["warning_count"]))
            observability_registry.record_flow_metric("offers.sync", "error_count", int(summary["error_count"]))
            if summary["status"] == "success":
                observability_registry.record_flow_success("offers.sync")
            else:
                error_summary = list(summary["errors"])
                observability_registry.record_flow_failure(
                    "offers.sync",
                    message=error_summary[0] if error_summary else "Offer sync finished with errors",
                    code=f"SYNC_{str(summary['status']).upper()}",
                    context={"provider": provider_name, "status": summary["status"]},
                )
            logger.info(
                "Offer sync finished provider=%s status=%s processed=%s created=%s updated=%s unchanged=%s failed=%s",
                provider_name,
                summary["status"],
                summary["processed"],
                summary["created"],
                summary["updated"],
                summary["unchanged"],
                summary["failed"],
            )
            return summary
        except Exception:
            summary["status"] = "failed"
            summary["finished_at"] = datetime.now(timezone.utc)
            OfferSyncService._append_error(
                summary,
                SyncErrorEntry(stage="provider", message="Provider execution failed"),
            )
            OfferSyncService._record_sync_run(db, summary)
            db.commit()
            observability_registry.record_flow_failure(
                "offers.sync",
                message="Provider execution failed",
                code="SYNC_PROVIDER_EXECUTION_FAILED",
                context={"provider": provider_name},
            )
            logger.exception("Offer sync failed before completion provider=%s", provider_name)
            raise

    @staticmethod
    def list_sync_runs(db: Session, page: int = 1, page_size: int = 20) -> dict[str, object]:
        statement = select(IntegrationSyncRun).order_by(desc(IntegrationSyncRun.started_at))
        total = db.scalar(select(func.count(IntegrationSyncRun.id))) or 0
        runs = list(db.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
        return {
            "items": runs,
            "page": page,
            "page_size": page_size,
            "total": total,
        }

    @staticmethod
    def get_latest_sync_run(db: Session) -> IntegrationSyncRun | None:
        return db.scalar(select(IntegrationSyncRun).order_by(desc(IntegrationSyncRun.started_at)).limit(1))

    @staticmethod
    def _append_error(summary: dict[str, object], error_entry: SyncErrorEntry) -> None:
        summary["failed"] = int(summary["failed"]) + 1
        summary["error_count"] = int(summary["error_count"]) + 1
        errors = list(summary["errors"])
        if len(errors) < MAX_SUMMARY_MESSAGES:
            bits = [error_entry.stage, error_entry.message]
            if error_entry.product_id:
                bits.append(f"product={error_entry.product_id}")
            if error_entry.store_code:
                bits.append(f"store={error_entry.store_code}")
            if error_entry.external_offer_id:
                bits.append(f"external_offer={error_entry.external_offer_id}")
            errors.append(" | ".join(bits))
        summary["errors"] = errors

    @staticmethod
    def _resolve_status(summary: dict[str, object]) -> str:
        failed = int(summary["failed"])
        processed = int(summary["processed"])
        if failed == 0:
            return "success"
        if failed < processed:
            return "partial_success"
        return "failed"

    @staticmethod
    def _record_sync_run(db: Session, summary: dict[str, object]) -> None:
        warnings = list(summary["warnings"])
        errors = list(summary["errors"])
        db.add(
            IntegrationSyncRun(
                provider=str(summary["provider"]),
                source_reference=summary["source_reference"],
                status=str(summary["status"]),
                processed=int(summary["processed"]),
                created=int(summary["created"]),
                updated=int(summary["updated"]),
                unchanged=int(summary["unchanged"]),
                failed=int(summary["failed"]),
                history_created=int(summary["history_created"]),
                warning_count=int(summary["warning_count"]),
                error_count=int(summary["error_count"]),
                warning_summary="\n".join(warnings) if warnings else None,
                error_summary="\n".join(errors) if errors else None,
                started_at=summary["started_at"],
                finished_at=summary["finished_at"],
            )
        )

    @staticmethod
    def _upsert_offer(db: Session, payload: NormalizedOfferPayload, synced_at: datetime) -> str:
        store = db.scalar(select(Store).where(Store.code == payload.store_code, Store.is_active.is_(True)))
        product = db.scalar(select(Product).where(Product.id == payload.product_id, Product.is_active.is_(True)))

        if not store:
            raise NotFoundError(f"Store not found for code '{payload.store_code}'", code="STORE_NOT_FOUND")

        if not product:
            raise NotFoundError(f"Product not found for id '{payload.product_id}'", code="PRODUCT_NOT_FOUND")

        if not payload.external_offer_id:
            raise BusinessRuleError("External offer id is required for sync", code="MISSING_EXTERNAL_OFFER_ID")

        offer = db.scalar(
            select(Offer).where(
                Offer.store_id == store.id,
                Offer.external_offer_id == payload.external_offer_id,
            )
        )

        if not offer:
            offer = Offer(
                product_id=product.id,
                store_id=store.id,
                marketplace=store.code,
                external_offer_id=payload.external_offer_id,
                seller_name=payload.seller_name,
                title=payload.title,
                affiliate_url=payload.affiliate_url,
                landing_url=payload.landing_url,
                product_url=payload.landing_url or payload.affiliate_url,
                price=payload.price,
                original_price=payload.original_price,
                currency=payload.currency,
                shipping_cost=payload.shipping_cost,
                installment_text=payload.installment_text,
                availability=payload.availability,
                is_featured=payload.is_featured,
                is_active=payload.is_active,
                fetched_at=synced_at,
                last_synced_at=synced_at,
            )
            db.add(offer)
            db.flush()
            OfferSyncService._append_price_history(db, offer, synced_at)
            return "created"

        if OfferSyncService._has_relevant_change(offer, payload):
            OfferSyncService._apply_payload(offer, payload, synced_at)
            db.flush()
            OfferSyncService._append_price_history(db, offer, synced_at)
            return "updated"

        OfferSyncService._apply_payload(offer, payload, synced_at)
        db.flush()
        return "unchanged"

    @staticmethod
    def _has_relevant_change(offer: Offer, payload: NormalizedOfferPayload) -> bool:
        tracked_fields: tuple[tuple[str, Decimal | str | bool | None], ...] = (
            ("price", payload.price),
            ("original_price", payload.original_price),
            ("shipping_cost", payload.shipping_cost),
            ("availability", payload.availability),
            ("is_active", payload.is_active),
        )
        return any(getattr(offer, field_name) != value for field_name, value in tracked_fields)

    @staticmethod
    def _apply_payload(offer: Offer, payload: NormalizedOfferPayload, synced_at: datetime) -> None:
        offer.marketplace = offer.marketplace or offer.store.code
        offer.seller_name = payload.seller_name
        offer.title = payload.title
        offer.affiliate_url = payload.affiliate_url
        offer.landing_url = payload.landing_url
        offer.product_url = payload.landing_url or payload.affiliate_url
        offer.price = payload.price
        offer.original_price = payload.original_price
        offer.currency = payload.currency
        offer.shipping_cost = payload.shipping_cost
        offer.installment_text = payload.installment_text
        offer.availability = payload.availability
        offer.is_featured = payload.is_featured
        offer.is_active = payload.is_active
        offer.fetched_at = synced_at
        offer.last_synced_at = synced_at

    @staticmethod
    def _append_price_history(db: Session, offer: Offer, captured_at: datetime) -> None:
        db.add(
            PriceHistory(
                offer_id=offer.id,
                product_id=offer.product_id,
                captured_at=captured_at,
                price=offer.price,
                original_price=offer.original_price,
                shipping_cost=offer.shipping_cost,
                availability=offer.availability,
            )
        )
