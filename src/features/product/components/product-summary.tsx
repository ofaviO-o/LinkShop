import Image from "next/image";

import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { calculateDiscountPercentage } from "@/shared/lib/commerce";
import { formatPrice, getSafeImageUrl, isFinitePositiveNumber } from "@/shared/lib/format";
import { getOfferRedirectHref } from "@/shared/lib/redirect";
import { getStoreDisplayName } from "@/shared/lib/store";

import { ProductIntentActions } from "@/features/product/components/product-intent-actions";

type ProductSummaryProps = {
  item: CatalogItem;
};

function normalizeQualityScore(score: number | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return null;
  }

  const normalized = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function getQualityLabel(score: number | undefined) {
  const normalized = normalizeQualityScore(score);

  if (normalized === null) {
    return "Em avaliacao";
  }

  if (normalized >= 85) {
    return "Alta";
  }

  if (normalized >= 70) {
    return "Boa";
  }

  return "Regular";
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

export function ProductSummary({ item }: ProductSummaryProps) {
  const bestOffer = item.bestOffer;
  const productName = item.product.name.trim() || "Produto sem nome";
  const productDescription = item.product.description.trim() || "Detalhes deste produto em atualizacao.";
  const productBrand = item.product.brand.trim() || "Marca nao informada";
  const safeImageUrl = getSafeImageUrl(item.product.thumbnailUrl);
  const headlineDiscount = bestOffer ? calculateDiscountPercentage(bestOffer.price, bestOffer.originalPrice) : 0;
  const bestOfferSavings = bestOffer?.originalPrice ? Math.max(bestOffer.originalPrice - bestOffer.price, 0) : 0;
  const hasValidBestPrice = isFinitePositiveNumber(bestOffer?.price);
  const hasValidLowestPrice = isFinitePositiveNumber(item.lowestPrice);
  const hasValidHighestPrice = isFinitePositiveNumber(item.highestPrice);
  const crossStoreSavings = hasValidHighestPrice && hasValidLowestPrice ? item.highestPrice - item.lowestPrice : null;
  const bestDiffersFromLowest = hasValidBestPrice && hasValidLowestPrice && bestOffer ? bestOffer.price !== item.lowestPrice : false;
  const rankingReason = bestOffer?.rankingReason ?? item.bestOfferReason ?? null;
  const bestOfferSeller = bestOffer?.sellerName?.trim() || "Loja parceira";
  const bestOfferStore = bestOffer ? getStoreDisplayName(bestOffer.storeId) : "Loja indisponivel";
  const bestOfferPrice = bestOffer?.price ?? item.lowestPrice;
  const bestQualityLabel = getQualityLabel(bestOffer?.qualityScore);
  const bestQualityScore = normalizeQualityScore(bestOffer?.qualityScore);
  const bestOfferUpdatedAt = formatUpdatedAt(bestOffer?.lastSyncedAt);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)]">
      <article className="overflow-hidden rounded-[2rem] bg-white shadow-glow">
        <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="relative min-h-[320px] overflow-hidden rounded-[1.5rem] bg-gradient-to-b from-orange-50 to-neutral-100">
            {safeImageUrl ? (
              <Image
                src={safeImageUrl}
                alt={productName}
                fill
                sizes="(max-width: 1024px) 100vw, 320px"
                className="object-contain p-4"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-neutral-500">
                Imagem indisponivel
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">{item.product.category}</span>
              <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">{productBrand}</span>
              <span className="rounded-full bg-coral/10 px-3 py-1 text-coral">{item.offers.length} ofertas</span>
              {headlineDiscount > 0 ? (
                <span className="rounded-full bg-gold px-3 py-1 text-ink">{headlineDiscount}% OFF</span>
              ) : null}
            </div>

            <h2 className="mt-4 font-display text-4xl leading-tight md:text-5xl">{productName}</h2>
            <p className="mt-3 line-clamp-4 text-sm leading-7 text-neutral-600">{productDescription}</p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.5rem] bg-orange-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">Melhor oferta atual</p>
                <strong className="mt-2 block font-display text-3xl text-ink">
                  {formatPrice(bestOfferPrice)}
                </strong>
                <p className="mt-2 text-sm text-neutral-600">
                  Melhor oportunidade em {bestOfferStore}.
                </p>
              </div>

              <div className="rounded-[1.5rem] bg-neutral-100 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Menor preco bruto</p>
                <strong className="mt-2 block font-display text-3xl text-ink">{formatPrice(item.lowestPrice)}</strong>
                <p className="mt-2 text-sm text-neutral-600">Referencial para comparar todas as ofertas.</p>
              </div>

              <div className="rounded-[1.5rem] bg-neutral-100 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Economia possivel</p>
                <strong className="mt-2 block font-display text-3xl text-ink">
                  {formatPrice(crossStoreSavings !== null ? Math.max(crossStoreSavings, 0) : null)}
                </strong>
                <p className="mt-2 text-sm text-neutral-600">Diferenca entre a menor e a maior oferta disponivel hoje.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-2 text-sm text-neutral-500">
              <span>Loja da melhor oferta: {bestOfferStore}</span>
              <span>Ultima atualizacao da oferta: {bestOfferUpdatedAt}</span>
              <span>Qualidade da oferta: {bestQualityLabel}</span>
              {bestDiffersFromLowest && bestOffer ? (
                <span>
                  Melhor oferta x menor preco: {formatPrice(bestOffer.price - item.lowestPrice)}
                </span>
              ) : (
                <span>{hasValidBestPrice && hasValidLowestPrice ? "Melhor oferta coincide com o menor preco bruto." : "Comparacao de preco em revisao."}</span>
              )}
              <span>Maior preco encontrado: {formatPrice(item.highestPrice, "Nao informado")}</span>
              <span>Melhor desconto atual: {Math.max(item.bestDiscountPercentage, 0)}%</span>
              {bestOfferSavings > 0 ? <span>Economia no melhor anuncio: {formatPrice(bestOfferSavings)}</span> : null}
              {rankingReason ? <span>Motivo da melhor oferta: {rankingReason}</span> : null}
            </div>
          </div>
        </div>
      </article>

      <aside className="rounded-[2rem] bg-gradient-to-br from-ink via-neutral-900 to-lagoon p-6 text-white shadow-glow">
        <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Oferta recomendada</p>
        <h3 className="mt-3 font-display text-3xl leading-tight">{bestOffer ? bestOfferStore : "Oferta indisponivel"}</h3>
        <p className="mt-3 text-sm leading-7 text-white/75">
          Escolha sugerida pelo ranking de qualidade, preco e disponibilidade para acelerar sua decisao.
        </p>

        {bestOffer ? (
          <>
            <div className="mt-6 rounded-[1.5rem] bg-white/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white/70">Melhor preco para compra</p>
                  <strong className="font-display text-4xl">{formatPrice(bestOffer.price)}</strong>
                </div>
                {bestOffer.originalPrice ? (
                  <span className="text-sm text-white/60 line-through">{formatPrice(bestOffer.originalPrice, "")}</span>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-white/75">Vendido por {bestOfferSeller}</p>
              <p className="mt-2 text-sm text-white/75">{bestOffer.installmentText ?? "Pagamento a vista"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white/15 px-3 py-1">Qualidade: {bestQualityLabel}{bestQualityScore !== null ? ` (${bestQualityScore}/100)` : ""}</span>
                <span className="rounded-full bg-white/15 px-3 py-1">Atualizada: {bestOfferUpdatedAt}</span>
              </div>
              {bestDiffersFromLowest ? (
                <p className="mt-2 text-sm text-white/75">
                  Menor preco bruto no mercado: {formatPrice(item.lowestPrice)}.
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/75">Esta recomendacao tambem e o menor preco bruto atual.</p>
              )}
              {bestOfferSavings > 0 ? (
                <p className="mt-2 text-sm text-white/75">Economia neste anuncio: {formatPrice(bestOfferSavings)}.</p>
              ) : null}
              {rankingReason ? <p className="mt-2 text-sm text-white/75">{rankingReason}</p> : null}
            </div>

            <a
              href={getOfferRedirectHref(bestOffer)}
              target="_blank"
              rel="noreferrer noopener sponsored"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-coral px-5 py-4 text-base font-semibold text-white transition hover:bg-orange-600"
            >
              Ir para oferta na {bestOfferStore}
            </a>
            <p className="mt-3 text-center text-xs text-white/70">Abre em nova aba com rastreamento de parceiro para suportar o LinkShop.</p>
          </>
        ) : (
          <div className="mt-6 rounded-[1.5rem] bg-white/10 p-5 text-sm text-white/80">
            Ainda nao ha oferta valida para este produto. Tente novamente em alguns instantes.
          </div>
        )}

        <div className="mt-6">
          <ProductIntentActions
            productId={item.product.id}
            offerId={item.bestOffer?.id}
            unitPrice={bestOfferPrice}
            layout="stack"
            includePriceWatch
          />
        </div>
      </aside>
    </div>
  );
}
