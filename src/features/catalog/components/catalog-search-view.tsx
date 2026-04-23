import type { CatalogSearchResult } from "@/features/catalog/types/catalog.types";
import { AdminMercadoLivrePreviewGrid } from "@/features/catalog/components/admin-mercado-livre-preview-grid";
import { CatalogEmptyState } from "@/features/catalog/components/catalog-empty-state";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { CatalogGrid } from "@/features/catalog/components/catalog-grid";
import { CatalogPagination } from "@/features/catalog/components/catalog-pagination";
import { formatPrice, isFinitePositiveNumber } from "@/shared/lib/format";
import { FixedRightSidebarLayout } from "@/shared/layout";
import { SectionHeading } from "@/shared/ui/section-heading";
import Link from "next/link";

type CatalogSearchViewProps = {
  result: CatalogSearchResult;
  context: {
    key: "all" | "featured" | "most-bought" | "best-offers" | "category" | "search";
    title: string;
    subtitle: string;
  };
  buildPageHref: (page: number) => string;
};

type CatalogQuickLink = {
  id: string;
  label: string;
  href: string;
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

const sortLabels: Record<CatalogSearchResult["appliedFilters"]["sort"], string> = {
  relevance: "Relevancia",
  "lowest-price": "Menor preco",
  "highest-price": "Maior preco",
  "best-discount": "Maior desconto",
  popularity: "Popularidade"
};

function buildQuickLinks(categories: string[]): CatalogQuickLink[] {
  const categoryLinks = categories.slice(0, 3).map((category) => ({
    id: `category:${category}`,
    label: category,
    href: `/buscar?contexto=categoria&categoria=${encodeURIComponent(category)}`
  }));

  return [
    {
      id: "all",
      label: "Todos",
      href: "/buscar"
    },
    {
      id: "featured",
      label: "Destaques",
      href: "/buscar?contexto=destaques&ordem=relevance"
    },
    {
      id: "most-bought",
      label: "Mais comprados",
      href: "/buscar?contexto=mais-comprados&ordem=popularity"
    },
    ...categoryLinks
  ];
}

function isQuickLinkActive(link: CatalogQuickLink, context: CatalogSearchViewProps["context"], result: CatalogSearchResult) {
  if (link.id === "all") {
    return context.key === "all";
  }

  if (link.id === "featured") {
    return context.key === "featured";
  }

  if (link.id === "most-bought") {
    return context.key === "most-bought";
  }

  if (link.id.startsWith("category:")) {
    const category = link.id.replace("category:", "");
    return context.key === "category" && result.appliedFilters.category === category;
  }

  return false;
}

export function CatalogSearchView({ result, context, buildPageHref }: CatalogSearchViewProps) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstItem = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastItem = Math.min(result.total, result.page * result.pageSize);
  const validPrices = result.items.map((item) => item.lowestPrice).filter(isFinitePositiveNumber);
  const lowestResultPrice = validPrices.length ? Math.min(...validPrices) : null;
  const quickLinks = buildQuickLinks(result.availableCategories);
  const activeFilters = [
    result.appliedFilters.query ? `Busca: ${result.appliedFilters.query}` : null,
    result.appliedFilters.category ? `Categoria: ${result.appliedFilters.category}` : null,
    result.appliedFilters.storeId ? `Loja: ${result.appliedFilters.storeId}` : null,
    result.appliedFilters.minPrice !== null ? `Preco min: ${formatPrice(result.appliedFilters.minPrice)}` : null,
    result.appliedFilters.maxPrice !== null ? `Preco max: ${formatPrice(result.appliedFilters.maxPrice)}` : null,
    result.appliedFilters.minDiscount > 0 ? `${result.appliedFilters.minDiscount}%+ desconto` : null,
    result.appliedFilters.sort !== "relevance" ? `Ordenado por: ${sortLabels[result.appliedFilters.sort]}` : null
  ].filter(Boolean) as string[];

  return (
    <>
      <section className="section-shell mx-auto max-w-[1180px]">
        <SectionHeading
          eyebrow="Catalogo"
          title={context.title}
          description={context.subtitle}
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

        <div className="flex flex-wrap gap-2">
          {quickLinks.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                isQuickLinkActive(link, context, result)
                  ? "bg-coral text-white"
                  : "bg-black/5 text-neutral-700 hover:bg-black/10"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>

      <FixedRightSidebarLayout
        desktopSidebarWidth={340}
        desktopGap={24}
        desktopTopOffset={168}
        desktopMinMainWidth={860}
        collapsedToggleLabel="Filtrar"
        main={
          <div className="section-shell">
            {result.appliedFilters.query ? <AdminMercadoLivrePreviewGrid query={result.appliedFilters.query} /> : null}

            {activeFilters.length ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {activeFilters.map((filter) => (
                  <span key={filter} className="rounded-full bg-black/5 px-4 py-2 text-sm text-neutral-700">
                    {filter}
                  </span>
                ))}
              </div>
            ) : null}

            <CatalogGrid
              items={result.items}
              variant="compact"
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
        }
        sidebar={
          <CatalogFilters
            filters={result.appliedFilters}
            categories={result.availableCategories}
            stores={result.availableStores}
          />
        }
      />
    </>
  );
}
