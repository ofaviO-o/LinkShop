"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  adminMercadoLivreService,
  type AdminMercadoLivreCatalogPreviewSearchResult
} from "@/features/admin/services/admin-mercado-livre.service";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { formatPrice } from "@/shared/lib/format";

type AdminMercadoLivrePreviewGridProps = {
  query: string;
};

const INITIAL_VISIBLE_COUNT = 20;
const MAX_FETCH_RESULTS = 48;
const LOAD_MORE_STEP = 12;

export function AdminMercadoLivrePreviewGrid({ query }: AdminMercadoLivrePreviewGridProps) {
  const session = useAuthStore((state) => state.session);
  const role = session?.user.role ?? "guest";
  const isAdmin = role === "admin";

  const [result, setResult] = useState<AdminMercadoLivreCatalogPreviewSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!isAdmin || !normalizedQuery) {
      setResult(null);
      setError(null);
      setIsLoading(false);
      setVisibleCount(INITIAL_VISIBLE_COUNT);
      return;
    }

    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      setVisibleCount(INITIAL_VISIBLE_COUNT);

      const response = await adminMercadoLivreService.searchProducts(normalizedQuery, MAX_FETCH_RESULTS);

      if (ignore) {
        return;
      }

      if (!response.ok) {
        setResult(null);
        setError(response.error.message);
        setIsLoading(false);
        return;
      }

      setResult(response.data);
      setIsLoading(false);
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [isAdmin, normalizedQuery]);

  const visibleItems = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.items.slice(0, visibleCount);
  }, [result, visibleCount]);

  if (!isAdmin || !normalizedQuery) {
    return null;
  }

  return (
    <section className="mb-8 rounded-[1.5rem] bg-white p-5 shadow-glow">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-coral">Preview Admin</p>
          <h2 className="mt-2 font-display text-3xl text-ink">Resultados ampliados do marketplace</h2>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            Esta secao aparece so para admin e simula uma busca de vitrine mais ampla dentro do site, antes de liberar para os usuarios.
          </p>
        </div>

        <div className="grid gap-1 rounded-[1.25rem] bg-black/[0.03] px-4 py-3 text-sm text-neutral-600">
          <span>{result?.items.length ?? 0} produtos externos encontrados</span>
          <span>Consultando ate {MAX_FETCH_RESULTS} itens por busca</span>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`placeholder-${index}`}
              className="h-[320px] animate-pulse rounded-[1.25rem] border border-black/5 bg-black/[0.04]"
            />
          ))}
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="mt-5 rounded-[1.25rem] border border-coral/20 bg-coral/10 px-4 py-4 text-sm text-coral">
          <p className="font-semibold">Nao foi possivel carregar a vitrine externa.</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {!isLoading && !error && result && !result.items.length ? (
        <div className="mt-5 rounded-[1.25rem] border border-dashed border-black/10 bg-black/[0.02] px-4 py-5 text-sm text-neutral-500">
          Nenhum resultado externo encontrado para "{normalizedQuery}".
        </div>
      ) : null}

      {!isLoading && !error && visibleItems.length ? (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <article
                key={item.externalId}
                className="flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-black/6 bg-white shadow-sm"
              >
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-gradient-to-b from-orange-50 to-neutral-100">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-contain p-4" />
                  ) : (
                    <span className="px-4 text-center text-xs text-neutral-500">Imagem indisponivel</span>
                  )}

                  <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-white/90 px-2 py-1 text-neutral-700">Mercado Livre</span>
                    {item.brand ? (
                      <span className="rounded-full bg-black/75 px-2 py-1 text-white">{item.brand}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    {item.categoryId || "Catalogo"}
                  </p>
                  <h3 className="mt-2 line-clamp-3 min-h-[4.2rem] text-base font-semibold leading-6 text-ink">
                    {item.title}
                  </h3>

                  <div className="mt-4">
                    <p className="text-2xl font-bold text-ink">{formatPrice(item.price)}</p>
                    {item.originalPrice && item.originalPrice > (item.price ?? 0) ? (
                      <p className="mt-1 text-sm text-neutral-400 line-through">{formatPrice(item.originalPrice)}</p>
                    ) : (
                      <p className="mt-1 text-sm text-neutral-500">ID {item.externalId}</p>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {item.canonicalUrl ? (
                      <a
                        href={item.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-black/5"
                      >
                        Abrir produto
                      </a>
                    ) : null}
                    <Link
                      href={`/admin/integracoes/mercado-livre`}
                      className="inline-flex items-center rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    >
                      Revisar no admin
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {result && visibleCount < result.items.length ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((current) => Math.min(current + LOAD_MORE_STEP, result.items.length))}
                className="inline-flex items-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-coral/90"
              >
                Mostrar mais produtos
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
