"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { compareListService } from "@/features/cart/services/compare-list.service";
import type { Cart, CartItem } from "@/features/cart/types/cart.types";
import { getStoredAccessToken } from "@/shared/api/session-token";
import { ANONYMOUS_OWNER_ID } from "@/shared/lib/identity";
import { createSafeStorage } from "@/shared/lib/persistence";
import { safeUUID } from "@/shared/lib/uuid";

function calculateCart(ownerId: string, items: CartItem[]): Cart {
  return {
    ownerId,
    items,
    totalItems: items.reduce((accumulator, item) => accumulator + item.quantity, 0),
    subtotal: items.reduce((accumulator, item) => accumulator + item.unitPrice * item.quantity, 0),
    updatedAt: new Date().toISOString()
  };
}

function buildEmptyCart(ownerId: string) {
  return calculateCart(ownerId, []);
}

function shouldUseBackend(ownerId: string) {
  return ownerId !== ANONYMOUS_OWNER_ID && Boolean(getStoredAccessToken());
}

type CartState = {
  carts: Cart[];
  addItem: (payload: {
    ownerId: string;
    productId: string;
    offerId: string;
    quantity?: number;
    unitPrice: number;
  }) => Promise<void>;
  updateQuantity: (payload: { ownerId: string; itemId: string; quantity: number }) => Promise<void>;
  removeItem: (payload: { ownerId: string; itemId: string }) => Promise<void>;
  getCartByOwner: (ownerId: string) => Cart;
  hasProduct: (payload: { ownerId: string; productId: string }) => boolean;
  getItemByProductId: (payload: { ownerId: string; productId: string }) => CartItem | undefined;
  hydrateCart: (payload: { ownerId: string; items: CartItem[] }) => void;
  syncCart: (payload: { ownerId: string }) => Promise<void>;
  mergeCart: (payload: { sourceOwnerId: string; targetOwnerId: string }) => void;
  clearCartByOwner: (ownerId: string) => Promise<void>;
  clearLocalCartByOwner: (ownerId: string) => void;
};

function upsertCart(carts: Cart[], nextCart: Cart) {
  const index = carts.findIndex((cart) => cart.ownerId === nextCart.ownerId);

  if (index === -1) {
    return [...carts, nextCart];
  }

  return carts.map((cart, cartIndex) => (cartIndex === index ? nextCart : cart));
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: [],
      addItem: async ({ ownerId, productId, offerId, quantity = 1, unitPrice }) => {
        if (shouldUseBackend(ownerId)) {
          const token = getStoredAccessToken();

          if (token) {
            const response = await compareListService.upsertItem(token, {
              productId,
              offerId,
              quantity
            });

            if (response.ok) {
              set((state) => {
                const currentCart = state.carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId);
                const existingItem = currentCart.items.find((item) => item.productId === productId);
                const nextItems = existingItem
                  ? currentCart.items.map((item) => (item.id === existingItem.id ? response.data : item))
                  : [...currentCart.items, response.data];

                return {
                  carts: upsertCart(state.carts, calculateCart(ownerId, nextItems))
                };
              });
            }

            return;
          }
        }

        set((state) => {
          const currentCart = state.carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId);
          const existingItem = currentCart.items.find((item) => item.productId === productId);

          const items = existingItem
            ? currentCart.items.map((item) =>
                item.id === existingItem.id
                  ? { ...item, offerId, unitPrice, quantity: item.quantity + quantity }
                  : item
              )
            : [
                ...currentCart.items,
                {
                  id: safeUUID(),
                  ownerId,
                  productId,
                  offerId,
                  quantity,
                  unitPrice,
                  addedAt: new Date().toISOString()
                }
              ];

          return {
            carts: upsertCart(state.carts, calculateCart(ownerId, items))
          };
        });
      },
      updateQuantity: async ({ ownerId, itemId, quantity }) => {
        if (shouldUseBackend(ownerId)) {
          const token = getStoredAccessToken();

          if (token) {
            const response = await compareListService.updateQuantity(token, itemId, quantity);

            if (response.ok) {
              set((state) => {
                const currentCart = state.carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId);
                const items = currentCart.items
                  .map((item) => (item.id === itemId ? response.data : item))
                  .filter((item) => item.quantity > 0);

                return {
                  carts: upsertCart(state.carts, calculateCart(ownerId, items))
                };
              });
            }

            return;
          }
        }

        set((state) => {
          const currentCart = state.carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId);
          const items = currentCart.items
            .map((item) => (item.id === itemId ? { ...item, quantity } : item))
            .filter((item) => item.quantity > 0);

          return {
            carts: upsertCart(state.carts, calculateCart(ownerId, items))
          };
        });
      },
      removeItem: async ({ ownerId, itemId }) => {
        if (shouldUseBackend(ownerId)) {
          const token = getStoredAccessToken();

          if (token) {
            const response = await compareListService.removeItem(token, itemId);

            if (response.ok) {
              set((state) => {
                const currentCart = state.carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId);
                const items = currentCart.items.filter((item) => item.id !== itemId);

                return {
                  carts: upsertCart(state.carts, calculateCart(ownerId, items))
                };
              });
            }

            return;
          }
        }

        set((state) => {
          const currentCart = state.carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId);
          const items = currentCart.items.filter((item) => item.id !== itemId);

          return {
            carts: upsertCart(state.carts, calculateCart(ownerId, items))
          };
        });
      },
      getCartByOwner: (ownerId) => get().carts.find((cart) => cart.ownerId === ownerId) ?? buildEmptyCart(ownerId),
      hasProduct: ({ ownerId, productId }) =>
        get()
          .getCartByOwner(ownerId)
          .items.some((item) => item.productId === productId),
      getItemByProductId: ({ ownerId, productId }) =>
        get()
          .getCartByOwner(ownerId)
          .items.find((item) => item.productId === productId),
      hydrateCart: ({ ownerId, items }) =>
        set((state) => ({
          carts: upsertCart(state.carts, calculateCart(ownerId, items))
        })),
      syncCart: async ({ ownerId }) => {
        if (!shouldUseBackend(ownerId)) {
          return;
        }

        const token = getStoredAccessToken();

        if (!token) {
          return;
        }

        const remoteResponse = await compareListService.listItems(token);

        if (!remoteResponse.ok) {
          return;
        }

        set((state) => ({
          carts: upsertCart(state.carts, calculateCart(ownerId, remoteResponse.data))
        }));
      },
      mergeCart: ({ sourceOwnerId, targetOwnerId }) =>
        set((state) => {
          if (sourceOwnerId === targetOwnerId) {
            return state;
          }

          const sourceCart = state.carts.find((cart) => cart.ownerId === sourceOwnerId) ?? buildEmptyCart(sourceOwnerId);
          const targetCart = state.carts.find((cart) => cart.ownerId === targetOwnerId) ?? buildEmptyCart(targetOwnerId);

          const mergedByProductId = new Map<string, CartItem>();

          [...targetCart.items, ...sourceCart.items].forEach((item) => {
            const current = mergedByProductId.get(item.productId);

            if (!current) {
              mergedByProductId.set(item.productId, {
                ...item,
                id: safeUUID(),
                ownerId: targetOwnerId
              });
              return;
            }

            const incomingDate = new Date(item.addedAt).getTime();
            const currentDate = new Date(current.addedAt).getTime();
            const shouldReplaceDetails = incomingDate >= currentDate;

            mergedByProductId.set(item.productId, {
              ...current,
              ownerId: targetOwnerId,
              quantity: Math.max(current.quantity, item.quantity),
              offerId: shouldReplaceDetails ? item.offerId : current.offerId,
              unitPrice: shouldReplaceDetails ? item.unitPrice : current.unitPrice,
              addedAt: shouldReplaceDetails ? item.addedAt : current.addedAt
            });
          });

          const nextTargetCart = calculateCart(targetOwnerId, [...mergedByProductId.values()]);
          const remainingCarts = state.carts.filter((cart) => cart.ownerId !== sourceOwnerId && cart.ownerId !== targetOwnerId);

          return {
            carts: [...remainingCarts, nextTargetCart]
          };
        }),
      clearCartByOwner: async (ownerId) => {
        if (shouldUseBackend(ownerId)) {
          const token = getStoredAccessToken();

          if (token) {
            const currentCart = get().getCartByOwner(ownerId);

            for (const item of currentCart.items) {
              await compareListService.removeItem(token, item.id);
            }
          }
        }

        set((state) => ({
          carts: upsertCart(state.carts, buildEmptyCart(ownerId))
        }));
      },
      clearLocalCartByOwner: (ownerId) =>
        set((state) => ({
          carts: upsertCart(state.carts, buildEmptyCart(ownerId))
        }))
    }),
    {
      name: "linkshop-cart",
      storage: createSafeStorage()
    }
  )
);
