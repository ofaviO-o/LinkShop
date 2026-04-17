"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminProductTable } from "@/features/admin/components/admin-product-table";
import { AdminSectionNav } from "@/features/admin/components/admin-section-nav";
import { ProductForm } from "@/features/admin/components/product-form";
import { adminProductsService } from "@/features/admin/services/admin-products.service";
import type { AdminProductDraft } from "@/features/admin/types/admin.types";
import type { CatalogItem, CatalogSearchResult } from "@/features/catalog/types/catalog.types";
import { useCatalogStore } from "@/stores";
import { SectionHeading } from "@/shared/ui/section-heading";

type AdminProductsManageViewProps = {
  initialCatalog: CatalogSearchResult;
};

export function AdminProductsManageView({ initialCatalog }: AdminProductsManageViewProps) {
  const items = useCatalogStore((state) => state.items);
  const initialized = useCatalogStore((state) => state.initialized);
  const initializeCatalog = useCatalogStore((state) => state.initializeCatalog);
  const upsertCatalogItem = useCatalogStore((state) => state.upsertCatalogItem);
  const removeCatalogItem = useCatalogStore((state) => state.removeCatalogItem);

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!initialized) {
      initializeCatalog({
        items: initialCatalog.items,
        availableCategories: initialCatalog.availableCategories,
        total: initialCatalog.total
      });
    }
  }, [initialCatalog, initializeCatalog, initialized]);

  const editingItem = useMemo(
    () => items.find((item) => item.product.id === editingProductId) ?? null,
    [editingProductId, items]
  );

  async function handleUpdateCatalogItem(
    item: CatalogItem,
    draft: AdminProductDraft
  ): Promise<{ ok: boolean; message: string }> {
    if (!editingItem) {
      const message = "Selecione um item publicado para editar.";
      setFeedback({ type: "error", message });
      return { ok: false, message };
    }

    setFeedback(null);
    const targetProductId = editingItem.product.id;
    const response = await adminProductsService.updateProduct(targetProductId, item, draft);

    if (!response.ok) {
      const message = response.error.message;
      setFeedback({ type: "error", message });
      return { ok: false, message };
    }

    upsertCatalogItem(response.data);
    setEditingProductId(null);

    const message = "Produto atualizado com sucesso.";
    setFeedback({ type: "success", message });
    return { ok: true, message };
  }

  async function handleDeleteCatalogItem(productId: string) {
    setFeedback(null);
    const response = await adminProductsService.deleteProduct(productId);

    if (!response.ok) {
      setFeedback({ type: "error", message: response.error.message });
      return;
    }

    removeCatalogItem(productId);

    if (editingProductId === productId) {
      setEditingProductId(null);
    }

    setFeedback({ type: "success", message: "Produto removido com sucesso." });
  }

  return (
    <section className="section-shell">
      <SectionHeading
        eyebrow="Admin"
        title="Gestao de catalogo"
        description="Gerencie itens publicados, edite dados de produto e mantenha o catalogo organizado."
      />
      <AdminSectionNav />

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/admin/produtos/novo"
          className="inline-flex items-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white"
        >
          Cadastro manual
        </Link>
        <Link
          href="/admin/produtos/importar"
          className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
        >
          Importar para revisao
        </Link>
        <Link
          href="/admin/produtos/revisar"
          className="inline-flex items-center rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-neutral-700"
        >
          Revisar pendentes
        </Link>
      </div>

      {feedback ? (
        <div
          className={`mb-6 rounded-[1.5rem] px-5 py-4 text-sm ${
            feedback.type === "success"
              ? "border border-lagoon/20 bg-lagoon/10 text-lagoon"
              : "border border-coral/20 bg-coral/10 text-coral"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {editingItem ? (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <ProductForm
            item={editingItem}
            onSave={handleUpdateCatalogItem}
            onCancel={() => setEditingProductId(null)}
            showImportSection={false}
            title="Editar produto publicado"
            description="Ajuste apenas dados de itens ja publicados no catalogo."
            submitLabel="Salvar alteracoes"
          />
          <AdminProductTable
            items={items}
            onEdit={(item) => {
              setFeedback(null);
              setEditingProductId(item.product.id);
            }}
            onDelete={(productId) => {
              void handleDeleteCatalogItem(productId);
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-black/10 bg-white p-5 text-sm text-neutral-600 shadow-glow">
            Esta area e focada em produtos publicados. Para criar novos itens, use as rotas dedicadas:
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/produtos/novo" className="font-semibold text-coral">
                /admin/produtos/novo
              </Link>
              <span>•</span>
              <Link href="/admin/produtos/importar" className="font-semibold text-coral">
                /admin/produtos/importar
              </Link>
              <span>•</span>
              <Link href="/admin/produtos/revisar" className="font-semibold text-coral">
                /admin/produtos/revisar
              </Link>
            </div>
          </div>

          <AdminProductTable
            items={items}
            onEdit={(item) => {
              setFeedback(null);
              setEditingProductId(item.product.id);
            }}
            onDelete={(productId) => {
              void handleDeleteCatalogItem(productId);
            }}
          />
        </div>
      )}
    </section>
  );
}
