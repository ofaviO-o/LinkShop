export type AdminProductDraft = {
  productId?: string;
  offerId?: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  description: string;
  thumbnailUrl: string;
  popularityScore: string;
  isActive: boolean;
  storeId: "amazon" | "mercado-livre" | "shopee";
  sellerName: string;
  affiliateUrl: string;
  price: string;
  originalPrice: string;
  installmentText: string;
  shippingCost: string;
  isFeatured: boolean;
};

export type AdminImportedProduct = {
  provider: string;
  sourceUrl: string;
  storeId: "amazon" | "mercado-livre" | "shopee";
  externalId?: string;
  name?: string;
  slug?: string;
  brand?: string;
  category?: string;
  description?: string;
  thumbnailUrl?: string;
  sellerName?: string;
  affiliateUrl?: string;
  price?: number;
  originalPrice?: number;
};

export type AdminCountItem = {
  id: string;
  label: string;
  count: number;
};

export type AdminSourceItem = {
  source: string;
  count: number;
};

export type AdminTimeBucket = {
  date: string;
  count: number;
};

export type AdminClickAnalytics = {
  periodDays: number;
  totalClicks: number;
  topProducts: AdminCountItem[];
  topOffers: AdminCountItem[];
  topStores: AdminCountItem[];
  clicksBySource: AdminSourceItem[];
  clicksByDay: AdminTimeBucket[];
};

export type AdminAlertAnalytics = {
  periodDays: number;
  totalAlerts: number;
  alertsByReason: AdminSourceItem[];
  topProducts: AdminCountItem[];
  topWatches: AdminCountItem[];
  alertsByDay: AdminTimeBucket[];
};

export type AdminClickEvent = {
  id: string;
  userId: string | null;
  productId: string;
  productName: string;
  offerId: string;
  offerTitle: string;
  storeId: string;
  storeName: string;
  source: string;
  referrer: string | null;
  createdAt: string;
};

export type AdminAlertEvent = {
  id: string;
  priceWatchId: string;
  userId: string;
  productId: string;
  productName: string;
  offerId: string | null;
  reason: string;
  status: string;
  message: string;
  currentPrice: number | null;
  targetPrice: number | null;
  previousPrice: number | null;
  triggered: boolean;
  createdAt: string;
};

export type AdminHealthStatus = {
  status: "ok" | "ready" | "not_ready" | "unknown";
  checks?: Record<string, string>;
  meta?: Record<string, string | number | boolean>;
  error?: string;
};

export type AdminDashboardData = {
  clickAnalytics: AdminClickAnalytics | null;
  alertAnalytics: AdminAlertAnalytics | null;
  operations: AdminOperationalSummary | null;
  rankingDiagnostics: AdminRankingDiagnostic[];
  recentClickEvents: AdminClickEvent[];
  recentAlertEvents: AdminAlertEvent[];
  health: AdminHealthStatus;
  readiness: AdminHealthStatus;
};

export type AdminRankingDiagnostic = {
  productId: string;
  productLabel: string;
  offersCount: number;
  lowestPrice: number | null;
  bestOfferId: string | null;
  bestOfferScore: number | null;
  bestOfferReason: string | null;
  bestOfferPrice: number | null;
  bestOfferStoreName: string | null;
};

export type AdminOperationalError = {
  flow?: string;
  message: string;
  code?: string | null;
  requestId?: string | null;
  occurredAt: string;
};

export type AdminOperationalFlow = {
  name: string;
  metrics: Record<string, number>;
  lastError: AdminOperationalError | null;
};

export type AdminOperationalSummary = {
  generatedAt: string;
  uptimeSeconds: number;
  requests: {
    total: number;
    api: number;
    failed: number;
    serverError: number;
  };
  flows: AdminOperationalFlow[];
  lastError: AdminOperationalError | null;
  persistent: {
    totalSyncRuns: number;
    totalClickEvents: number;
    totalAlertEvents: number;
    latestSyncRunStatus: string | null;
    latestSyncRunAt: string | null;
    latestClickAt: string | null;
    latestAlertAt: string | null;
  };
};
