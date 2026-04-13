import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import type { AdminImportedProduct } from "@/features/admin/types/admin.types";
import type { Offer } from "@/features/product/types/offer.types";
import type { Product } from "@/features/product/types/product.types";
import type { Store } from "@/features/product/types/store.types";
import { apiClient } from "@/shared/api/api-client";
import { safeUUID } from "@/shared/lib/uuid";
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
  is_active: boolean;
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

type AdminProductWritePayload = {
  slug?: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  thumbnail_url: string;
  popularity_score: number;
  is_active: boolean;
  offer_id?: string;
  store_code: Store["id"];
  seller_name: string;
  affiliate_url: string;
  price: number;
  original_price: number | null;
  installment_text: string | null;
  shipping_cost: number | null;
  is_featured: boolean;
  availability: Offer["availability"];
};

type AdminProductImportPayload = {
  url: string;
};

type BackendAdminProductImport = {
  provider: string;
  source_url: string;
  store_code: Store["id"];
  external_id: string | null;
  name: string | null;
  slug: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  thumbnail_url: string | null;
  seller_name: string | null;
  affiliate_url: string;
  price: string | number | null;
  original_price: string | number | null;
};

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

function toWritePayload(item: CatalogItem): AdminProductWritePayload {
  const offer = item.bestOffer ?? item.offers[0];

  if (!offer) {
    throw new Error("Catalog item must include at least one offer");
  }

  return {
    slug: item.product.slug.trim() || undefined,
    name: item.product.name.trim(),
    brand: item.product.brand.trim(),
    category: item.product.category.trim(),
    description: item.product.description.trim(),
    thumbnail_url: item.product.thumbnailUrl.trim(),
    popularity_score: item.product.popularityScore,
    is_active: item.product.isActive,
    offer_id: offer.id,
    store_code: offer.storeId,
    seller_name: offer.sellerName.trim(),
    affiliate_url: offer.affiliateUrl.trim(),
    price: offer.price,
    original_price: offer.originalPrice ?? null,
    installment_text: offer.installmentText ?? null,
    shipping_cost: offer.shippingCost ?? null,
    is_featured: offer.isFeatured,
    availability: offer.availability
  };
}

function mapBackendImportedProduct(payload: BackendAdminProductImport): AdminImportedProduct {
  return {
    provider: payload.provider,
    sourceUrl: payload.source_url,
    storeId: payload.store_code,
    externalId: payload.external_id ?? undefined,
    name: payload.name ?? undefined,
    slug: payload.slug ?? undefined,
    brand: payload.brand ?? undefined,
    category: payload.category ?? undefined,
    description: payload.description ?? undefined,
    thumbnailUrl: payload.thumbnail_url ?? undefined,
    sellerName: payload.seller_name ?? undefined,
    affiliateUrl: payload.affiliate_url,
    price: payload.price == null ? undefined : Number(payload.price),
    originalPrice: payload.original_price == null ? undefined : Number(payload.original_price)
  };
}

export const adminProductsService = {
  async createProduct(item: CatalogItem): Promise<ApiResponse<CatalogItem>> {
    try {
      const payload = toWritePayload(item);
      const response = await apiClient.post<BackendCatalogItem>("/admin/products", payload);

      if (!response.ok) {
        return response;
      }

      return {
        ...response,
        data: mapBackendCatalogItem(response.data)
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "INVALID_ADMIN_PRODUCT_PAYLOAD",
          message: "Nao foi possivel montar o payload para publicar o produto."
        },
        meta: {
          requestId: safeUUID(),
          timestamp: new Date().toISOString(),
          source: "backend"
        }
      };
    }
  },

  async updateProduct(productId: string, item: CatalogItem): Promise<ApiResponse<CatalogItem>> {
    try {
      const payload = toWritePayload(item);
      const response = await apiClient.patch<BackendCatalogItem>(
        `/admin/products/${encodeURIComponent(productId)}`,
        payload
      );

      if (!response.ok) {
        return response;
      }

      return {
        ...response,
        data: mapBackendCatalogItem(response.data)
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "INVALID_ADMIN_PRODUCT_PAYLOAD",
          message: "Nao foi possivel montar o payload para atualizar o produto."
        },
        meta: {
          requestId: safeUUID(),
          timestamp: new Date().toISOString(),
          source: "backend"
        }
      };
    }
  },

  async deleteProduct(productId: string): Promise<ApiResponse<{ success: true }>> {
    const response = await apiClient.delete<null>(`/admin/products/${encodeURIComponent(productId)}`);

    if (!response.ok) {
      return response;
    }

    return {
      ok: true,
      data: { success: true },
      meta: response.meta
    };
  },

  async importProductByUrl(url: string): Promise<ApiResponse<AdminImportedProduct>> {
    const payload: AdminProductImportPayload = { url: url.trim() };
    const response = await apiClient.post<BackendAdminProductImport>("/admin/products/import", payload);

    if (!response.ok) {
      return response;
    }

    return {
      ...response,
      data: mapBackendImportedProduct(response.data)
    };
  }
};
