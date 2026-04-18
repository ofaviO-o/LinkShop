import { catalogMockRepository } from "@/features/catalog/data/catalog.mock-repository";
import type {
  CatalogCategorySummary,
  CatalogHomeShelf,
  CatalogHomeSections,
  CatalogItem,
  CatalogSearchParams,
  CatalogSearchResult
} from "@/features/catalog/types/catalog.types";
import { apiClient } from "@/shared/api/api-client";
import { isBackendIntegrationEnabled } from "@/shared/api/api-config";
import { storesService } from "@/features/product/services/stores.service";
import type { Offer } from "@/features/product/types/offer.types";
import type { Product } from "@/features/product/types/product.types";
import type { Store } from "@/features/product/types/store.types";
import { mockSuccess } from "@/shared/lib/async";
import { calculateDiscountPercentage } from "@/shared/lib/commerce";
import { normalizeText } from "@/shared/lib/format";
import type { ApiResponse } from "@/shared/types/api.types";

type BackendStore = {
  code: Store["id"];
  name: string;
  affiliate_network: Store["affiliateNetwork"];
  is_active: boolean;
};

type BackendOffer = {
  id: string;
  product_id: string;
  seller_name: string;
  title: string;
  affiliate_url: string;
  price: string | number;
  original_price: string | number | null;
  currency: "BRL";
  installment_text: string | null;
  shipping_cost: string | number | null;
  availability: Offer["availability"];
  is_featured: boolean;
  last_synced_at: string;
  ranking_score?: number | null;
  quality_score?: number | null;
  ranking_reason?: string | null;
  store: BackendStore;
};

type BackendProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  thumbnail_url: string;
  popularity_score: number;
  is_active: boolean;
};

type BackendCatalogItem = {
  product: BackendProduct;
  offers: BackendOffer[];
  best_offer: BackendOffer | null;
  best_offer_score?: number | null;
  best_offer_reason?: string | null;
  lowest_price: string | number;
  highest_price: string | number;
  best_discount_percentage: number;
  store_ids: Array<Store["id"]>;
};

type BackendCatalogSearchResponse = {
  items: BackendCatalogItem[];
  total: number;
  page: number;
  page_size: number;
  available_categories: string[];
  available_stores: BackendStore[];
};

function mapBackendStore(store: BackendStore): Store {
  return {
    id: store.code,
    name: store.name,
    slug: store.code,
    affiliateNetwork: store.affiliate_network,
    isActive: store.is_active
  };
}

function mapBackendProduct(product: BackendProduct): Product {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    thumbnailUrl: product.thumbnail_url,
    tags: [],
    popularityScore: product.popularity_score,
    isActive: product.is_active
  };
}

function mapBackendOffer(offer: BackendOffer): Offer {
  return {
    id: offer.id,
    productId: offer.product_id,
    storeId: offer.store.code,
    sellerName: offer.seller_name,
    title: offer.title,
    affiliateUrl: offer.affiliate_url,
    price: Number(offer.price),
    originalPrice: offer.original_price == null ? undefined : Number(offer.original_price),
    currency: offer.currency,
    installmentText: offer.installment_text ?? undefined,
    shippingCost: offer.shipping_cost == null ? undefined : Number(offer.shipping_cost),
    availability: offer.availability,
    isFeatured: offer.is_featured,
    lastSyncedAt: offer.last_synced_at,
    rankingScore: offer.ranking_score == null ? undefined : Number(offer.ranking_score),
    qualityScore: offer.quality_score == null ? undefined : Number(offer.quality_score),
    rankingReason: offer.ranking_reason ?? undefined
  };
}

function mapBackendCatalogItem(item: BackendCatalogItem): CatalogItem {
  return {
    product: mapBackendProduct(item.product),
    offers: item.offers.map(mapBackendOffer),
    bestOffer: item.best_offer ? mapBackendOffer(item.best_offer) : null,
    bestOfferScore: item.best_offer_score == null ? null : Number(item.best_offer_score),
    bestOfferReason: item.best_offer_reason ?? null,
    lowestPrice: Number(item.lowest_price),
    highestPrice: Number(item.highest_price),
    bestDiscountPercentage: item.best_discount_percentage,
    storeIds: item.store_ids
  };
}

function buildCatalogItems(): CatalogItem[] {
  return catalogMockRepository.listProducts().map((product) => {
    const offers = catalogMockRepository
      .listOffers()
      .filter((offer) => offer.productId === product.id)
      .sort((first, second) => first.price - second.price);
    const orderedPrices = offers.map((offer) => offer.price);
    const lowestPrice = orderedPrices[0] ?? 0;
    const highestPrice = orderedPrices[orderedPrices.length - 1] ?? 0;
    const bestOffer = offers[0] ?? null;
    const bestDiscountPercentage = Math.max(
      ...offers.map((offer) => calculateDiscountPercentage(offer.price, offer.originalPrice)),
      0
    );

    return {
      product,
      offers,
      bestOffer,
      bestOfferScore: bestOffer?.rankingScore ?? null,
      bestOfferReason: bestOffer?.rankingReason ?? null,
      lowestPrice,
      highestPrice,
      bestDiscountPercentage,
      storeIds: [...new Set(offers.map((offer) => offer.storeId))]
    };
  });
}

function sortCatalogItems(items: CatalogItem[], sort: CatalogSearchParams["sort"]) {
  return [...items].sort((first, second) => {
    switch (sort) {
      case "lowest-price":
        return first.lowestPrice - second.lowestPrice;
      case "highest-price":
        return second.lowestPrice - first.lowestPrice;
      case "best-discount":
        return second.bestDiscountPercentage - first.bestDiscountPercentage;
      case "popularity":
        return second.product.popularityScore - first.product.popularityScore;
      default:
        return (
          second.product.popularityScore +
          second.offers.length * 5 +
          second.bestDiscountPercentage -
          (first.product.popularityScore + first.offers.length * 5 + first.bestDiscountPercentage)
        );
    }
  });
}

function buildCategorySummaries(items: CatalogItem[]): CatalogCategorySummary[] {
  const grouped = new Map<string, CatalogItem[]>();

  items.forEach((item) => {
    const bucket = grouped.get(item.product.category) ?? [];
    bucket.push(item);
    grouped.set(item.product.category, bucket);
  });

  return [...grouped.entries()]
    .map(([name, categoryItems]) => ({
      name,
      slug: normalizeText(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      productCount: categoryItems.length,
      lowestPrice: Math.min(...categoryItems.map((item) => item.lowestPrice))
    }))
    .sort((first, second) => second.productCount - first.productCount);
}

function buildHomeShelves(items: CatalogItem[], categories: CatalogCategorySummary[]): CatalogHomeShelf[] {
  const featuredProducts = sortCatalogItems(items, "relevance").slice(0, 12);
  const mostBoughtProducts = sortCatalogItems(items, "popularity").slice(0, 12);
  const bestOfferProducts = sortCatalogItems(items, "best-discount").slice(0, 12);

  const categoryShelves = categories.slice(0, 3).map((category) => ({
    id: `category-${category.slug}`,
    contextKey: `category:${category.slug}`,
    title: category.name,
    description: `Selecao de ${category.name.toLowerCase()} com comparacao ativa no catalogo.`,
    viewMoreHref: `/buscar?categoria=${encodeURIComponent(category.name)}`,
    items: sortCatalogItems(
      items.filter((item) => item.product.category === category.name),
      "relevance"
    ).slice(0, 12)
  }));

  return [
    {
      id: "featured",
      contextKey: "featured",
      title: "Destaques",
      description: "Itens em evidência para descoberta rápida.",
      viewMoreHref: "/buscar?ordem=relevance",
      items: featuredProducts
    },
    {
      id: "most-bought",
      contextKey: "most-bought",
      title: "Mais comprados",
      description: "Produtos com maior tração de interesse recente.",
      viewMoreHref: "/buscar?ordem=popularity",
      items: mostBoughtProducts
    },
    {
      id: "best-offers",
      contextKey: "best-offers",
      title: "Melhores ofertas",
      description: "Produtos com descontos mais agressivos do momento.",
      viewMoreHref: "/buscar?ordem=best-discount",
      items: bestOfferProducts
    },
    ...categoryShelves
  ].filter((shelf) => shelf.items.length > 0);
}

function buildHomeSectionsData(items: CatalogItem[]): CatalogHomeSections {
  const categories = buildCategorySummaries(items).slice(0, 6);
  const shelves = buildHomeShelves(items, categories);

  return {
    featuredProducts: sortCatalogItems(items, "popularity").slice(0, 12),
    bestOffers: sortCatalogItems(items, "best-discount").slice(0, 12),
    categories,
    shelves
  };
}

export const catalogService = {
  async searchCatalog(params: CatalogSearchParams): Promise<ApiResponse<CatalogSearchResult>> {
    if (isBackendIntegrationEnabled()) {
      const searchParams = new URLSearchParams();

      if (params.query) searchParams.set("q", params.query);
      if (params.category) searchParams.set("category", params.category);
      if (params.storeId) searchParams.set("storeId", params.storeId);
      if (params.minPrice !== null) searchParams.set("minPrice", String(params.minPrice));
      if (params.maxPrice !== null) searchParams.set("maxPrice", String(params.maxPrice));
      if (params.minDiscount > 0) searchParams.set("minDiscount", String(params.minDiscount));
      if (params.sort) searchParams.set("sort", params.sort);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

      const response = await apiClient.get<BackendCatalogSearchResponse>(`/products/search?${searchParams.toString()}`);

      if (response.ok) {
        return {
          ...response,
          data: {
            items: response.data.items.map(mapBackendCatalogItem),
            total: response.data.total,
            page: response.data.page,
            pageSize: response.data.page_size,
            availableCategories: response.data.available_categories,
            availableStores: response.data.available_stores.map(mapBackendStore),
            appliedFilters: {
              query: params.query,
              category: params.category,
              storeId: params.storeId,
              minPrice: params.minPrice,
              maxPrice: params.maxPrice,
              minDiscount: params.minDiscount,
              sort: params.sort
            }
          }
        };
      }
    }

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 12;
    const normalizedQuery = normalizeText(params.query);

    const filteredItems = buildCatalogItems().filter((item) => {
      const haystack = normalizeText(
        [item.product.name, item.product.brand, item.product.category, item.product.tags.join(" ")].join(" ")
      );
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesCategory = !params.category || item.product.category === params.category;
      const matchesStore = !params.storeId || item.storeIds.includes(params.storeId);
      const matchesMinPrice = params.minPrice === null || item.lowestPrice >= params.minPrice;
      const matchesMaxPrice = params.maxPrice === null || item.lowestPrice <= params.maxPrice;
      const matchesDiscount = item.bestDiscountPercentage >= params.minDiscount;

      return matchesQuery && matchesCategory && matchesStore && matchesMinPrice && matchesMaxPrice && matchesDiscount;
    });

    const sortedItems = sortCatalogItems(filteredItems, params.sort);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = sortedItems.slice(startIndex, startIndex + pageSize);
    const availableCategories = [...new Set(catalogMockRepository.listProducts().map((product) => product.category))].sort(
      (a, b) => a.localeCompare(b, "pt-BR")
    );
    const storesResponse = await storesService.listStores();
    const availableStores = storesResponse.ok ? storesResponse.data : [];

    return mockSuccess({
      items: paginatedItems,
      total: filteredItems.length,
      page,
      pageSize,
      availableCategories,
      availableStores,
      appliedFilters: {
        query: params.query,
        category: params.category,
        storeId: params.storeId,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        minDiscount: params.minDiscount,
        sort: params.sort
      }
    });
  },

  async getCatalogItemBySlug(slug: string): Promise<ApiResponse<CatalogItem | null>> {
    if (isBackendIntegrationEnabled()) {
      const response = await apiClient.get<BackendProduct>(`/products/by-slug/${encodeURIComponent(slug)}`);

      if (response.ok) {
        const offersResponse = await apiClient.get<BackendOffer[]>(`/offers?productId=${encodeURIComponent(response.data.id)}`);

        if (offersResponse.ok) {
          const offers = offersResponse.data.map(mapBackendOffer);
          const lowestPrice = offers.length ? Math.min(...offers.map((offer) => offer.price)) : 0;
          const highestPrice = offers.length ? Math.max(...offers.map((offer) => offer.price)) : 0;
          const bestOffer = offers[0] ?? null;
          const bestDiscountPercentage = Math.max(
            ...offers.map((offer) => calculateDiscountPercentage(offer.price, offer.originalPrice)),
            0
          );

          return {
            ...offersResponse,
            data: {
              product: mapBackendProduct(response.data),
              offers,
              bestOffer,
              bestOfferScore: bestOffer?.rankingScore ?? null,
              bestOfferReason: bestOffer?.rankingReason ?? null,
              lowestPrice,
              highestPrice,
              bestDiscountPercentage,
              storeIds: [...new Set(offers.map((offer) => offer.storeId))]
            }
          };
        }
      }

      if (!response.ok && response.error.code === "HTTP_404") {
        return {
          ok: true,
          data: null,
          meta: response.meta
        };
      }
    }

    const item = buildCatalogItems().find((entry) => entry.product.slug === slug) ?? null;
    return mockSuccess(item);
  },

  async getCatalogBootstrap(): Promise<ApiResponse<CatalogSearchResult>> {
    return this.searchCatalog({
      query: "",
      category: "",
      storeId: "",
      minPrice: null,
      maxPrice: null,
      minDiscount: 0,
      sort: "relevance",
      page: 1,
      pageSize: 12
    });
  },

  async getAllCatalogItems(): Promise<ApiResponse<CatalogItem[]>> {
    if (isBackendIntegrationEnabled()) {
      const response = await this.searchCatalog({
        query: "",
        category: "",
        storeId: "",
        minPrice: null,
        maxPrice: null,
        minDiscount: 0,
        sort: "relevance",
        page: 1,
        pageSize: 100
      });

      if (!response.ok) {
        return response;
      }

      return {
        ...response,
        data: response.data.items
      };
    }

    return mockSuccess(buildCatalogItems());
  },

  async getCatalogItemsByProductIds(productIds: string[]): Promise<ApiResponse<CatalogItem[]>> {
    if (isBackendIntegrationEnabled()) {
      if (!productIds.length) {
        return mockSuccess([]);
      }

      const searchParams = new URLSearchParams({
        ids: productIds.join(","),
        page: "1",
        pageSize: String(Math.max(productIds.length, 1))
      });

      const response = await apiClient.get<BackendCatalogSearchResponse>(`/products/search?${searchParams.toString()}`);

      if (response.ok) {
        return {
          ...response,
          data: response.data.items.map(mapBackendCatalogItem)
        };
      }
    }

    const items = buildCatalogItems().filter((item) => productIds.includes(item.product.id));
    return mockSuccess(items);
  },

  async getHomeSections(): Promise<ApiResponse<CatalogHomeSections>> {
    if (isBackendIntegrationEnabled()) {
      const allItemsResponse = await this.getAllCatalogItems();

      if (allItemsResponse.ok) {
        return {
          ...allItemsResponse,
          data: buildHomeSectionsData(allItemsResponse.data)
        };
      }
    }

    return mockSuccess(buildHomeSectionsData(buildCatalogItems()));
  }
};
