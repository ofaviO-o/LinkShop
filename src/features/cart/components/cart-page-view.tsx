"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { CartItem } from "@/features/cart/types/cart.types";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { catalogService } from "@/features/catalog/services/catalog.service";
import { useAuthStore, useCartStore } from "@/stores";
import { formatCurrency } from "@/shared/lib/format";
import { getPreferenceOwnerId } from "@/shared/lib/identity";
import { getOfferRedirectHref } from "@/shared/lib/redirect";
import { getStoreDisplayName } from "@/shared/lib/store";
import { SectionHeading } from "@/shared/ui/section-heading";

type CartEntry = {
  cartItem: CartItem;
  catalogItem: CatalogItem | null;
};

export function CartPageView() {
  const session = useAuthStore((state) => state.session);
  const carts = useCartStore((state) => state.carts);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCartByOwner = useCartStore((state) => state.clearCartByOwner);
  const ownerId = useMemo(() => getPreferenceOwnerId(session), [session]);
  const cart = useMemo(() => carts.find((entry) => entry.ownerId === ownerId) ?? null, [carts, ownerId]);
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCartItems() {
      if (!session) {
        if (active) {
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      if (!cart?.items.length) {
        if (active) {
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const response = await catalogService.getCatalogItemsByProductIds(cart.items.map((item) => item.productId));
      const itemsByProductId = new Map(
        (response.ok ? response.data : []).map((item) => [item.product.id, item] as const)
      );

      if (active) {
        setEntries(
          cart.items.map((cartItem) => ({
            cartItem,
            catalogItem: itemsByProductId.get(cartItem.productId) ?? null
          }))
        );
        setLoading(false);
      }
    }

    void loadCartItems();

    return () => {
      active = false;
    };
  }, [cart, session]);

  const estimatedCurrentTotal = useMemo(
    () =>
      entries.reduce((accumulator, entry) => {
        const unitPrice = entry.catalogItem?.lowestPrice ?? entry.cartItem.unitPrice;
        return accumulator + unitPrice * entry.cartItem.quantity;
      }, 0),
    [entries]
  );

  if (!session) {
    return (
      <section className="section-shell">
        <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-glow">
          <h3 className="font-display text-3xl">Entre para ver seu carrinho.</h3>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            Para salvar e visualizar produtos do carrinho com seguranca, faca login ou crie sua conta.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth?next=/lista"
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
        eyebrow="Carrinho"
        title="Produtos que voce quer acompanhar"
        description="Use este carrinho comparativo leve para revisar itens, ajustar quantidade e seguir para a melhor loja no momento certo."
        action={
          <div className="grid gap-2 rounded-[1.5rem] bg-white px-5 py-4 text-sm text-neutral-500 shadow-glow">
            <span>{cart?.totalItems ?? 0} itens adicionados</span>
            <span>Total estimado atual: {formatCurrency(estimatedCurrentTotal)}</span>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[1.5rem] bg-white p-5 shadow-glow">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                  <div className="h-4 w-32 rounded-full bg-black/10" />
                  <div className="h-8 w-64 rounded-full bg-black/10" />
                  <div className="h-4 w-48 rounded-full bg-black/10" />
                </div>
                <div className="h-12 w-48 rounded-full bg-black/10" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length ? (
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

          {entries.map(({ cartItem, catalogItem }, index) => {
            const currentOffer = catalogItem?.bestOffer;
            const currentUnitPrice = catalogItem?.lowestPrice ?? cartItem.unitPrice;
            const lineTotal = currentUnitPrice * cartItem.quantity;

            return (
              <article key={cartItem.id} className="rounded-[1.75rem] bg-white p-5 shadow-glow">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-black/5 px-3 py-1 text-neutral-700">
                        {catalogItem?.product.category ?? "Produto salvo"}
                      </span>
                      <span className="rounded-full bg-coral/10 px-3 py-1 text-coral">
                        {catalogItem?.offers.length ?? 0} ofertas
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-2xl">
                        {catalogItem?.product.name ?? "Produto indisponivel no catalogo"}
                      </h3>
                      <p className="mt-1 text-sm text-neutral-500">
                        {currentOffer
                          ? `Melhor oferta atual em ${getStoreDisplayName(currentOffer.storeId)}`
                          : "Confira novamente quando houver novas ofertas."}
                      </p>
                    </div>

                    <div className="grid gap-1 text-sm text-neutral-500">
                      <span>Preco atual: {formatCurrency(currentUnitPrice)}</span>
                      <span>Total estimado: {formatCurrency(lineTotal)}</span>
                      {currentOffer ? <span>{currentOffer.installmentText ?? "Pagamento a vista"}</span> : null}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:min-w-[280px]">
                    <label className="grid gap-2 text-sm text-neutral-600">
                      Quantidade
                      <input
                        type="number"
                        min={1}
                        value={cartItem.quantity}
                        onChange={(event) =>
                          void updateQuantity({
                            ownerId,
                            itemId: cartItem.id,
                            quantity: Math.max(1, Number(event.target.value) || 1)
                          })
                        }
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-coral/40"
                      />
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void removeItem({ ownerId, itemId: cartItem.id })}
                        className="inline-flex items-center justify-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/10"
                      >
                        Remover
                      </button>

                      {catalogItem ? (
                        <Link
                          href={`/ofertas/${catalogItem.product.slug}`}
                          className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                        >
                          Revisar produto
                        </Link>
                      ) : null}

                      {currentOffer ? (
                        <a
                          href={getOfferRedirectHref(currentOffer, {
                            source: "carrinho_comparativo",
                            position: index + 1,
                            category: catalogItem?.product.category,
                            sectionType: "lista_carrinho"
                          })}
                          target="_blank"
                          rel="noreferrer noopener sponsored"
                          className="inline-flex items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                        >
                          Ir para loja
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-glow">
          <h3 className="font-display text-3xl">Seu carrinho ainda esta vazio.</h3>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            Adicione produtos durante a navegacao para acompanhar melhor preco, quantidade desejada e a melhor loja antes do clique.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/buscar"
              className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Montar meu carrinho
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
