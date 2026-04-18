import Link from "next/link";

import { CatalogProductCard } from "@/features/catalog/components/catalog-product-card";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";
import { SectionHeading } from "@/shared/ui/section-heading";

type ProductCarouselSectionProps = {
  contextKey: string;
  title: string;
  description?: string;
  items: CatalogItem[];
  viewMoreHref: string;
};

export function ProductCarouselSection({
  contextKey,
  title,
  description,
  items,
  viewMoreHref
}: ProductCarouselSectionProps) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="section-shell">
      <SectionHeading
        eyebrow="Home"
        title={title}
        description={description}
        action={
          <Link
            href={viewMoreHref}
            className="inline-flex items-center rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-black/10"
          >
            Ver mais
          </Link>
        }
      />

      <div
        data-section-context={contextKey}
        className="grid auto-cols-[86%] grid-flow-col gap-3 overflow-x-auto pb-2 pr-1 scroll-smooth snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[56%] md:auto-cols-[38%] lg:auto-cols-[calc((100%-2.25rem)/4)]"
      >
        {items.map((item) => (
          <div key={item.product.id} className="snap-start">
            <CatalogProductCard item={item} variant="compact" />
          </div>
        ))}
      </div>
    </section>
  );
}

export const CatalogHorizontalShelf = ProductCarouselSection;
