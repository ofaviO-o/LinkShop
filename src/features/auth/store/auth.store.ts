"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { authService } from "@/features/auth/services/auth.service";
import { anonymousSyncService } from "@/features/auth/services/anonymous-sync.service";
import type { AuthSession, SignInInput, SignUpInput } from "@/features/auth/types/auth.types";
import { useCartStore } from "@/features/cart/store/cart.store";
import { useFavoritesStore } from "@/features/favorites/store/favorites.store";
import { usePriceWatchStore } from "@/features/price-alerts/store/price-watch.store";
import { isBackendIntegrationEnabled } from "@/shared/api/api-config";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredSessionTokens
} from "@/shared/api/session-token";
import { ANONYMOUS_OWNER_ID, getAnonymousSessionId } from "@/shared/lib/identity";
import { createSafeStorage } from "@/shared/lib/persistence";

type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous" | "error";

type AuthState = {
  session: AuthSession | null;
  status: AuthStatus;
  error: string | null;
  signIn: (input: SignInInput) => Promise<boolean>;
  signUp: (input: SignUpInput) => Promise<boolean>;
  restoreSession: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

function clearLocalCollectionsByOwner(ownerId: string) {
  useFavoritesStore.getState().clearFavoritesByUser(ownerId);
  useCartStore.getState().clearLocalCartByOwner(ownerId);
  usePriceWatchStore.getState().clearWatchesByOwner(ownerId);
}

function clearAnonymousCollections() {
  clearLocalCollectionsByOwner(ANONYMOUS_OWNER_ID);
}

function mergeAnonymousDataIntoUser(session: AuthSession) {
  const targetUserId = session.user.id;

  useFavoritesStore.getState().mergeFavorites({
    sourceUserId: ANONYMOUS_OWNER_ID,
    targetUserId
  });

  useCartStore.getState().mergeCart({
    sourceOwnerId: ANONYMOUS_OWNER_ID,
    targetOwnerId: targetUserId
  });

  usePriceWatchStore.getState().mergeWatches({
    sourceOwnerId: ANONYMOUS_OWNER_ID,
    targetOwnerId: targetUserId
  });

  clearAnonymousCollections();
}

async function syncAuthenticatedCollections(session: AuthSession) {
  await Promise.allSettled([
    useFavoritesStore.getState().syncFavorites({ userId: session.user.id }),
    useCartStore.getState().syncCart({ ownerId: session.user.id }),
    usePriceWatchStore.getState().syncWatches({ ownerId: session.user.id })
  ]);
}

async function syncAnonymousStateIntoBackend(session: AuthSession) {
  if (!isBackendIntegrationEnabled()) {
    mergeAnonymousDataIntoUser(session);
    return;
  }

  const favorites = useFavoritesStore.getState().getFavoritesByUser(ANONYMOUS_OWNER_ID);
  const compareList = useCartStore.getState().getCartByOwner(ANONYMOUS_OWNER_ID).items;
  const priceWatches = usePriceWatchStore.getState().watches.filter((watch) => watch.ownerId === ANONYMOUS_OWNER_ID);

  const response = await anonymousSyncService.syncAnonymousState(session.token, {
    anonymousSessionId: getAnonymousSessionId(),
    favorites,
    compareList,
    priceWatches
  });

  if (!response.ok) {
    await syncAuthenticatedCollections(session);
    return;
  }

  useFavoritesStore.getState().hydrateFavorites({
    userId: session.user.id,
    favorites: response.data.favorites
  });

  useCartStore.getState().hydrateCart({
    ownerId: session.user.id,
    items: response.data.compareList
  });

  usePriceWatchStore.getState().hydrateWatches({
    ownerId: session.user.id,
    watches: response.data.priceWatches
  });

  clearAnonymousCollections();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      status: "idle",
      error: null,
      signIn: async (input) => {
        set({ status: "loading", error: null });
        const response = await authService.signIn(input);

        if (!response.ok) {
          set({ status: "error", error: response.error.message });
          return false;
        }

        setStoredSessionTokens({
          accessToken: response.data.token,
          refreshToken: response.data.refreshToken,
          accessExpiresAt: response.data.accessExpiresAt,
          refreshExpiresAt: response.data.refreshExpiresAt
        });
        await syncAnonymousStateIntoBackend(response.data);
        set({ session: response.data, status: "authenticated", error: null });
        return true;
      },
      signUp: async (input) => {
        set({ status: "loading", error: null });
        const response = await authService.signUp(input);

        if (!response.ok) {
          set({ status: "error", error: response.error.message });
          return false;
        }

        setStoredSessionTokens({
          accessToken: response.data.token,
          refreshToken: response.data.refreshToken,
          accessExpiresAt: response.data.accessExpiresAt,
          refreshExpiresAt: response.data.refreshExpiresAt
        });
        await syncAnonymousStateIntoBackend(response.data);
        set({ session: response.data, status: "authenticated", error: null });
        return true;
      },
      restoreSession: async () => {
        const token = getStoredAccessToken() ?? get().session?.token;
        const currentSession = get().session;

        if (!token) {
          if (isBackendIntegrationEnabled() && getStoredRefreshToken()) {
            set({ status: "loading" });
            const refreshed = await authService.refreshSession();

            if (!refreshed.ok || !refreshed.data) {
              clearStoredAccessToken();
              if (currentSession?.user.id) {
                clearLocalCollectionsByOwner(currentSession.user.id);
              }
              set({ session: null, status: "anonymous", error: null });
              return;
            }

            setStoredSessionTokens({
              accessToken: refreshed.data.token,
              refreshToken: refreshed.data.refreshToken,
              accessExpiresAt: refreshed.data.accessExpiresAt,
              refreshExpiresAt: refreshed.data.refreshExpiresAt
            });
            await syncAuthenticatedCollections(refreshed.data);
            set({ session: refreshed.data, status: "authenticated", error: null });
            return;
          }

          clearStoredAccessToken();
          if (currentSession?.user.id) {
            clearLocalCollectionsByOwner(currentSession.user.id);
          }
          set({ status: "anonymous" });
          return;
        }

        set({ status: "loading" });
        const response = await authService.getSessionByToken(token);

        if (!response.ok || !response.data) {
          clearStoredAccessToken();
          if (currentSession?.user.id) {
            clearLocalCollectionsByOwner(currentSession.user.id);
          }
          set({ session: null, status: "anonymous", error: null });
          return;
        }

        await syncAuthenticatedCollections(response.data);
        set({ session: response.data, status: "authenticated", error: null });
      },
      signOut: async () => {
        const currentSession = get().session;
        set({ status: "loading" });
        try {
          await authService.signOut();
        } finally {
          clearStoredAccessToken();
          if (currentSession?.user.id) {
            clearLocalCollectionsByOwner(currentSession.user.id);
          }
          clearAnonymousCollections();
          set({ session: null, status: "anonymous", error: null });
        }
      },
      clearError: () => set({ error: null, status: get().session ? "authenticated" : "anonymous" })
    }),
    {
      name: "linkshop-auth",
      storage: createSafeStorage(),
      partialize: (state) => ({ session: state.session })
    }
  )
);
