import { CompareListButton } from "@/features/cart/components/compare-list-button";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { FavoriteToggleButton } from "@/features/favorites/components/favorite-toggle-button";
import { ProductOfferCard } from "@/features/product";
import { formatPrice, isFinitePositiveNumber } from "@/shared/lib/format";

type CatalogProductCardProps = {
  item: CatalogItem;
};

export function CatalogProductCard({ item }: CatalogProductCardProps) {
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
