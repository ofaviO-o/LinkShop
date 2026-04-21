import Link from "next/link";
import Image from "next/image";

import { CompareListButton } from "@/features/cart/components/compare-list-button";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { FavoriteToggleButton } from "@/features/favorites/components/favorite-toggle-button";
import { ProductOfferCard } from "@/features/product";
import { formatPrice, getSafeImageUrl, isFinitePositiveNumber } from "@/shared/lib/format";

type CatalogProductCardProps = {
  item: CatalogItem;
  variant?: "default" | "compact";
};

const storeLabelById = {
  amazon: "Amazon",
  "mercado-livre": "Mercado Livre",
  shopee: "Shopee"
} as const;

function CompactCatalogProductCard({ item }: { item: CatalogItem }) {
  const productHref = `/ofertas/${item.product.slug}`;
  const safeImageUrl = getSafeImageUrl(item.product.thumbnailUrl);
  const bestStoreLabel = item.bestOffer ? storeLabelById[item.bestOffer.storeId] : null;
  const supportText = item.bestOffer?.installmentText ?? item.product.category;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[1.15rem] border border-black/5 bg-white p-3 shadow-glow">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-gradient-to-b from-orange-50 to-neutral-100">
        <Link href={productHref} aria-label={`Ver ${item.product.name}`} className="absolute inset-0 z-10" />
        {safeImageUrl ? (
          <Image
            src={safeImageUrl}
            alt={item.product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1440px) 20vw, 16vw"
            className="object-contain p-2"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-neutral-500">
            Imagem indisponivel
          </div>
        )}

        <div className="absolute left-2 top-2">
          {item.bestDiscountPercentage > 0 ? (
            <span className="rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-ink">
              {item.bestDiscountPercentage}% OFF
            </span>
          ) : null}
        </div>

        <div className="absolute right-2 top-2 z-20">
          <FavoriteToggleButton productId={item.product.id} variant="icon" />
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
          <span className="truncate">{item.product.brand || item.product.category}</span>
          <span className="shrink-0">{item.offers.length} ofertas</span>
        </div>

        <Link
          href={productHref}
          className="line-clamp-2 min-h-[2.9rem] text-sm font-semibold leading-6 text-ink transition hover:text-coral"
          title={item.product.name}
        >
          {item.product.name}
        </Link>

        <div className="mt-3">
          <p className="font-display text-xl leading-none text-ink">{formatPrice(item.lowestPrice)}</p>
          <p className="mt-1 line-clamp-1 text-xs text-neutral-500">
            {supportText}
          </p>
        </div>

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/[0.03] px-2.5 py-2 text-xs text-neutral-600">
            <span className="truncate">{bestStoreLabel ? `Melhor na ${bestStoreLabel}` : "Ofertas comparadas"}</span>
            <span className="shrink-0 font-medium text-ink">
              {item.storeIds.length} lojas
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CatalogProductCard({ item, variant = "default" }: CatalogProductCardProps) {
  if (variant === "compact") {
    return <CompactCatalogProductCard item={item} />;
  }

  const bestOffer = item.bestOffer;
  const productHref = `/ofertas/${item.product.slug}`;
  const offerId = item.bestOffer?.id ?? item.offers[0]?.id;
  const unitPrice = item.bestOffer?.price ?? item.lowestPrice;
  const bestOfferSavings = bestOffer?.originalPrice ? bestOffer.originalPrice - bestOffer.price : 0;
  const hasValidBestPrice = isFinitePositiveNumber(bestOffer?.price);
  const hasValidLowestPrice = isFinitePositiveNumber(item.lowestPrice);
  const bestVsLowestGap = hasValidBestPrice && hasValidLowestPrice && bestOffer ? bestOffer.price - item.lowestPrice : null;
  const bestDiffersFromLowest = bestVsLowestGap !== null ? bestVsLowestGap !== 0 : false;

  return (
    <div className="space-y-3">
      <ProductOfferCard
        item={item}
        productHref={productHref}
        favoriteAction={<FavoriteToggleButton productId={item.product.id} variant="icon" />}
      />

      <div className="rounded-[1.5rem] bg-white px-5 py-4 shadow-glow">
        <div className="grid gap-1 text-sm text-neutral-500">
          <span>{item.offers.length} ofertas disponiveis</span>
          <span>Menor preco: {formatPrice(item.lowestPrice)}</span>
          {bestOffer ? <span>Melhor oferta: {formatPrice(bestOffer.price)}</span> : null}
          {bestDiffersFromLowest ? (
            <span>Diferenca para menor preco: {formatPrice(bestVsLowestGap)}</span>
          ) : (
            <span>{hasValidBestPrice && hasValidLowestPrice ? "Melhor oferta coincide com o menor preco." : "Preco em revisao."}</span>
          )}
          {item.bestOfferReason ? <span className="line-clamp-2">Motivo: {item.bestOfferReason}</span> : null}
          {bestOfferSavings > 0 ? <span>Economia no anuncio: {formatPrice(bestOfferSavings)}</span> : null}
        </div>

        {offerId ? (
          <div className="mt-4">
            <CompareListButton productId={item.product.id} offerId={offerId} unitPrice={unitPrice} variant="full" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
