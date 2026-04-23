import { apiClient } from "@/shared/api/api-client";
import type { ApiResponse } from "@/shared/types/api.types";
import type {
  AdminImportedProduct,
  AdminMercadoLivreSearchItem,
  AdminMercadoLivreSearchResult,
  AdminMercadoLivreSyncResult
} from "@/features/admin/types/admin.types";

type BackendMercadoLivreSearchItem = {
  marketplace: "mercado-livre";
  external_id: string;
  title: string;
  category_id?: string | null;
  thumbnail_url?: string | null;
  canonical_url?: string | null;
  brand?: string | null;
  condition?: string | null;
  currency_id: string;
  price?: string | number | null;
  original_price?: string | number | null;
};

type BackendMercadoLivreSearchResult = {
  provider: string;
  query: string;
  items: BackendMercadoLivreSearchItem[];
};

type BackendMercadoLivrePreview = {
  provider: string;
  source_url: string;
  resolved_url: string;
  store_code: "mercado-livre";
  external_id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  description: string;
  thumbnail_url?: string | null;
  seller_name: string;
  affiliate_url: string;
  landing_url: string;
  price: string | number;
  original_price?: string | number | null;
};

type BackendMercadoLivreSyncResult = {
  provider: string;
  marketplace: string;
  source_reference: string;
  product_id: string;
  product_external_id: string;
  product_status: string;
  offer_ids: string[];
  offers_created: number;
  offers_updated: number;
  offers_count: number;
  synced_at: string;
};

function mapPreview(payload: BackendMercadoLivrePreview): AdminImportedProduct {
  return {
    provider: payload.provider,
    sourceUrl: payload.source_url,
    resolvedUrl: payload.resolved_url,
    storeId: payload.store_code,
    externalId: payload.external_id,
    name: payload.name,
    slug: payload.slug,
    brand: payload.brand,
    category: payload.category,
    description: payload.description,
    thumbnailUrl: payload.thumbnail_url ?? undefined,
    sellerName: payload.seller_name,
    affiliateUrl: payload.affiliate_url,
    landingUrl: payload.landing_url,
    price: Number(payload.price),
    originalPrice: payload.original_price == null ? undefined : Number(payload.original_price)
  };
}

function mapSearchItem(payload: BackendMercadoLivreSearchItem): AdminMercadoLivreSearchItem {
  return {
    marketplace: payload.marketplace,
    externalId: payload.external_id,
    title: payload.title,
    categoryId: payload.category_id ?? undefined,
    thumbnailUrl: payload.thumbnail_url ?? undefined,
    canonicalUrl: payload.canonical_url ?? undefined,
    brand: payload.brand ?? undefined,
    condition: payload.condition ?? undefined,
    currencyId: payload.currency_id,
    price: payload.price == null ? undefined : Number(payload.price),
    originalPrice: payload.original_price == null ? undefined : Number(payload.original_price)
  };
}

function mapSyncResult(payload: BackendMercadoLivreSyncResult): AdminMercadoLivreSyncResult {
  return {
    provider: payload.provider,
    marketplace: payload.marketplace,
    sourceReference: payload.source_reference,
    productId: payload.product_id,
    productExternalId: payload.product_external_id,
    productStatus: payload.product_status,
    offerIds: payload.offer_ids,
    offersCreated: payload.offers_created,
    offersUpdated: payload.offers_updated,
    offersCount: payload.offers_count,
    syncedAt: payload.synced_at
  };
}

export const adminMercadoLivreService = {
  async searchProducts(query: string, limit = 10): Promise<ApiResponse<AdminMercadoLivreSearchResult>> {
    const params = new URLSearchParams({
      q: query.trim(),
      limit: String(limit)
    });
    const response = await apiClient.get<BackendMercadoLivreSearchResult>(
      `/dev/catalog/mercado-livre/search?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return {
      ...response,
      data: {
        provider: response.data.provider,
        query: response.data.query,
        items: response.data.items.map(mapSearchItem)
      }
    };
  },

  async previewByUrl(url: string): Promise<ApiResponse<AdminImportedProduct>> {
    const params = new URLSearchParams({ url: url.trim() });
    const response = await apiClient.get<BackendMercadoLivrePreview>(
      `/dev/catalog/mercado-livre/preview/by-url?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapPreview(response.data) };
  },

  async previewByExternalId(externalId: string): Promise<ApiResponse<AdminImportedProduct>> {
    const params = new URLSearchParams({ externalId: externalId.trim() });
    const response = await apiClient.get<BackendMercadoLivrePreview>(
      `/dev/catalog/mercado-livre/preview/by-external-id?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapPreview(response.data) };
  },

  async syncByUrl(url: string): Promise<ApiResponse<AdminMercadoLivreSyncResult>> {
    const params = new URLSearchParams({ url: url.trim() });
    const response = await apiClient.post<BackendMercadoLivreSyncResult>(
      `/dev/catalog/mercado-livre/by-url?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapSyncResult(response.data) };
  },

  async syncByExternalId(externalId: string): Promise<ApiResponse<AdminMercadoLivreSyncResult>> {
    const params = new URLSearchParams({ externalId: externalId.trim() });
    const response = await apiClient.post<BackendMercadoLivreSyncResult>(
      `/dev/catalog/mercado-livre/by-external-id?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapSyncResult(response.data) };
  }
};
