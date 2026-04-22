"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createSafeStorage } from "@/shared/lib/persistence";

type RecentProductView = {
  ownerId: string;
  productId: string;
  viewedAt: string;
};

type RecentViewsState = {
  recentViews: RecentProductView[];
  recordView: (payload: { ownerId: string; productId: string }) => void;
  getRecentViewsByOwner: (ownerId: string) => RecentProductView[];
  clearRecentViewsByOwner: (ownerId: string) => void;
};

const MAX_RECENT_VIEWS_PER_OWNER = 12;

export const useRecentViewsStore = create<RecentViewsState>()(
  persist(
    (set, get) => ({
      recentViews: [],
      recordView: ({ ownerId, productId }) =>
        set((state) => {
          const nextEntry: RecentProductView = {
            ownerId,
            productId,
            viewedAt: new Date().toISOString()
          };

          const untouchedEntries = state.recentViews.filter(
            (entry) => !(entry.ownerId === ownerId && entry.productId === productId)
          );
          const ownerEntries = [nextEntry, ...untouchedEntries.filter((entry) => entry.ownerId === ownerId)].slice(
            0,
            MAX_RECENT_VIEWS_PER_OWNER
          );
          const otherEntries = untouchedEntries.filter((entry) => entry.ownerId !== ownerId);

          return {
            recentViews: [...otherEntries, ...ownerEntries]
          };
        }),
      getRecentViewsByOwner: (ownerId) =>
        get()
          .recentViews
          .filter((entry) => entry.ownerId === ownerId)
          .sort((left, right) => new Date(right.viewedAt).getTime() - new Date(left.viewedAt).getTime()),
      clearRecentViewsByOwner: (ownerId) =>
        set((state) => ({
          recentViews: state.recentViews.filter((entry) => entry.ownerId !== ownerId)
        }))
    }),
    {
      name: "linkshop-recent-views",
      storage: createSafeStorage()
    }
  )
);
