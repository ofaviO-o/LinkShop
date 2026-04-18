import type { Metadata } from "next";

import { CatalogSearchView } from "@/features/catalog";
import { catalogService } from "@/features/catalog/services/catalog.service";
import type { CatalogFilters } from "@/features/catalog/types/catalog.types";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseNumber(value: string | string[] | undefined) {
  const normalized = getSingleParam(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePage(value: string | string[] | undefined) {
  const normalized = Number(getSingleParam(value) || 1);

  if (!Number.isFinite(normalized) || normalized < 1) {
    return 1;
  }

  return Math.floor(normalized);
}

function parseFilters(params: Record<string, string | string[] | undefined>): CatalogFilters {
  const sort = getSingleParam(params.ordem) as CatalogFilters["sort"];
  const storeId = getSingleParam(params.loja) as CatalogFilters["storeId"];
  const minDiscount = Number(getSingleParam(params.descontoMin) || 0);

  return {
    query: getSingleParam(params.q),
    category: getSingleParam(params.categoria),
    storeId: storeId || "",
    minPrice: parseNumber(params.precoMin),
    maxPrice: parseNumber(params.precoMax),
    minDiscount: Number.isFinite(minDiscount) ? minDiscount : 0,
    sort: sort || "relevance"
  };
}

type CatalogContextKey = "all" | "featured" | "most-bought" | "best-offers" | "category" | "search";

type CatalogPageContext = {
  key: CatalogContextKey;
  title: string;
  subtitle: string;
};

function parseCatalogContext(params: Record<string, string | string[] | undefined>) {
  return getSingleParam(params.contexto);
}

function resolveCatalogContext(
  filters: CatalogFilters,
  contextParam: string
): CatalogPageContext {
  if (filters.query) {
    return {
      key: "search",
      title: "Produtos",
      subtitle: `Resultado para: "${filters.query}"`
    };
  }

  if (filters.category) {
    return {
      key: "category",
      title: "Produtos",
      subtitle: `Categoria: ${filters.category}`
    };
  }

  if (contextParam === "destaques") {
    return {
      key: "featured",
      title: "Produtos",
      subtitle: "Mostrando destaques"
    };
  }

  if (contextParam === "mais-comprados") {
    return {
      key: "most-bought",
      title: "Produtos",
      subtitle: "Mostrando mais comprados"
    };
  }

  if (contextParam === "melhores-ofertas") {
    return {
      key: "best-offers",
      title: "Produtos",
      subtitle: "Mostrando melhores ofertas"
    };
  }

  return {
    key: "all",
    title: "Produtos",
    subtitle: "Todos os produtos"
  };
}

function buildSearchMetadata(filters: CatalogFilters, page: number): Metadata {
  const scope = filters.query
    ? `Produtos para ${filters.query}`
    : filters.category
      ? `Produtos em ${filters.category}`
      : "Produtos";

  const descriptionParts = [
    "Explore o catalogo de produtos do LinkShop, refine filtros e compare ofertas entre marketplaces."
  ];

  if (filters.storeId) {
    descriptionParts.push("Filtro de loja aplicado.");
  }

  if (filters.minDiscount > 0) {
    descriptionParts.push(`Descontos de ${filters.minDiscount}% ou mais.`);
  }

  if (page > 1) {
    descriptionParts.push(`Pagina ${page} dos resultados.`);
  }

  return {
    title: scope,
    description: descriptionParts.join(" ")
  };
}

function buildPageHref(
  params: Record<string, string | string[] | undefined>,
  page: number
) {
  const nextParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const single = getSingleParam(value);

    if (single && key !== "pagina") {
      nextParams.set(key, single);
    }
  });

  if (page > 1) {
    nextParams.set("pagina", String(page));
  }

  return `/buscar${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const filters = parseFilters(resolvedParams);
  const page = parsePage(resolvedParams.pagina);

  return buildSearchMetadata(filters, page);
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedParams = await searchParams;
  const filters = parseFilters(resolvedParams);
  const contextParam = parseCatalogContext(resolvedParams);
  const context = resolveCatalogContext(filters, contextParam);
  const page = parsePage(resolvedParams.pagina);
  const response = await catalogService.searchCatalog({
    ...filters,
    page,
    pageSize: 12
  });

  if (!response.ok) {
    throw new Error(response.error.message);
  }

  return (
    <CatalogSearchView
      result={response.data}
      context={context}
      buildPageHref={(targetPage) => buildPageHref(resolvedParams, targetPage)}
    />
  );
}
