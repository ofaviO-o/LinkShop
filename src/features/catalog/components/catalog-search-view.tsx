import type { CatalogSearchResult } from "@/features/catalog/types/catalog.types";
import { CatalogEmptyState } from "@/features/catalog/components/catalog-empty-state";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { CatalogGrid } from "@/features/catalog/components/catalog-grid";
import { CatalogPagination } from "@/features/catalog/components/catalog-pagination";
import { HomeSearchHero } from "@/features/catalog/components/home-search-hero";
import { formatPrice, isFinitePositiveNumber } from "@/shared/lib/format";
import { SectionHeading } from "@/shared/ui/section-heading";

type CatalogSearchViewProps = {
  result: CatalogSearchResult;
  buildPageHref: (page: number) => string;
};

function hasActiveFilters(result: CatalogSearchResult) {
  const filters = result.appliedFilters;

  return Boolean(
    filters.category ||
      filters.storeId ||
      filters.minPrice !== null ||
      filters.maxPrice !== null ||
      filters.minDiscount > 0 ||
      filters.sort !== "relevance"
  );
}

export function CatalogSearchView({ result, buildPageHref }: CatalogSearchViewProps) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstItem = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastItem = Math.min(result.total, result.page * result.pageSize);
  const validPrices = result.items.map((item) => item.lowestPrice).filter(isFinitePositiveNumber);
  const lowestResultPrice = validPrices.length ? Math.min(...validPrices) : null;

  return (
    <>
      <HomeSearchHero initialQuery={result.appliedFilters.query} />

      <section className="section-shell">
        <SectionHeading
          eyebrow="Busca"
          title={result.appliedFilters.query ? `Resultados para "${result.appliedFilters.query}"` : "Resultados da comparacao"}
          description="Explore o catalogo, refine os filtros e compare rapidamente as melhores ofertas entre marketplaces."
          action={
            <div className="grid gap-2 rounded-[1.5rem] bg-white px-5 py-4 text-sm text-neutral-500 shadow-glow">
              <span>{result.total} produtos encontrados</span>
              <span>
                Exibindo {firstItem} a {lastItem}
              </span>
              {lowestResultPrice !== null ? <span>A partir de {formatPrice(lowestResultPrice)}</span> : null}
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <CatalogFilters
            filters={result.appliedFilters}
            categories={result.availableCategories}
            stores={result.availableStores}
          />

          <div>
            <div className="mb-5 flex flex-wrap gap-3">
              {result.appliedFilters.category ? (
                <span className="rounded-full bg-black/5 px-4 py-2 text-sm text-neutral-700">
                  Categoria: {result.appliedFilters.category}
                </span>
              ) : null}
              {result.appliedFilters.storeId ? (
                <span className="rounded-full bg-lagoon/10 px-4 py-2 text-sm text-lagoon">
                  Marketplace filtrado
                </span>
              ) : null}
              {result.appliedFilters.minDiscount > 0 ? (
                <span className="rounded-full bg-gold px-4 py-2 text-sm text-ink">
                  {result.appliedFilters.minDiscount}%+ de desconto
                </span>
              ) : null}
            </div>

            <CatalogGrid
              items={result.items}
              emptyState={
                <CatalogEmptyState
                  query={result.appliedFilters.query}
                  hasFilters={hasActiveFilters(result)}
                />
              }
            />

            <CatalogPagination
              currentPage={result.page}
              totalPages={totalPages}
              buildPageHref={buildPageHref}
            />
          </div>
        </div>
      </section>
    </>
  );
}
