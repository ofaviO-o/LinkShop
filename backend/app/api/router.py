from fastapi import APIRouter

from app.routes.admin_analytics import router as admin_analytics_router
from app.routes.admin_integrations import router as admin_integrations_router
from app.routes.admin_operations import router as admin_operations_router
from app.routes.admin_products import router as admin_products_router
from app.routes.admin_ranking import router as admin_ranking_router
from app.routes.auth import router as auth_router
from app.routes.dev_alerts import router as dev_alerts_router
from app.routes.compare_list import router as compare_list_router
from app.routes.dev_sync import router as dev_sync_router
from app.routes.favorites import router as favorites_router
from app.routes.offers import router as offers_router
from app.routes.price_history import router as price_history_router
from app.routes.price_watches import router as price_watches_router
from app.routes.products import router as products_router
from app.routes.redirect import router as redirect_router
from app.routes.stores import router as stores_router
from app.routes.sync import router as sync_router


api_router = APIRouter()
api_router.include_router(admin_analytics_router, prefix="/admin", tags=["admin-analytics"])
api_router.include_router(admin_integrations_router, prefix="/admin", tags=["admin-integrations"])
api_router.include_router(admin_operations_router, prefix="/admin", tags=["admin-operations"])
api_router.include_router(admin_products_router, prefix="/admin", tags=["admin-products"])
api_router.include_router(admin_ranking_router, prefix="/admin", tags=["admin-ranking"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(dev_alerts_router, prefix="/dev", tags=["dev-alerts"])
api_router.include_router(dev_sync_router, prefix="/dev", tags=["dev-sync"])
api_router.include_router(products_router, prefix="/products", tags=["products"])
api_router.include_router(price_history_router, prefix="/products", tags=["price-history"])
api_router.include_router(offers_router, prefix="/offers", tags=["offers"])
api_router.include_router(redirect_router, prefix="/redirect", tags=["redirect"])
api_router.include_router(stores_router, prefix="/stores", tags=["stores"])
api_router.include_router(sync_router, prefix="/sync", tags=["sync"])
api_router.include_router(favorites_router, prefix="/me", tags=["favorites"])
api_router.include_router(compare_list_router, prefix="/me", tags=["compare-list"])
api_router.include_router(price_watches_router, prefix="/me", tags=["price-watches"])
