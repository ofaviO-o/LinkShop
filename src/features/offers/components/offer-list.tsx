import type { Offer } from "@/features/product/types/offer.types";
import { calculateDiscountPercentage } from "@/shared/lib/commerce";
import { formatPrice, isFinitePositiveNumber } from "@/shared/lib/format";
import { getOfferRedirectHref } from "@/shared/lib/redirect";
import { getAvailabilityLabel, getStoreDisplayName } from "@/shared/lib/store";

type OfferListProps = {
  offers: Offer[];
  bestOfferId?: string;
  context?: {
    source?: string;
    category?: string;
    searchTerm?: string;
    sectionType?: string;
  };
};

function normalizeQualityScore(score: number | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return null;
  }

  const normalized = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function formatUpdatedAt(value: string | undefined) {
  if (!value) {
    return "Nao informado";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

export function OfferList({ offers, bestOfferId, context }: OfferListProps) {
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
        const qualityScore = normalizeQualityScore(offer.qualityScore);
        const updatedAt = formatUpdatedAt(offer.lastSyncedAt);

        return (
          <article
            key={offer.id}
            className={`rounded-[1.5rem] border p-5 transition ${
              isBestOffer
                ? "border-coral bg-gradient-to-r from-coral/10 to-white shadow-glow"
                : "border-black/5 bg-white"
            }`}
          >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4 xl:min-w-0 xl:flex-1">
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
                  {qualityScore !== null ? (
                    <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">Qualidade {qualityScore}/100</span>
                  ) : null}
                </div>

                <div>
                  <h3 className="line-clamp-2 font-display text-2xl" title={offerTitle}>
                    {offerTitle}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">Vendido por {sellerName}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1rem] bg-black/5 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Condicao</p>
                    <p className="mt-2 text-sm font-medium text-ink">{offer.installmentText ?? "Pagamento a vista"}</p>
                  </div>
                  <div className="rounded-[1rem] bg-black/5 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Frete</p>
                    <p className="mt-2 text-sm font-medium text-ink">
                      {offer.shippingCost != null ? formatPrice(offer.shippingCost) : "Consultar na loja"}
                    </p>
                  </div>
                  <div className="rounded-[1rem] bg-black/5 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Atualizacao</p>
                    <p className="mt-2 text-sm font-medium text-ink">{updatedAt}</p>
                  </div>
                </div>

                {isBestOffer && offer.rankingReason ? (
                  <div className="rounded-[1rem] border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-neutral-600">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-coral">Motivo da recomendacao</p>
                    <p className="mt-2 line-clamp-2">{offer.rankingReason}</p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 xl:min-w-[270px] xl:max-w-[270px] xl:justify-items-end">
                <div className={`w-full rounded-2xl px-4 py-4 text-left xl:text-right ${isBestOffer ? "bg-coral/10" : "bg-black/5"}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Preco final</p>
                  <div className="mt-3 flex items-end gap-3 xl:justify-end">
                    <strong className="font-display text-3xl">{formatPrice(offer.price)}</strong>
                    {offer.originalPrice ? (
                      <span className="text-sm text-neutral-400 line-through">{formatPrice(offer.originalPrice, "")}</span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-neutral-500">
                    {isBestOffer
                      ? "Escolhida como melhor combinacao de preco, qualidade e disponibilidade."
                      : isLowestPrice
                        ? "Este e o menor preco bruto atual."
                        : "Compare com a recomendada antes de sair para a loja."}
                  </p>
                </div>

                <a
                  href={getOfferRedirectHref(offer, {
                    source: context?.source ?? "produto_detalhe",
                    position: index + 1,
                    category: context?.category,
                    searchTerm: context?.searchTerm,
                    sectionType: context?.sectionType ?? "lista_ofertas"
                  })}
                  target="_blank"
                  rel="noreferrer noopener sponsored"
                  className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                    isBestOffer ? "bg-coral text-white hover:bg-orange-600" : "bg-ink text-white hover:bg-neutral-800"
                  }`}
                >
                  Ir para oferta na {getStoreDisplayName(offer.storeId)}
                </a>
                <p className="text-xs text-neutral-500 xl:text-right">Nova aba com redirecionamento de parceiro.</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
