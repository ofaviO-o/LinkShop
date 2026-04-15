"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminEventsPanel } from "@/features/admin/components/admin-events-panel";
import { AdminHealthPanel } from "@/features/admin/components/admin-health-panel";
import { AdminOperationsPanel } from "@/features/admin/components/admin-operations-panel";
import { AdminProductTable } from "@/features/admin/components/admin-product-table";
import { AdminRankingDiagnosticsPanel } from "@/features/admin/components/admin-ranking-diagnostics-panel";
import { AdminRankingPanel } from "@/features/admin/components/admin-ranking-panel";
import { AdminSummaryCards } from "@/features/admin/components/admin-summary-cards";
import { ProductForm } from "@/features/admin/components/product-form";
import { adminProductsService } from "@/features/admin/services/admin-products.service";
import type {
  AdminBatchImportResult,
  AdminDashboardData,
  AdminImportedProduct,
  AdminProductDraft
} from "@/features/admin/types/admin.types";
import type { CatalogItem, CatalogSearchResult } from "@/features/catalog/types/catalog.types";
import { useCatalogStore } from "@/stores";
import { SectionHeading } from "@/shared/ui/section-heading";

type AdminDashboardProps = {
  initialCatalog: CatalogSearchResult;
  initialDashboard: AdminDashboardData;
};

export function AdminDashboard({ initialCatalog, initialDashboard }: AdminDashboardProps) {
  const items = useCatalogStore((state) => state.items);
  const initialized = useCatalogStore((state) => state.initialized);
  const initializeCatalog = useCatalogStore((state) => state.initializeCatalog);
  const upsertCatalogItem = useCatalogStore((state) => state.upsertCatalogItem);
  const removeCatalogItem = useCatalogStore((state) => state.removeCatalogItem);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [catalogFeedback, setCatalogFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [batchInput, setBatchInput] = useState("");
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchResult, setBatchResult] = useState<AdminBatchImportResult | null>(null);
  const [sessionImportedProductIds, setSessionImportedProductIds] = useState<string[]>([]);

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

  const analyticsUnavailable = !initialDashboard.clickAnalytics || !initialDashboard.alertAnalytics;

  const summaryItems = useMemo(
    () => [
      {
        label: "Cliques",
        value: String(initialDashboard.clickAnalytics?.totalClicks ?? 0),
        hint: "Total de cliques afiliados registrados no periodo observado."
      },
      {
        label: "Produto lider",
        value: initialDashboard.clickAnalytics?.topProducts[0]?.label ?? "-",
        hint: "Produto com maior volume recente de interesse."
      },
      {
        label: "Alertas",
        value: String(initialDashboard.alertAnalytics?.totalAlerts ?? 0),
        hint: "Alertas disparados pela engine no periodo observado."
      },
      {
        label: "Motivo lider",
        value: initialDashboard.alertAnalytics?.alertsByReason[0]?.source.replaceAll("_", " ") ?? "-",
        hint: "Motivo de alerta mais recorrente no ambiente."
      }
    ],
    [initialDashboard.alertAnalytics, initialDashboard.clickAnalytics]
  );

  async function handleSaveCatalogItem(item: CatalogItem, draft: AdminProductDraft): Promise<{ ok: boolean; message: string }> {
    setCatalogFeedback(null);
    const isEditing = Boolean(editingItem);
    const targetProductId = editingItem?.product.id ?? item.product.id;
    const response = isEditing
      ? await adminProductsService.updateProduct(targetProductId, item, draft)
      : await adminProductsService.createProduct(item, draft);

    if (!response.ok) {
      const message = response.error.message;
      setCatalogFeedback({ type: "error", message });
      return { ok: false, message };
    }

    upsertCatalogItem(response.data);
    setEditingProductId(null);
    if (draft.externalId || draft.landingUrl) {
      setSessionImportedProductIds((current) => [...new Set([...current, response.data.product.id])]);
    }

    const message = isEditing ? "Produto atualizado com sucesso." : "Produto publicado com sucesso.";
    setCatalogFeedback({ type: "success", message });
    return { ok: true, message };
  }

  async function handleDeleteCatalogItem(productId: string) {
    setCatalogFeedback(null);
    const response = await adminProductsService.deleteProduct(productId);

    if (!response.ok) {
      setCatalogFeedback({ type: "error", message: response.error.message });
      return;
    }

    removeCatalogItem(productId);
    setSessionImportedProductIds((current) => current.filter((id) => id !== productId));

    if (editingProductId === productId) {
      setEditingProductId(null);
    }

    setCatalogFeedback({ type: "success", message: "Produto removido com sucesso." });
  }

  async function handleImportCatalogItemByUrl(
    url: string
  ): Promise<{ ok: boolean; message: string; imported?: AdminImportedProduct }> {
    setCatalogFeedback(null);
    setEditingProductId(null);

    const response = await adminProductsService.importProductByUrl(url);

    if (!response.ok) {
      return {
        ok: false,
        message: response.error.message
      };
    }

    return {
      ok: true,
      message: "Dados importados. Link original preservado e destino resolvido para revisao antes de salvar.",
      imported: response.data
    };
  }

  async function handleBatchImport() {
    const urls = batchInput
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!urls.length) {
      setCatalogFeedback({
        type: "error",
        message: "Cole pelo menos uma URL para importar em lote."
      });
      return;
    }

    setCatalogFeedback(null);
    setBatchResult(null);
    setIsBatchImporting(true);
    setEditingProductId(null);

    const response = await adminProductsService.importProductsByUrlBatch(urls);
    if (!response.ok) {
      setCatalogFeedback({
        type: "error",
        message: response.error.message
      });
      setIsBatchImporting(false);
      return;
    }

    setBatchResult(response.data);
    response.data.results.forEach((entry) => {
      if (entry.catalogItem) {
        upsertCatalogItem(entry.catalogItem);
      }
    });
    const importedIds = response.data.results
      .filter((entry) => (entry.status === "imported" || entry.status === "duplicate") && Boolean(entry.productId))
      .map((entry) => entry.productId)
      .filter((entry): entry is string => Boolean(entry));
    if (importedIds.length) {
      setSessionImportedProductIds((current) => [...new Set([...current, ...importedIds])]);
    }

    setCatalogFeedback({
      type: "success",
      message: `Lote processado: ${response.data.summary.imported} importados, ${response.data.summary.duplicates} duplicados, ${response.data.summary.invalid} inválidos.`
    });
    setIsBatchImporting(false);
  }

  return (
    <section className="section-shell">
      <SectionHeading
        eyebrow="Admin"
        title="Operacao interna e gestao inicial do produto"
        description="A area admin centraliza observabilidade funcional do comparador e mantem a gestao de catalogo na mesma feature."
      />

      <AdminSummaryCards items={summaryItems} />

      {analyticsUnavailable ? (
        <div className="mt-6 rounded-[1.75rem] border border-dashed border-black/10 bg-black/5 px-6 py-5 text-sm leading-6 text-neutral-600">
          Os endpoints internos de analytics nao responderam neste ambiente. Health e readiness continuam visiveis, e o restante
          da area admin segue funcional para uso interno basico.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminHealthPanel
          title="Liveness"
          description="Verificacao rapida para confirmar que a API esta respondendo."
          status={initialDashboard.health}
        />
        <AdminHealthPanel
          title="Readiness"
          description="Estado de prontidao do backend com banco e dependencias minimas."
          status={initialDashboard.readiness}
        />
      </div>

      <div className="mt-6">
        <AdminOperationsPanel summary={initialDashboard.operations} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminRankingPanel
          title="Produtos mais clicados"
          description="Itens com maior volume recente de interesse."
          items={initialDashboard.clickAnalytics?.topProducts ?? []}
        />
        <AdminRankingPanel
          title="Lojas mais clicadas"
          description="Marketplaces que mais receberam cliques afiliados."
          items={initialDashboard.clickAnalytics?.topStores ?? []}
        />
        <AdminRankingPanel
          title="Alertas por motivo"
          description="Motivos mais frequentes de disparo da engine."
          items={initialDashboard.alertAnalytics?.alertsByReason ?? []}
        />
        <AdminRankingPanel
          title="Produtos com mais alertas"
          description="Itens que mais acionaram acompanhamento recentemente."
          items={initialDashboard.alertAnalytics?.topProducts ?? []}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminEventsPanel
          title="Cliques recentes"
          description="Ultimos eventos de clique afiliado registrados no backend."
          items={initialDashboard.recentClickEvents}
          type="clicks"
        />
        <AdminEventsPanel
          title="Alertas recentes"
          description="Ultimos eventos disparados pela avaliacao de alertas."
          items={initialDashboard.recentAlertEvents}
          type="alerts"
        />
      </div>

      <div className="mt-6">
        <AdminRankingDiagnosticsPanel items={initialDashboard.rankingDiagnostics} />
      </div>

      {catalogFeedback ? (
        <div
          className={`mt-6 rounded-[1.5rem] px-5 py-4 text-sm ${
            catalogFeedback.type === "success"
              ? "border border-lagoon/20 bg-lagoon/10 text-lagoon"
              : "border border-coral/20 bg-coral/10 text-coral"
          }`}
        >
          {catalogFeedback.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-[1.5rem] bg-white p-5 shadow-glow">
        <h3 className="font-display text-2xl">Importacao em lote (Mercado Livre)</h3>
        <p className="mt-2 text-sm text-neutral-600">
          Cole uma URL por linha. Aceita links diretos e links de afiliado.
        </p>

        <textarea
          value={batchInput}
          onChange={(event) => setBatchInput(event.target.value)}
          rows={6}
          placeholder={"https://produto.mercadolivre.com.br/...\nhttps://seu-link-afiliado..."}
          className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-coral/40"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleBatchImport()}
            disabled={isBatchImporting}
            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {isBatchImporting ? "Importando lote..." : "Importar lote"}
          </button>
          <span className="text-xs text-neutral-500">1 URL por linha</span>
        </div>

        {batchResult ? (
          <div className="mt-4 rounded-2xl border border-black/10 bg-black/5 p-4">
            <p className="text-sm font-semibold text-ink">
              Resumo: {batchResult.summary.imported} importados | {batchResult.summary.duplicates} duplicados |{" "}
              {batchResult.summary.invalid} inválidos | {batchResult.summary.extractionFailed} falha de extração |{" "}
              {batchResult.summary.notSupported} não suportados
            </p>

            <div className="mt-3 max-h-56 overflow-auto rounded-xl bg-white">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">URL enviada</th>
                    <th className="px-3 py-2">URL resolvida</th>
                    <th className="px-3 py-2">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResult.results.map((entry, index) => (
                    <tr key={`${entry.url}-${index}`} className="border-t border-black/5">
                      <td className="px-3 py-2">{entry.status}</td>
                      <td className="max-w-[280px] truncate px-3 py-2">{entry.url}</td>
                      <td className="max-w-[280px] truncate px-3 py-2">{entry.resolvedUrl ?? "-"}</td>
                      <td className="px-3 py-2">{entry.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-10 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <ProductForm
          item={editingItem}
          onSave={handleSaveCatalogItem}
          onImportByUrl={handleImportCatalogItemByUrl}
          onCancel={() => setEditingProductId(null)}
        />
        <AdminProductTable
          items={items}
          importedProductIds={sessionImportedProductIds}
          onEdit={(item) => {
            setCatalogFeedback(null);
            setEditingProductId(item.product.id);
          }}
          onDelete={(productId) => {
            void handleDeleteCatalogItem(productId);
          }}
        />
      </div>
    </section>
  );
}
