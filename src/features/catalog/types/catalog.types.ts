import type { Offer } from "@/features/product/types/offer.types";
import type { Product } from "@/features/product/types/product.types";
import type { Store, StoreId } from "@/features/product/types/store.types";

export type CatalogSort =
  | "relevance"
  | "lowest-price"
  | "highest-price"
  | "best-discount"
  | "popularity";

export type CatalogFilters = {
  query: string;
  category: string;
  storeId: StoreId | "";
  minPrice: number | null;
  maxPrice: number | null;
  minDiscount: number;
  sort: CatalogSort;
};

export type CatalogItem = {
  product: Product;
  offers: Offer[];
  bestOffer: Offer | null;
  bestOfferScore?: number | null;
  bestOfferReason?: string | null;
  lowestPrice: number;
  highestPrice: number;
  bestDiscountPercentage: number;
  storeIds: StoreId[];
};

export type CatalogSearchParams = CatalogFilters & {
  page?: number;
  pageSize?: number;
};

export type CatalogSearchResult = {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  availableCategories: string[];
  availableStores: Store[];
  appliedFilters: CatalogFilters;
};

export type CatalogCategorySummary = {
  name: string;
  slug: string;
  productCount: number;
  lowestPrice: number;
};

export type CatalogHomeShelf = {
  id: string;
  contextKey: string;
  title: string;
  description: string;
  viewMoreHref: string;
  items: CatalogItem[];
};

export type CatalogHomeSections = {
  featuredProducts: CatalogItem[];
  bestOffers: CatalogItem[];
  categories: CatalogCategorySummary[];
  shelves: CatalogHomeShelf[];
};
