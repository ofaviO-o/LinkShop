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

  function handleEditManyCatalogItems(productIds: string[]) {
    const [firstProductId] = productIds;
    if (!firstProductId) {
      return;
    }

    setFeedback(null);
    setEditingProductId(firstProductId);

    if (productIds.length > 1) {
      setFeedback({
        type: "success",
        message: `Edicao iniciada pelo primeiro item selecionado (${productIds.length} itens selecionados).`
      });
    }
  }

  async function handleDeleteManyCatalogItems(productIds: string[]) {
    const uniqueProductIds = [...new Set(productIds)];
    if (!uniqueProductIds.length) {
      return;
    }

    setFeedback(null);
    let removedCount = 0;
    let failedCount = 0;
    let firstErrorMessage: string | null = null;

    for (const productId of uniqueProductIds) {
      const response = await adminProductsService.deleteProduct(productId);
      if (!response.ok) {
        failedCount += 1;
        if (!firstErrorMessage) {
          firstErrorMessage = response.error.message;
        }
        continue;
      }

      removeCatalogItem(productId);
      removedCount += 1;
    }

    if (editingProductId && uniqueProductIds.includes(editingProductId)) {
      setEditingProductId(null);
    }

    if (removedCount > 0 && failedCount === 0) {
      setFeedback({
        type: "success",
        message:
          removedCount === 1
            ? "1 produto removido com sucesso."
            : `${removedCount} produtos removidos com sucesso.`
      });
      return;
    }

    if (removedCount > 0 && failedCount > 0) {
      setFeedback({
        type: "error",
        message: `${removedCount} removidos e ${failedCount} falharam. ${firstErrorMessage ?? ""}`.trim()
      });
      return;
    }

    setFeedback({
      type: "error",
      message: firstErrorMessage ?? "Nao foi possivel remover os produtos selecionados."
    });
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
            onEditMany={handleEditManyCatalogItems}
            onDeleteMany={handleDeleteManyCatalogItems}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <AdminProductTable
            items={items}
            onEditMany={handleEditManyCatalogItems}
            onDeleteMany={handleDeleteManyCatalogItems}
          />
        </div>
      )}
    </section>
  );
}
