import Link from "next/link";

import { ProductCarouselSection } from "@/features/catalog/components/catalog-horizontal-shelf";
import type { CatalogHomeSections } from "@/features/catalog/types/catalog.types";
import { SectionHeading } from "@/shared/ui/section-heading";

type CatalogHomeViewProps = {
  sections: CatalogHomeSections;
};

export function CatalogHomeView({ sections }: CatalogHomeViewProps) {
  return (
    <>
      <section className="section-shell">
        <SectionHeading
          eyebrow="Vitrine"
          title="Descubra ofertas por contexto"
          description="Navegue por vitrines horizontais e abra a listagem completa da secao quando quiser."
          action={
            <Link
              href="/buscar"
              className="inline-flex items-center rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Ver todos os produtos
            </Link>
          }
        />
      </section>

      {sections.shelves.map((shelf) => (
        <ProductCarouselSection
          key={shelf.id}
          contextKey={shelf.contextKey}
          title={shelf.title}
          description={shelf.description}
          items={shelf.items}
          viewMoreHref={shelf.viewMoreHref}
        />
      ))}
    </>
  );
}
