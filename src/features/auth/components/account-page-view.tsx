"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { catalogService } from "@/features/catalog/services/catalog.service";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { useAuthStore, useCartStore, useFavoritesStore, usePriceWatchStore, useRecentViewsStore } from "@/stores";
import type { CartItem } from "@/features/cart/types/cart.types";
import { getPreferenceOwnerId } from "@/shared/lib/identity";
import { SectionHeading } from "@/shared/ui/section-heading";
import { CatalogGrid } from "@/features/catalog/components/catalog-grid";
import { formatCurrency } from "@/shared/lib/format";
import { getStoreDisplayName } from "@/shared/lib/store";
import { ConfirmationModal } from "@/shared/ui/confirmation-modal";

type AccountTab = "overview" | "favorites" | "cart" | "recent" | "settings";

type CartEntry = {
  cartItem: CartItem;
  catalogItem: CatalogItem | null;
};

const accountTabs: Array<{ id: AccountTab; label: string }> = [
  { id: "overview", label: "Visao geral" },
  { id: "favorites", label: "Favoritos" },
  { id: "cart", label: "Carrinho" },
  { id: "recent", label: "Recentes" },
  { id: "settings", label: "Configuracoes" }
];

function buildInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "LS";
}

function EmptyTabState({
  title,
  description,
  primaryHref,
  primaryLabel
}: {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-glow">
      <h3 className="font-display text-3xl">{title}</h3>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-neutral-600">{description}</p>
      <div className="mt-6 flex justify-center">
        <Link
          href={primaryHref}
          className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          {primaryLabel}
        </Link>
      </div>
    </div>
  );
}

export function AccountPageView() {
  const session = useAuthStore((state) => state.session);
  const signOut = useAuthStore((state) => state.signOut);
  const favorites = useFavoritesStore((state) => state.favorites);
  const removeFavorite = useFavoritesStore((state) => state.removeFavorite);
  const carts = useCartStore((state) => state.carts);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCartByOwner = useCartStore((state) => state.clearCartByOwner);
  const watches = usePriceWatchStore((state) => state.watches);
  const recentViews = useRecentViewsStore((state) => state.recentViews);

  const ownerId = useMemo(() => getPreferenceOwnerId(session), [session]);
  const userFavorites = useMemo(
    () => favorites.filter((favorite) => favorite.userId === ownerId),
    [favorites, ownerId]
  );
  const userCart = useMemo(
    () => carts.find((cart) => cart.ownerId === ownerId) ?? null,
    [carts, ownerId]
  );
  const userWatchCount = useMemo(
    () => watches.filter((watch) => watch.ownerId === ownerId && watch.isActive).length,
    [ownerId, watches]
  );
  const userRecentViews = useMemo(
    () =>
      recentViews
        .filter((entry) => entry.ownerId === ownerId)
        .sort((left, right) => new Date(right.viewedAt).getTime() - new Date(left.viewedAt).getTime()),
    [ownerId, recentViews]
  );

  const [activeTab, setActiveTab] = useState<AccountTab>("overview");
  const [favoriteItems, setFavoriteItems] = useState<CatalogItem[]>([]);
  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [recentItems, setRecentItems] = useState<CatalogItem[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadFavoriteItems() {
      if (!session || !userFavorites.length) {
        if (active) {
          setFavoriteItems([]);
          setFavoritesLoading(false);
        }
        return;
      }

      setFavoritesLoading(true);
      const response = await catalogService.getCatalogItemsByProductIds(
        userFavorites.map((favorite) => favorite.productId)
      );

      if (active) {
        setFavoriteItems(response.ok ? response.data : []);
        setFavoritesLoading(false);
      }
    }

    void loadFavoriteItems();

    return () => {
      active = false;
    };
  }, [session, userFavorites]);

  useEffect(() => {
    let active = true;

    async function loadCartItems() {
      if (!session || !userCart?.items.length) {
        if (active) {
          setCartEntries([]);
          setCartLoading(false);
        }
        return;
      }

      setCartLoading(true);
      const response = await catalogService.getCatalogItemsByProductIds(userCart.items.map((item) => item.productId));
      const itemsByProductId = new Map(
        (response.ok ? response.data : []).map((item) => [item.product.id, item] as const)
      );

      if (active) {
        setCartEntries(
          userCart.items.map((cartItem) => ({
            cartItem,
            catalogItem: itemsByProductId.get(cartItem.productId) ?? null
          }))
        );
        setCartLoading(false);
      }
    }

    void loadCartItems();

    return () => {
      active = false;
    };
  }, [session, userCart]);

  useEffect(() => {
    let active = true;

    async function loadRecentItems() {
      if (!session || !userRecentViews.length) {
        if (active) {
          setRecentItems([]);
          setRecentLoading(false);
        }
        return;
      }

      setRecentLoading(true);
      const recentProductIds = userRecentViews.map((entry) => entry.productId);
      const response = await catalogService.getCatalogItemsByProductIds(recentProductIds);

      if (active) {
        const itemsByProductId = new Map((response.ok ? response.data : []).map((item) => [item.product.id, item] as const));
        setRecentItems(recentProductIds.map((productId) => itemsByProductId.get(productId) ?? null).filter(Boolean) as CatalogItem[]);
        setRecentLoading(false);
      }
    }

    void loadRecentItems();

    return () => {
      active = false;
    };
  }, [session, userRecentViews]);

  const estimatedCurrentTotal = useMemo(
    () =>
      cartEntries.reduce((accumulator, entry) => {
        const unitPrice = entry.catalogItem?.lowestPrice ?? entry.cartItem.unitPrice;
        return accumulator + unitPrice * entry.cartItem.quantity;
      }, 0),
    [cartEntries]
  );

  if (!session) {
    return (
      <section className="section-shell">
        <div className="rounded-[2rem] bg-white p-8 shadow-glow">
          <h1 className="font-display text-4xl">Entre para acessar sua conta.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            Sua area de conta centraliza favoritos, carrinho e configuracoes em um unico painel organizado.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/auth?next=/conta"
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
        eyebrow="Minha conta"
        title="Centro de controle da sua conta"
        description="Acompanhe seus produtos salvos, organize o carrinho e ajuste configuracoes em um fluxo mais claro."
      />

      <div className="mt-6 rounded-[2rem] bg-white p-5 shadow-glow md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-[1.5rem] bg-gradient-to-br from-coral to-orange-400 font-display text-xl font-bold text-white shadow-glow">
              {buildInitials(session.user.name)}
            </div>
            <div>
              <h2 className="font-display text-3xl text-ink">{session.user.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">{session.user.email}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">{session.user.role}</span>
                <span className="rounded-full bg-lagoon/10 px-3 py-1 text-lagoon">
                  Sessao ate {new Date(session.expiresAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className="inline-flex items-center justify-center rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-black/10"
          >
            Editar perfil
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 rounded-[1.75rem] bg-white p-2 shadow-glow">
        {accountTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-ink text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
                : "text-neutral-600 hover:bg-black/5 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === "overview" ? (
          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-[1.75rem] bg-white p-5 shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Favoritos</p>
                <p className="mt-4 font-display text-4xl text-ink">{userFavorites.length}</p>
                <p className="mt-2 text-sm text-neutral-500">Produtos salvos para comparar depois.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("favorites")}
                  className="mt-5 inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                >
                  Abrir favoritos
                </button>
              </article>

              <article className="rounded-[1.75rem] bg-white p-5 shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Carrinho</p>
                <p className="mt-4 font-display text-4xl text-ink">{userCart?.totalItems ?? 0}</p>
                <p className="mt-2 text-sm text-neutral-500">Itens em acompanhamento no seu carrinho.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("cart")}
                  className="mt-5 inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                >
                  Abrir carrinho
                </button>
              </article>

              <article className="rounded-[1.75rem] bg-white p-5 shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Recentes</p>
                <p className="mt-4 font-display text-4xl text-ink">{userRecentViews.length}</p>
                <p className="mt-2 text-sm text-neutral-500">Produtos vistos recentemente para retomar rapido.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("recent")}
                  className="mt-5 inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                >
                  Ver recentes
                </button>
              </article>

              <article className="rounded-[1.75rem] bg-white p-5 shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Alertas</p>
                <p className="mt-4 font-display text-4xl text-ink">{userWatchCount}</p>
                <p className="mt-2 text-sm text-neutral-500">Produtos com acompanhamento de preco ativo.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className="mt-5 inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                >
                  Ver configuracoes
                </button>
              </article>

              <article className="rounded-[1.75rem] bg-gradient-to-br from-ink via-neutral-900 to-lagoon p-5 text-white shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-white/70">Conta</p>
                <p className="mt-4 font-display text-3xl">Continue de onde parou.</p>
                <p className="mt-2 text-sm text-white/75">
                  Retome produtos vistos, volte ao carrinho e ajuste sua conta em um unico lugar.
                </p>
                <Link
                  href="/buscar"
                  className="mt-5 inline-flex items-center rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/18"
                >
                  Continuar navegando
                </Link>
              </article>
            </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-glow md:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-3xl text-ink">Vistos recentemente</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Produtos que voce abriu por ultimo para retomar a comparacao sem perder contexto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("recent")}
                  className="inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                >
                  Ver tudo
                </button>
              </div>

              {recentLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="overflow-hidden rounded-[1.5rem] bg-black/5 p-4">
                      <div className="aspect-square rounded-[1rem] bg-black/10" />
                      <div className="mt-4 h-5 w-3/4 rounded-full bg-black/10" />
                      <div className="mt-2 h-4 w-1/2 rounded-full bg-black/10" />
                    </div>
                  ))}
                </div>
              ) : recentItems.length ? (
                <CatalogGrid items={recentItems.slice(0, 4)} variant="compact" />
              ) : (
                <EmptyTabState
                  title="Nenhum produto visto recentemente."
                  description="Abra produtos durante a navegacao e eles vao aparecer aqui para facilitar a retomada."
                  primaryHref="/buscar"
                  primaryLabel="Explorar catalogo"
                />
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "favorites" ? (
          <div className="rounded-[2rem] bg-white p-5 shadow-glow md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-3xl text-ink">Favoritos</h3>
                <p className="mt-1 text-sm text-neutral-500">Seus produtos salvos para continuar comparando depois.</p>
              </div>
              <span className="rounded-full bg-black/5 px-4 py-2 text-sm text-neutral-600">
                {userFavorites.length} produtos salvos
              </span>
            </div>

            {favoritesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="overflow-hidden rounded-[1.5rem] bg-black/5 p-4">
                    <div className="aspect-square rounded-[1rem] bg-black/10" />
                    <div className="mt-4 h-5 w-3/4 rounded-full bg-black/10" />
                    <div className="mt-2 h-4 w-1/2 rounded-full bg-black/10" />
                  </div>
                ))}
              </div>
            ) : favoriteItems.length ? (
              <>
                <CatalogGrid items={favoriteItems} variant="compact" />
                <div className="mt-6 flex flex-wrap gap-3">
                  {favoriteItems.slice(0, 6).map((item) => (
                    <button
                      key={item.product.id}
                      type="button"
                      onClick={() => void removeFavorite({ userId: ownerId, productId: item.product.id })}
                      className="inline-flex items-center justify-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                    >
                      Remover {item.product.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <EmptyTabState
                title="Nenhum favorito salvo."
                description="Quando voce favoritar produtos durante a navegacao, eles vao aparecer aqui para acesso rapido."
                primaryHref="/buscar"
                primaryLabel="Explorar catalogo"
              />
            )}
          </div>
        ) : null}

        {activeTab === "cart" ? (
          <div className="rounded-[2rem] bg-white p-5 shadow-glow md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-3xl text-ink">Carrinho</h3>
                <p className="mt-1 text-sm text-neutral-500">Revise itens, quantidade e a melhor oferta atual.</p>
              </div>
              <div className="grid gap-1 rounded-[1.25rem] bg-black/5 px-4 py-3 text-sm text-neutral-600">
                <span>{userCart?.totalItems ?? 0} itens</span>
                <span>Total estimado: {formatCurrency(estimatedCurrentTotal)}</span>
              </div>
            </div>

            {cartLoading ? (
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="rounded-[1.5rem] bg-black/5 p-5">
                    <div className="h-5 w-48 rounded-full bg-black/10" />
                    <div className="mt-3 h-4 w-32 rounded-full bg-black/10" />
                  </div>
                ))}
              </div>
            ) : cartEntries.length ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void clearCartByOwner(ownerId)}
                    className="inline-flex items-center justify-center rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-black/10"
                  >
                    Limpar carrinho
                  </button>
                </div>

                {cartEntries.map(({ cartItem, catalogItem }) => {
                  const currentOffer = catalogItem?.bestOffer;
                  const currentUnitPrice = catalogItem?.lowestPrice ?? cartItem.unitPrice;

                  return (
                    <article key={cartItem.id} className="rounded-[1.5rem] border border-black/5 bg-sand/60 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">
                              {catalogItem?.product.category ?? "Produto salvo"}
                            </span>
                            <span className="rounded-full bg-coral/10 px-3 py-1 text-coral">
                              {catalogItem?.offers.length ?? 0} ofertas
                            </span>
                          </div>

                          <h4 className="font-display text-2xl text-ink">
                            {catalogItem?.product.name ?? "Produto indisponivel no catalogo"}
                          </h4>
                          <p className="text-sm text-neutral-500">
                            {currentOffer
                              ? `Melhor oferta em ${getStoreDisplayName(currentOffer.storeId)}`
                              : "Sem oferta disponivel no momento."}
                          </p>
                          <div className="grid gap-1 text-sm text-neutral-600">
                            <span>Preco atual: {formatCurrency(currentUnitPrice)}</span>
                            <span>Quantidade: {cartItem.quantity}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {catalogItem ? (
                            <Link
                              href={`/ofertas/${catalogItem.product.slug}`}
                              className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                            >
                              Abrir produto
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void removeItem({ ownerId, itemId: cartItem.id })}
                            className="inline-flex items-center justify-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                          >
                            Remover item
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyTabState
                title="Seu carrinho esta vazio."
                description="Adicione produtos durante a navegacao para acompanhar quantidade, preco e melhor loja."
                primaryHref="/buscar"
                primaryLabel="Montar meu carrinho"
              />
            )}
          </div>
        ) : null}

        {activeTab === "recent" ? (
          <div className="rounded-[2rem] bg-white p-5 shadow-glow md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-3xl text-ink">Vistos recentemente</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Retome rapidamente os produtos que voce abriu por ultimo no comparador.
                </p>
              </div>
              <span className="rounded-full bg-black/5 px-4 py-2 text-sm text-neutral-600">
                {userRecentViews.length} produtos recentes
              </span>
            </div>

            {recentLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="overflow-hidden rounded-[1.5rem] bg-black/5 p-4">
                    <div className="aspect-square rounded-[1rem] bg-black/10" />
                    <div className="mt-4 h-5 w-3/4 rounded-full bg-black/10" />
                    <div className="mt-2 h-4 w-1/2 rounded-full bg-black/10" />
                  </div>
                ))}
              </div>
            ) : recentItems.length ? (
              <CatalogGrid items={recentItems} variant="compact" />
            ) : (
              <EmptyTabState
                title="Nenhum produto recente ainda."
                description="Quando voce abrir produtos no LinkShop, eles vao aparecer aqui para voce retomar depois."
                primaryHref="/buscar"
                primaryLabel="Explorar catalogo"
              />
            )}
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
            <article className="rounded-[2rem] bg-white p-6 shadow-glow">
              <h3 className="font-display text-3xl text-ink">Configuracoes da conta</h3>
              <p className="mt-2 text-sm text-neutral-500">
                Organize seus dados principais e as acoes mais importantes da conta.
              </p>

              <div className="mt-6 grid gap-4 text-sm text-neutral-600">
                <div className="rounded-[1.25rem] bg-black/5 px-4 py-4">
                  <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-neutral-500">Nome</span>
                  <span className="mt-2 block text-base font-semibold text-ink">{session.user.name}</span>
                </div>
                <div className="rounded-[1.25rem] bg-black/5 px-4 py-4">
                  <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-neutral-500">Email</span>
                  <span className="mt-2 block text-base font-semibold text-ink">{session.user.email}</span>
                </div>
                <div className="rounded-[1.25rem] bg-black/5 px-4 py-4">
                  <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-neutral-500">Criado em</span>
                  <span className="mt-2 block text-base font-semibold text-ink">
                    {new Date(session.user.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            </article>

            <aside className="grid gap-4">
              <div className="rounded-[1.75rem] bg-white p-5 shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-coral">Acoes</p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className="inline-flex items-center justify-center rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-black/10"
                  >
                    Voltar para visao geral
                  </button>
                  <Link
                    href="/auth"
                    className="inline-flex items-center justify-center rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-black/10"
                  >
                    Alterar senha
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsLogoutConfirmOpen(true)}
                    className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                  >
                    Sair da conta
                  </button>
                </div>
              </div>

              <div className="rounded-[1.75rem] bg-gradient-to-br from-ink via-neutral-900 to-lagoon p-5 text-white shadow-glow">
                <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-white/70">Proxima etapa</p>
                <p className="mt-3 text-sm leading-7 text-white/75">
                  Este painel ja organiza identidade, favoritos e carrinho. Ele esta pronto para evoluir depois com historico e configuracoes mais profundas.
                </p>
              </div>
            </aside>
          </div>
        ) : null}
      </div>

      <ConfirmationModal
        open={isLogoutConfirmOpen}
        title="Deseja realmente sair da sua conta?"
        description="Voce sera desconectado desta sessao e podera entrar novamente quando quiser."
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setIsLogoutConfirmOpen(false);
          void signOut();
        }}
        onCancel={() => setIsLogoutConfirmOpen(false)}
      />
    </section>
  );
}
