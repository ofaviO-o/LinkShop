import type { ReactNode } from "react";

import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { CatalogProductCard } from "@/features/catalog/components/catalog-product-card";

type CatalogGridProps = {
  items: CatalogItem[];
  emptyState?: ReactNode;
  variant?: "default" | "compact";
};

export function CatalogGrid({ items, emptyState, variant = "default" }: CatalogGridProps) {
  if (!items.length) {
    return <>{emptyState ?? null}</>;
  }

  const gridClassName =
    variant === "compact"
      ? "grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
      : "grid gap-6 md:grid-cols-2";

  return (
    <div className={gridClassName}>
      {items.map((item) => (
        <CatalogProductCard key={item.product.id} item={item} variant={variant === "compact" ? "compact" : "default"} />
      ))}
    </div>
  );
}
