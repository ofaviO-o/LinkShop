import type { Offer } from "@/features/product/types/offer.types";
import { calculateDiscountPercentage } from "@/shared/lib/commerce";
import { formatPrice, isFinitePositiveNumber } from "@/shared/lib/format";
import { getOfferRedirectHref } from "@/shared/lib/redirect";
import { getAvailabilityLabel, getStoreDisplayName } from "@/shared/lib/store";

type OfferListProps = {
  offers: Offer[];
  bestOfferId?: string;
};

export function OfferList({ offers, bestOfferId }: OfferListProps) {
  if (!offers.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white p-6 text-sm text-neutral-600">
        Ainda nao ha ofertas disponiveis para este produto. Tente novamente em alguns instantes.
      </div>
    );
  }

  const offerPrices = offers.map((offer) => offer.price).filter(isFinitePositiveNumber);
  const lowestPrice = offerPrices.length ? Math.min(...offerPrices) : null;
  const orderedOffers = [...offers].sort((first, second) => {
    if (first.id === bestOfferId) {
      return -1;
    }

    if (second.id === bestOfferId) {
      return 1;
    }

    const firstPrice = isFinitePositiveNumber(first.price) ? first.price : Number.POSITIVE_INFINITY;
    const secondPrice = isFinitePositiveNumber(second.price) ? second.price : Number.POSITIVE_INFINITY;
    return firstPrice - secondPrice;
  });

  return (
    <div className="grid gap-4">
      {orderedOffers.map((offer, index) => {
        const isBestOffer = offer.id === bestOfferId;
        const isLowestPrice = lowestPrice !== null && offer.price === lowestPrice;
        const discount = calculateDiscountPercentage(offer.price, offer.originalPrice);
        const offerTitle = offer.title.trim() || "Oferta sem titulo";
        const sellerName = offer.sellerName.trim() || "Loja parceira";

        return (
          <article
            key={offer.id}
            className={`rounded-[1.5rem] border p-5 transition ${
              isBestOffer
                ? "border-coral bg-gradient-to-r from-coral/10 to-white shadow-glow"
                : "border-black/5 bg-white"
            }`}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-lagoon/10 px-3 py-1 text-lagoon">{getStoreDisplayName(offer.storeId)}</span>
                  {isBestOffer ? (
                    <span className="rounded-full bg-coral px-3 py-1 text-white">Melhor oferta</span>
                  ) : (
                    <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-600">Opcao #{index + 1}</span>
                  )}
                  {isLowestPrice ? (
                    <span className="rounded-full bg-lagoon px-3 py-1 text-white">Menor preco</span>
                  ) : null}
                  {discount > 0 ? (
                    <span className="rounded-full bg-gold px-3 py-1 text-ink">{discount}% OFF</span>
                  ) : null}
                  <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-600">
                    {getAvailabilityLabel(offer.availability)}
                  </span>
                </div>

                <div>
                  <h3 className="line-clamp-2 font-display text-2xl" title={offerTitle}>
                    {offerTitle}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">Vendido por {sellerName}</p>
                </div>

                <div className="grid gap-1 text-sm text-neutral-500">
                  <span>{offer.installmentText ?? "Pagamento a vista"}</span>
                  <span>Frete: {offer.shippingCost != null ? formatPrice(offer.shippingCost) : "Consultar na loja"}</span>
                  {isBestOffer && offer.rankingReason ? <span className="line-clamp-2">{offer.rankingReason}</span> : null}
                </div>
              </div>

              <div className="grid gap-3 md:min-w-[240px] md:justify-items-end">
                <div className={`rounded-2xl px-4 py-3 text-right ${isBestOffer ? "bg-coral/10" : "bg-black/5"}`}>
                  <div className="flex items-end justify-end gap-3">
                    <strong className="font-display text-3xl">{formatPrice(offer.price)}</strong>
                    {offer.originalPrice ? (
                      <span className="text-sm text-neutral-400 line-through">{formatPrice(offer.originalPrice, "")}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    {isBestOffer
                      ? "Escolhida como melhor combinacao de preco e qualidade."
                      : isLowestPrice
                        ? "Este e o menor preco bruto atual."
                        : "Compare antes de sair para a loja."}
                  </p>
                </div>

                <a
                  href={getOfferRedirectHref(offer)}
                  target="_blank"
                  rel="noreferrer noopener sponsored"
                  className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                    isBestOffer ? "bg-coral text-white hover:bg-orange-600" : "bg-ink text-white hover:bg-neutral-800"
                  }`}
                >
                  {isBestOffer ? `Ir para ${getStoreDisplayName(offer.storeId)}` : `Ir para ${getStoreDisplayName(offer.storeId)}`}
                </a>
                <p className="text-xs text-neutral-500">Abre a loja em nova aba.</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
