from abc import ABC, abstractmethod

from app.integrations.catalog.types import CatalogProductPayload, CatalogSearchResult


class BaseCatalogProvider(ABC):
    provider_name: str

    @abstractmethod
    def search_products(self, *, query: str, limit: int = 10) -> CatalogSearchResult:
        raise NotImplementedError

    @abstractmethod
    def fetch_product_details(
        self,
        *,
        external_id: str | None = None,
        product_url: str | None = None,
    ) -> CatalogProductPayload:
        raise NotImplementedError
