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

type BackendMercadoLivreOAuthStatus = {
  provider: string;
  is_configured: boolean;
  is_connected: boolean;
  connection_source: string;
  auth_base_url: string;
  redirect_uri?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  scopes?: string | null;
  connected_at?: string | null;
  access_token_expires_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
};

type BackendMercadoLivreOAuthAuthorize = {
  provider: string;
  authorization_url: string;
  redirect_uri: string;
};

export type AdminMercadoLivreOAuthStatus = {
  provider: string;
  isConfigured: boolean;
  isConnected: boolean;
  connectionSource: string;
  authBaseUrl: string;
  redirectUri?: string;
  accountId?: string;
  accountName?: string;
  scopes?: string;
  connectedAt?: string;
  accessTokenExpiresAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
};

export type AdminMercadoLivreCatalogPreviewSearchResult = AdminMercadoLivreSearchResult;

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

function mapOAuthStatus(payload: BackendMercadoLivreOAuthStatus): AdminMercadoLivreOAuthStatus {
  return {
    provider: payload.provider,
    isConfigured: payload.is_configured,
    isConnected: payload.is_connected,
    connectionSource: payload.connection_source,
    authBaseUrl: payload.auth_base_url,
    redirectUri: payload.redirect_uri ?? undefined,
    accountId: payload.account_id ?? undefined,
    accountName: payload.account_name ?? undefined,
    scopes: payload.scopes ?? undefined,
    connectedAt: payload.connected_at ?? undefined,
    accessTokenExpiresAt: payload.access_token_expires_at ?? undefined,
    lastErrorCode: payload.last_error_code ?? undefined,
    lastErrorMessage: payload.last_error_message ?? undefined
  };
}

export const adminMercadoLivreService = {
  async getOAuthStatus(): Promise<ApiResponse<AdminMercadoLivreOAuthStatus>> {
    const response = await apiClient.get<BackendMercadoLivreOAuthStatus>("/admin/integrations/mercado-livre/oauth/status");

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapOAuthStatus(response.data) };
  },

  async getAuthorizeUrl(): Promise<ApiResponse<{ authorizationUrl: string; redirectUri: string }>> {
    const response = await apiClient.get<BackendMercadoLivreOAuthAuthorize>(
      "/admin/integrations/mercado-livre/oauth/authorize"
    );

    if (!response.ok) {
      return response;
    }

    return {
      ...response,
      data: {
        authorizationUrl: response.data.authorization_url,
        redirectUri: response.data.redirect_uri
      }
    };
  },

  async disconnectOAuthConnection(): Promise<ApiResponse<null>> {
    return apiClient.delete<null>("/admin/integrations/mercado-livre/oauth/connection");
  },

  async searchProducts(query: string, limit = 10): Promise<ApiResponse<AdminMercadoLivreSearchResult>> {
    const params = new URLSearchParams({
      q: query.trim(),
      limit: String(limit)
    });
    const response = await apiClient.get<BackendMercadoLivreSearchResult>(
      `/admin/catalog/mercado-livre/search?${params.toString()}`
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
      `/admin/catalog/mercado-livre/preview/by-url?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapPreview(response.data) };
  },

  async previewByExternalId(externalId: string): Promise<ApiResponse<AdminImportedProduct>> {
    const params = new URLSearchParams({ externalId: externalId.trim() });
    const response = await apiClient.get<BackendMercadoLivrePreview>(
      `/admin/catalog/mercado-livre/preview/by-external-id?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapPreview(response.data) };
  },

  async syncByUrl(url: string): Promise<ApiResponse<AdminMercadoLivreSyncResult>> {
    const params = new URLSearchParams({ url: url.trim() });
    const response = await apiClient.post<BackendMercadoLivreSyncResult>(
      `/admin/catalog/mercado-livre/by-url?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapSyncResult(response.data) };
  },

  async syncByExternalId(externalId: string): Promise<ApiResponse<AdminMercadoLivreSyncResult>> {
    const params = new URLSearchParams({ externalId: externalId.trim() });
    const response = await apiClient.post<BackendMercadoLivreSyncResult>(
      `/admin/catalog/mercado-livre/by-external-id?${params.toString()}`
    );

    if (!response.ok) {
      return response;
    }

    return { ...response, data: mapSyncResult(response.data) };
  }
};
