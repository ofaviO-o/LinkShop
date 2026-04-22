"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { catalogService } from "@/features/catalog/services/catalog.service";
import { useAuthStore, useFavoritesStore } from "@/stores";
import { getPreferenceOwnerId } from "@/shared/lib/identity";
import { SectionHeading } from "@/shared/ui/section-heading";

import { CatalogGrid } from "@/features/catalog/components/catalog-grid";
import { CatalogEmptyState } from "@/features/catalog/components/catalog-empty-state";

export function FavoritesPageView() {
  const session = useAuthStore((state) => state.session);
  const ownerId = useMemo(() => getPreferenceOwnerId(session), [session]);
  const allFavorites = useFavoritesStore((state) => state.favorites);
  const favorites = useMemo(
    () => allFavorites.filter((favorite) => favorite.userId === ownerId),
    [allFavorites, ownerId]
  );
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadFavorites() {
      if (!session) {
        if (active) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      if (!favorites.length) {
        if (active) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const response = await catalogService.getCatalogItemsByProductIds(favorites.map((favorite) => favorite.productId));

      if (active) {
        setItems(response.ok ? response.data : []);
        setLoading(false);
      }
    }

    void loadFavorites();

    return () => {
      active = false;
    };
  }, [favorites, session]);

  if (!session) {
    return (
      <section className="section-shell">
        <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-glow">
          <h3 className="font-display text-3xl">Entre para ver seus favoritos.</h3>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            Para salvar e visualizar produtos favoritos com seguranca, faca login ou crie sua conta.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth?next=/favoritos"
              className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Entrar
            </Link>
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-black/10"
            >
              Explorar catalogo
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell">
      <SectionHeading
        eyebrow="Favoritos"
        title="Produtos salvos para voltar depois"
        description="Monte sua vitrine pessoal de acompanhamento e retome a comparacao com mais rapidez."
        action={<span className="text-sm text-neutral-500">{favorites.length} produtos salvos</span>}
      />

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-[1.75rem] bg-white shadow-glow">
              <div className="aspect-[1/0.82] bg-black/10" />
              <div className="grid gap-4 p-5">
                <div className="h-4 w-32 rounded-full bg-black/10" />
                <div className="h-8 w-3/4 rounded-full bg-black/10" />
                <div className="h-4 w-full rounded-full bg-black/10" />
                <div className="h-12 w-full rounded-[1rem] bg-black/10" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CatalogGrid
          items={items}
          emptyState={
            <div className="space-y-6">
              <CatalogEmptyState />
              <div className="flex justify-center">
                <Link
                  href="/buscar"
                  className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                >
                  Explorar catalogo
                </Link>
              </div>
            </div>
          }
        />
      )}
    </section>
  );
}
