import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { catalogService } from "@/features/catalog/services/catalog.service";
import { OfferList, offersService } from "@/features/offers";
import { PriceWatchSettingsCard } from "@/features/price-alerts";
import { ProductPriceHistory, ProductSummary } from "@/features/product";
import { formatPrice } from "@/shared/lib/format";
import { getStoreDisplayName } from "@/shared/lib/store";
import { SectionHeading } from "@/shared/ui/section-heading";

type ProductOfferPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const response = await catalogService.getAllCatalogItems();

  if (!response.ok) {
    return [];
  }

  return response.data.map((item) => ({
    slug: item.product.slug
  }));
}

export async function generateMetadata({ params }: ProductOfferPageProps): Promise<Metadata> {
  const { slug } = await params;
  const response = await catalogService.getCatalogItemBySlug(slug);

  if (!response.ok || !response.data) {
    return {
      title: "Oferta nao encontrada"
    };
  }

  const item = response.data;
  const bestOffer = item.bestOffer;
  const productName = item.product.name.trim() || "Produto";
  const title = `${productName}: compare ${item.offers.length} ofertas`;
  const description = bestOffer
    ? `Menor preco atual em ${getStoreDisplayName(bestOffer.storeId)} por ${formatPrice(item.lowestPrice)}. Veja historico de preco e acompanhe futuras quedas.`
    : item.product.description || "Compare ofertas em diferentes lojas para encontrar a melhor opcao.";

  return {
    title,
    description
  };
}

export default async function ProductOfferPage({ params }: ProductOfferPageProps) {
  const { slug } = await params;
  const itemResponse = await catalogService.getCatalogItemBySlug(slug);

  if (!itemResponse.ok || !itemResponse.data) {
    notFound();
  }

  const item = itemResponse.data;
  const offersResponse = await offersService.getOffersByProductId(item.product.id);
  const bestOfferResponse = await offersService.getBestOfferByProductId(item.product.id);
  const priceHistoryResponse = await offersService.getProductPriceHistorySummary(item.product.id);

  if (!offersResponse.ok) {
    throw new Error(offersResponse.error.message);
  }

  if (!bestOfferResponse.ok) {
    throw new Error(bestOfferResponse.error.message);
  }

  if (!priceHistoryResponse.ok) {
    throw new Error(priceHistoryResponse.error.message);
  }

  const bestOffer = bestOfferResponse.data;
  const potentialSavings = Math.max(item.highestPrice - item.lowestPrice, 0);
  const bestDiffersFromLowest = bestOffer ? bestOffer.price !== item.lowestPrice : false;

  return (
    <>
      <section className="section-shell">
        <SectionHeading
          eyebrow="Produto"
          title={item.product.name}
          description="Analise rapidamente a melhor oferta, confira o menor preco do mercado e avance para a loja com mais confianca."
          action={
            <div className="grid gap-2 rounded-[1.5rem] bg-white px-5 py-4 text-sm text-neutral-500 shadow-glow">
              <span>{offersResponse.data.length} ofertas encontradas</span>
              <span>
                Melhor oferta: {bestOffer ? formatPrice(bestOffer.price) : formatPrice(item.lowestPrice)}
              </span>
              <span>Menor preco: {formatPrice(item.lowestPrice)}</span>
              {bestDiffersFromLowest && bestOffer ? (
                <span>Melhor oferta x menor preco: {formatPrice(bestOffer.price - item.lowestPrice)}</span>
              ) : (
                <span>Melhor oferta coincide com o menor preco.</span>
              )}
              <span>Economia possivel: {formatPrice(potentialSavings)}</span>
            </div>
          }
        />

        <ProductSummary item={item} />
      </section>

      <section className="section-shell">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ProductPriceHistory summary={priceHistoryResponse.data} currentPriceFallback={item.lowestPrice} />
          <PriceWatchSettingsCard
            productId={item.product.id}
            productName={item.product.name}
            currentPrice={item.lowestPrice}
          />
        </div>
      </section>

      <section className="section-shell">
        <SectionHeading
          eyebrow="Ofertas"
          title="Comparacao entre marketplaces"
          description={
            bestOffer
              ? `A melhor oportunidade atual esta em ${getStoreDisplayName(bestOffer.storeId)}${
                  bestDiffersFromLowest ? ", com recomendacao de qualidade mesmo acima do menor preco bruto." : "."
                } Compare com as demais lojas antes de clicar na oferta.`
              : "Cada oferta mostra loja, preco e acesso direto para voce finalizar na plataforma de origem."
          }
          action={
            <div className="grid gap-1 text-right text-sm text-neutral-500">
              <span>{offersResponse.data.length} ofertas comparaveis</span>
              <span>CTAs com redirecionamento rastreado por parceiro</span>
            </div>
          }
        />

        <OfferList offers={offersResponse.data} bestOfferId={bestOffer?.id} />
      </section>
    </>
  );
}
