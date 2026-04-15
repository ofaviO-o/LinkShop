"use client";

import { useMemo, useState } from "react";

import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import type { StoreId } from "@/features/product/types/store.types";
import { formatCurrency, normalizeText } from "@/shared/lib/format";

type AdminProductTableProps = {
  items: CatalogItem[];
  importedProductIds?: string[];
  onEdit: (item: CatalogItem) => void;
  onDelete: (productId: string) => void;
};

type AdminTableSort = "recent" | "name" | "price";

function getStoreLabel(storeId: StoreId) {
  switch (storeId) {
    case "amazon":
      return "Amazon";
    case "mercado-livre":
      return "Mercado Livre";
    case "shopee":
      return "Shopee";
    default:
      return storeId;
  }
}

function getMostRecentSyncTimestamp(item: CatalogItem): number {
  return item.offers.reduce((latest, offer) => {
    const current = Date.parse(offer.lastSyncedAt);
    if (Number.isNaN(current)) {
      return latest;
    }
    return Math.max(latest, current);
  }, 0);
}

export function AdminProductTable({ items, importedProductIds = [], onEdit, onDelete }: AdminProductTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState<StoreId | "all">("all");
  const [sortBy, setSortBy] = useState<AdminTableSort>("recent");

  const importedSet = useMemo(() => new Set(importedProductIds), [importedProductIds]);

  const availableStores = useMemo(() => {
    const storeSet = new Set<StoreId>();
    items.forEach((item) => {
      item.storeIds.forEach((storeId) => storeSet.add(storeId));
    });

    return [...storeSet].sort((first, second) => getStoreLabel(first).localeCompare(getStoreLabel(second), "pt-BR"));
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeText(searchQuery.trim());

    const visible = items.filter((item) => {
      const matchesQuery = !normalizedQuery || normalizeText(item.product.name).includes(normalizedQuery);
      const matchesStore = storeFilter === "all" || item.storeIds.includes(storeFilter);
      return matchesQuery && matchesStore;
    });

    return visible.sort((first, second) => {
      if (sortBy === "name") {
        return first.product.name.localeCompare(second.product.name, "pt-BR");
      }

      if (sortBy === "price") {
        return first.lowestPrice - second.lowestPrice;
      }

      return getMostRecentSyncTimestamp(second) - getMostRecentSyncTimestamp(first);
    });
  }, [items, searchQuery, sortBy, storeFilter]);

  return (
    <div className="glass-panel p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">Itens cadastrados</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {filteredItems.length} de {items.length} itens visiveis no catalogo
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar por nome"
            className="min-w-[190px] rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none transition focus:border-coral/40"
          />
          <select
            value={storeFilter}
            onChange={(event) => setStoreFilter(event.target.value as StoreId | "all")}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none transition focus:border-coral/40"
          >
            <option value="all">Todas as lojas</option>
            {availableStores.map((storeId) => (
              <option key={storeId} value={storeId}>
                {getStoreLabel(storeId)}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as AdminTableSort)}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none transition focus:border-coral/40"
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Nome</option>
            <option value="price">Preco</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredItems.length ? (
          filteredItems.map((item) => (
            <article key={item.product.id} className="rounded-[1.5rem] border border-black/5 bg-white p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    {item.storeIds.map((storeId) => (
                      <span key={storeId} className="rounded-full bg-lagoon/10 px-3 py-1 text-lagoon">
                        {getStoreLabel(storeId)}
                      </span>
                    ))}
                    <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">{item.product.category}</span>
                    {item.offers.some((offer) => offer.isFeatured) ? (
                      <span className="rounded-full bg-coral/10 px-3 py-1 text-coral">Destaque</span>
                    ) : null}
                    {importedSet.has(item.product.id) ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Importado na sessao</span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-display text-2xl">{item.product.name}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-600">{item.product.description}</p>
                  <p className="mt-3 text-sm text-neutral-500">
                    {formatCurrency(item.lowestPrice)}
                    {item.bestDiscountPercentage ? ` • ${item.bestDiscountPercentage}% OFF` : ""}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="rounded-full bg-lagoon/10 px-4 py-2 text-sm font-semibold text-lagoon"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.product.id)}
                    className="rounded-full bg-coral/10 px-4 py-2 text-sm font-semibold text-coral"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-black/5 p-6 text-sm text-neutral-600">
            Nenhum item encontrado com os filtros atuais.
          </div>
        )}
      </div>
    </div>
  );
}
