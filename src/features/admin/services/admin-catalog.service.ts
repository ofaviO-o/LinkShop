import type { AdminImportedProduct, AdminProductDraft } from "@/features/admin/types/admin.types";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import type { Offer } from "@/features/product/types/offer.types";
import type { Product } from "@/features/product/types/product.types";
import { slugify } from "@/shared/lib/format";
import { safeUUID } from "@/shared/lib/uuid";

function calculateDiscountPercentage(price: number, originalPrice?: number) {
  if (!originalPrice || originalPrice <= price) {
    return 0;
  }

  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export const adminCatalogService = {
  buildDraft(item?: CatalogItem | null): AdminProductDraft {
    const primaryOffer = item?.bestOffer ?? item?.offers[0];

    return {
      productId: item?.product.id,
      offerId: primaryOffer?.id,
      name: item?.product.name ?? "",
      slug: item?.product.slug ?? "",
      brand: item?.product.brand ?? "",
      category: item?.product.category ?? "",
      description: item?.product.description ?? "",
      thumbnailUrl: item?.product.thumbnailUrl ?? "",
      popularityScore: String(item?.product.popularityScore ?? 80),
      isActive: item?.product.isActive ?? true,
      storeId: primaryOffer?.storeId ?? "amazon",
      sellerName: primaryOffer?.sellerName ?? "",
      affiliateUrl: primaryOffer?.affiliateUrl ?? "",
      landingUrl: undefined,
      price: primaryOffer ? String(primaryOffer.price) : "",
      originalPrice: primaryOffer?.originalPrice ? String(primaryOffer.originalPrice) : "",
      installmentText: primaryOffer?.installmentText ?? "",
      shippingCost: primaryOffer?.shippingCost ? String(primaryOffer.shippingCost) : "",
      isFeatured: primaryOffer?.isFeatured ?? false
    };
  },

  buildCatalogItemFromDraft(draft: AdminProductDraft, existingItem?: CatalogItem | null): CatalogItem {
    const productId = existingItem?.product.id ?? draft.productId ?? safeUUID();
    const primaryOffer = existingItem?.bestOffer ?? existingItem?.offers[0];
    const offerId = primaryOffer?.id ?? draft.offerId ?? safeUUID();
    const now = new Date().toISOString();

    const product: Product = {
      id: productId,
      slug: draft.slug.trim() || slugify(draft.name),
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      category: draft.category.trim(),
      description: draft.description.trim(),
      thumbnailUrl: draft.thumbnailUrl.trim(),
      tags: existingItem?.product.tags ?? [],
      popularityScore: Number(draft.popularityScore || 0),
      isActive: draft.isActive
    };

    const offer: Offer = {
      id: offerId,
      productId,
      storeId: draft.storeId,
      sellerName: draft.sellerName.trim(),
      title: draft.name.trim(),
      affiliateUrl: draft.affiliateUrl.trim(),
      price: Number(draft.price),
      originalPrice: draft.originalPrice ? Number(draft.originalPrice) : undefined,
      currency: "BRL",
      installmentText: draft.installmentText.trim() || undefined,
      shippingCost: draft.shippingCost ? Number(draft.shippingCost) : undefined,
      availability: primaryOffer?.availability ?? "in_stock",
      isFeatured: draft.isFeatured,
      lastSyncedAt: now
    };

    return {
      product,
      offers: [offer],
      bestOffer: offer,
      lowestPrice: offer.price,
      highestPrice: offer.price,
      bestDiscountPercentage: calculateDiscountPercentage(offer.price, offer.originalPrice),
      storeIds: [offer.storeId]
    };
  },

  buildDraftFromImport(imported: AdminImportedProduct, currentDraft?: AdminProductDraft): AdminProductDraft {
    const base = currentDraft ?? adminCatalogService.buildDraft();

    return {
      ...base,
      name: imported.name?.trim() || base.name,
      slug: imported.slug?.trim() || base.slug,
      brand: imported.brand?.trim() || base.brand,
      category: imported.category?.trim() || base.category,
      description: imported.description?.trim() || base.description,
      thumbnailUrl: imported.thumbnailUrl?.trim() || base.thumbnailUrl,
      storeId: imported.storeId || base.storeId,
      sellerName: imported.sellerName?.trim() || base.sellerName,
      affiliateUrl: imported.affiliateUrl?.trim() || base.affiliateUrl,
      landingUrl: imported.landingUrl?.trim() || imported.resolvedUrl?.trim() || base.landingUrl,
      price: imported.price != null ? String(imported.price) : base.price,
      originalPrice: imported.originalPrice != null ? String(imported.originalPrice) : base.originalPrice
    };
  }
};
