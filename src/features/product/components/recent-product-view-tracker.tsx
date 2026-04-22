"use client";

import { useEffect } from "react";

import { useAuthStore, useRecentViewsStore } from "@/stores";

type RecentProductViewTrackerProps = {
  productId: string;
};

export function RecentProductViewTracker({ productId }: RecentProductViewTrackerProps) {
  const session = useAuthStore((state) => state.session);
  const recordView = useRecentViewsStore((state) => state.recordView);

  useEffect(() => {
    if (!session?.user.id || !productId) {
      return;
    }

    recordView({
      ownerId: session.user.id,
      productId
    });
  }, [productId, recordView, session?.user.id]);

  return null;
}
