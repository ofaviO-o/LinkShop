import Link from "next/link";

type CatalogEmptyStateProps = {
  query?: string;
  hasFilters?: boolean;
};

export function CatalogEmptyState({ query, hasFilters = false }: CatalogEmptyStateProps) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-black/10 bg-white px-6 py-14 text-center shadow-glow">
      <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Catalogo vazio</p>
      <h3 className="mt-3 font-display text-3xl leading-tight">Nenhum produto encontrado para este contexto.</h3>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-neutral-600 md:text-base">
        {query
          ? `Nao encontramos produtos para "${query}". Tente um termo mais amplo, outra categoria ou remova parte dos filtros.`
          : "Ajuste os filtros para ampliar a exploracao do catalogo e descobrir novas ofertas."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          href="/buscar"
          className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 font-semibold text-white transition hover:bg-neutral-800"
        >
          Ver todos os produtos
        </Link>
        {hasFilters ? (
          <Link
            href={query ? `/buscar?q=${encodeURIComponent(query)}` : "/buscar"}
            className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            Limpar refinamentos
          </Link>
        ) : null}
      </div>

      <div className="mt-8 grid gap-3 text-left text-sm text-neutral-500 md:grid-cols-3">
        <div className="rounded-2xl bg-orange-50 p-4">Use o nome do produto ou da marca para uma busca mais direta.</div>
        <div className="rounded-2xl bg-teal-50 p-4">Comece sem faixa de preco e aplique filtros depois de ver os resultados.</div>
        <div className="rounded-2xl bg-neutral-100 p-4">Explore categorias para descobrir produtos similares e novas ofertas.</div>
      </div>
    </div>
  );
}
