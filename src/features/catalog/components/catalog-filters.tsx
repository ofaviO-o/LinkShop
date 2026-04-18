"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { CatalogFilters as CatalogFiltersState } from "@/features/catalog/types/catalog.types";
import type { Store } from "@/features/product/types/store.types";

type CatalogFiltersProps = {
  filters: CatalogFiltersState;
  categories: string[];
  stores: Store[];
};

function toInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

export function CatalogFilters({ filters, categories, stores }: CatalogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [draftFilters, setDraftFilters] = useState(filters);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  function updateDraft<K extends keyof CatalogFiltersState>(key: K, value: CatalogFiltersState[K]) {
    setDraftFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function applyFilters() {
    const nextParams = new URLSearchParams();

    if (draftFilters.query) {
      nextParams.set("q", draftFilters.query);
    }

    if (draftFilters.category) {
      nextParams.set("categoria", draftFilters.category);
    }

    if (draftFilters.storeId) {
      nextParams.set("loja", draftFilters.storeId);
    }

    if (draftFilters.minPrice !== null) {
      nextParams.set("precoMin", String(draftFilters.minPrice));
    }

    if (draftFilters.maxPrice !== null) {
      nextParams.set("precoMax", String(draftFilters.maxPrice));
    }

    if (draftFilters.minDiscount > 0) {
      nextParams.set("descontoMin", String(draftFilters.minDiscount));
    }

    if (draftFilters.sort !== "relevance") {
      nextParams.set("ordem", draftFilters.sort);
    }

    router.push(`${pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
  }

  function resetFilters() {
    const nextFilters: CatalogFiltersState = {
      ...filters,
      category: "",
      storeId: "",
      minPrice: null,
      maxPrice: null,
      minDiscount: 0,
      sort: "relevance"
    };

    setDraftFilters(nextFilters);

    const nextParams = new URLSearchParams();

    if (nextFilters.query) {
      nextParams.set("q", nextFilters.query);
    }

    router.push(`${pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
  }

  const fieldClassName =
    "min-w-0 rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-coral/40";

  return (
    <aside className="glass-panel h-fit p-5 md:sticky md:top-28">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-display text-2xl">Refinar produtos</h3>
        <button type="button" onClick={resetFilters} className="text-sm font-medium text-coral">
          Limpar
        </button>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <label className="grid gap-2 text-sm text-neutral-600">
          Buscar por nome
          <input
            type="search"
            value={draftFilters.query}
            onChange={(event) => updateDraft("query", event.target.value)}
            placeholder="Ex.: iPhone, monitor, air fryer"
            className={fieldClassName}
          />
        </label>

        <label className="grid gap-2 text-sm text-neutral-600">
          Marketplace
          <select
            value={draftFilters.storeId}
            onChange={(event) => updateDraft("storeId", event.target.value as CatalogFiltersState["storeId"])}
            className={fieldClassName}
          >
            <option value="">Todos</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm text-neutral-600">
          Categoria
          <select
            value={draftFilters.category}
            onChange={(event) => updateDraft("category", event.target.value)}
            className={fieldClassName}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm text-neutral-600">
          Ordenar por
          <select
            value={draftFilters.sort}
            onChange={(event) => updateDraft("sort", event.target.value as CatalogFiltersState["sort"])}
            className={fieldClassName}
          >
            <option value="relevance">Relevancia</option>
            <option value="lowest-price">Menor preco</option>
            <option value="highest-price">Maior preco</option>
            <option value="best-discount">Maior desconto</option>
            <option value="popularity">Popularidade</option>
          </select>
        </label>

        <details className="rounded-2xl border border-black/10 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Filtros avancados</summary>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-neutral-600">
                Preco minimo
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={toInputValue(draftFilters.minPrice)}
                  onChange={(event) => updateDraft("minPrice", event.target.value ? Number(event.target.value) : null)}
                  className={fieldClassName}
                />
              </label>

              <label className="grid gap-2 text-sm text-neutral-600">
                Preco maximo
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={toInputValue(draftFilters.maxPrice)}
                  onChange={(event) => updateDraft("maxPrice", event.target.value ? Number(event.target.value) : null)}
                  className={fieldClassName}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-neutral-600">
              Desconto minimo
              <select
                value={String(draftFilters.minDiscount)}
                onChange={(event) => updateDraft("minDiscount", Number(event.target.value))}
                className={fieldClassName}
              >
                <option value="0">Qualquer</option>
                <option value="10">10%+</option>
                <option value="20">20%+</option>
                <option value="30">30%+</option>
                <option value="40">40%+</option>
              </select>
            </label>
          </div>
        </details>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Atualizar catalogo
        </button>
      </form>
    </aside>
  );
}
