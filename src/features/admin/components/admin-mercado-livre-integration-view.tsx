"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminSectionNav } from "@/features/admin/components/admin-section-nav";
import { adminMercadoLivreService } from "@/features/admin/services/admin-mercado-livre.service";
import { useAdminImportReviewStore } from "@/features/admin/store/admin-import-review.store";
import type {
  AdminImportedProduct,
  AdminMercadoLivreSearchItem,
  AdminMercadoLivreSearchResult,
  AdminMercadoLivreSyncResult
} from "@/features/admin/types/admin.types";
import { SectionHeading } from "@/shared/ui/section-heading";

function formatPrice(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Sem preco";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

type FeedbackState =
  | {
      type: "success" | "error";
      title: string;
      message: string;
    }
  | null;

export function AdminMercadoLivreIntegrationView() {
  const drafts = useAdminImportReviewStore((state) => state.drafts);
  const addDraftFromImport = useAdminImportReviewStore((state) => state.addDraftFromImport);

  const [searchTerm, setSearchTerm] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [externalId, setExternalId] = useState("");
  const [searchResult, setSearchResult] = useState<AdminMercadoLivreSearchResult | null>(null);
  const [lastPreview, setLastPreview] = useState<AdminImportedProduct | null>(null);
  const [lastSync, setLastSync] = useState<AdminMercadoLivreSyncResult | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const pendingCount = drafts.length;
  const recentMercadoLivreDrafts = useMemo(
    () => drafts.filter((entry) => entry.draft.storeId === "mercado-livre").slice(0, 5),
    [drafts]
  );

  async function handleSearch() {
    const query = searchTerm.trim();
    if (!query) {
      setFeedback({
        type: "error",
        title: "Busca vazia",
        message: "Informe um termo para pesquisar produtos no catalogo do Mercado Livre."
      });
      return;
    }

    setBusyKey("search");
    setFeedback(null);
    setLastPreview(null);
    setLastSync(null);

    const response = await adminMercadoLivreService.searchProducts(query);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Nao foi possivel pesquisar",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    setSearchResult(response.data);
    setFeedback({
      type: "success",
      title: "Busca concluida",
      message: `${response.data.items.length} resultado(s) encontrados para "${response.data.query}".`
    });
    setBusyKey(null);
  }

  async function sendToReviewFromExternalId(item: AdminMercadoLivreSearchItem) {
    const key = `review-${item.externalId}`;
    setBusyKey(key);
    setFeedback(null);

    const response = await adminMercadoLivreService.previewByExternalId(item.externalId);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Falha ao preparar revisao",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    addDraftFromImport({
      sourceUrl: response.data.sourceUrl,
      imported: response.data
    });
    setLastPreview(response.data);
    setFeedback({
      type: "success",
      title: "Produto enviado para revisao",
      message: `${response.data.name} agora esta na fila de revisao antes da publicacao.`
    });
    setBusyKey(null);
  }

  async function syncFromExternalId(item: AdminMercadoLivreSearchItem) {
    const key = `sync-${item.externalId}`;
    setBusyKey(key);
    setFeedback(null);

    const response = await adminMercadoLivreService.syncByExternalId(item.externalId);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Falha ao sincronizar",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    setLastSync(response.data);
    setFeedback({
      type: "success",
      title: "Produto sincronizado",
      message: `Produto ${response.data.productExternalId} sincronizado no catalogo interno com ${response.data.offersCount} oferta(s).`
    });
    setBusyKey(null);
  }

  async function previewFromUrl() {
    const url = productUrl.trim();
    if (!url) {
      setFeedback({
        type: "error",
        title: "URL vazia",
        message: "Cole a URL de um produto do Mercado Livre para preparar a revisao."
      });
      return;
    }

    setBusyKey("preview-url");
    setFeedback(null);

    const response = await adminMercadoLivreService.previewByUrl(url);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Falha ao importar por URL",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    addDraftFromImport({
      sourceUrl: response.data.sourceUrl,
      imported: response.data
    });
    setLastPreview(response.data);
    setFeedback({
      type: "success",
      title: "URL enviada para revisao",
      message: `${response.data.name} foi adicionada aos rascunhos para revisao manual.`
    });
    setBusyKey(null);
  }

  async function syncFromUrl() {
    const url = productUrl.trim();
    if (!url) {
      setFeedback({
        type: "error",
        title: "URL vazia",
        message: "Cole a URL de um produto do Mercado Livre para sincronizar os dados."
      });
      return;
    }

    setBusyKey("sync-url");
    setFeedback(null);

    const response = await adminMercadoLivreService.syncByUrl(url);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Falha ao sincronizar por URL",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    setLastSync(response.data);
    setFeedback({
      type: "success",
      title: "Sincronizacao concluida",
      message: `Produto ${response.data.productExternalId} sincronizado no catalogo interno.`
    });
    setBusyKey(null);
  }

  async function previewFromExternalId() {
    const value = externalId.trim();
    if (!value) {
      setFeedback({
        type: "error",
        title: "External ID vazio",
        message: "Informe um external_id do Mercado Livre para preparar a revisao."
      });
      return;
    }

    setBusyKey("preview-external-id");
    setFeedback(null);

    const response = await adminMercadoLivreService.previewByExternalId(value);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Falha ao importar por external_id",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    addDraftFromImport({
      sourceUrl: response.data.sourceUrl,
      imported: response.data
    });
    setLastPreview(response.data);
    setFeedback({
      type: "success",
      title: "External ID enviado para revisao",
      message: `${response.data.name} foi adicionado aos rascunhos para revisao manual.`
    });
    setBusyKey(null);
  }

  async function syncFromExternalIdInput() {
    const value = externalId.trim();
    if (!value) {
      setFeedback({
        type: "error",
        title: "External ID vazio",
        message: "Informe um external_id do Mercado Livre para sincronizar os dados."
      });
      return;
    }

    setBusyKey("sync-external-id");
    setFeedback(null);

    const response = await adminMercadoLivreService.syncByExternalId(value);
    if (!response.ok) {
      setFeedback({
        type: "error",
        title: "Falha ao sincronizar por external_id",
        message: response.error.message
      });
      setBusyKey(null);
      return;
    }

    setLastSync(response.data);
    setFeedback({
      type: "success",
      title: "Sincronizacao concluida",
      message: `Produto ${response.data.productExternalId} sincronizado ou atualizado no catalogo interno.`
    });
    setBusyKey(null);
  }

  return (
    <section className="section-shell">
      <SectionHeading
        eyebrow="Admin"
        title="Integracao Mercado Livre"
        description="Busque produtos, envie para revisao manual e sincronize dados do catalogo oficial sem acoplar monetizacao a origem do dado."
      />
      <AdminSectionNav />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink">
          Pendentes de revisao: {pendingCount}
        </span>
        <Link
          href="/admin/produtos/revisar"
          className="inline-flex items-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white"
        >
          Abrir fila de revisao
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
          <p className="font-semibold">{feedback.title}</p>
          <p className="mt-1">{feedback.message}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <div className="rounded-[1.5rem] bg-white p-5 shadow-glow">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="min-w-0 flex-1">
                <label className="text-sm font-semibold text-neutral-700">Buscar por termo</label>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Ex.: Galaxy S24 256 GB"
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-coral/40"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={busyKey === "search"}
                className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {busyKey === "search" ? "Buscando..." : "Buscar catalogo"}
              </button>
            </div>

            {searchResult ? (
              <div className="mt-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-2xl">Resultados</h3>
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-neutral-600">
                    {searchResult.items.length} item(ns)
                  </span>
                </div>

                {searchResult.items.length ? (
                  <div className="grid gap-3">
                    {searchResult.items.map((item) => (
                      <article
                        key={item.externalId}
                        className="grid gap-4 rounded-[1.25rem] border border-black/8 bg-black/[0.02] p-4 md:grid-cols-[88px_minmax(0,1fr)_auto]"
                      >
                        <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-[1rem] bg-white">
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xs font-semibold text-neutral-400">Sem foto</span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-500">
                            <span className="rounded-full bg-white px-2 py-1 text-neutral-700">Mercado Livre</span>
                            <span>{item.externalId}</span>
                            {item.brand ? <span>{item.brand}</span> : null}
                          </div>
                          <h4 className="mt-2 line-clamp-2 text-base font-semibold text-ink">{item.title}</h4>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
                            <span className="value-safe-inline text-lg font-bold text-ink">{formatPrice(item.price)}</span>
                            {item.originalPrice && item.originalPrice > (item.price ?? 0) ? (
                              <span className="value-safe-inline text-sm text-neutral-400 line-through">
                                {formatPrice(item.originalPrice)}
                              </span>
                            ) : null}
                            {item.categoryId ? <span>Categoria {item.categoryId}</span> : null}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => void sendToReviewFromExternalId(item)}
                            disabled={busyKey === `review-${item.externalId}`}
                            className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-coral/90 disabled:opacity-60"
                          >
                            {busyKey === `review-${item.externalId}` ? "Enviando..." : "Enviar para revisao"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void syncFromExternalId(item)}
                            disabled={busyKey === `sync-${item.externalId}`}
                            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-black/5 disabled:opacity-60"
                          >
                            {busyKey === `sync-${item.externalId}` ? "Sincronizando..." : "Atualizar dados"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-black/10 bg-black/[0.02] px-4 py-5 text-sm text-neutral-500">
                    Nenhum item encontrado para esse termo no catalogo do Mercado Livre.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[1.5rem] bg-white p-5 shadow-glow">
            <h3 className="font-display text-2xl">Importar por URL</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Cole a URL do produto para enviar o item para revisao ou sincronizar direto no catalogo interno.
            </p>
            <input
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              type="url"
              placeholder="https://www.mercadolivre.com.br/..."
              className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-coral/40"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void previewFromUrl()}
                disabled={busyKey === "preview-url"}
                className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-3 text-sm font-semibold text-white transition hover:bg-coral/90 disabled:opacity-60"
              >
                {busyKey === "preview-url" ? "Preparando..." : "Enviar para revisao"}
              </button>
              <button
                type="button"
                onClick={() => void syncFromUrl()}
                disabled={busyKey === "sync-url"}
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-black/5 disabled:opacity-60"
              >
                {busyKey === "sync-url" ? "Sincronizando..." : "Sincronizar agora"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-white p-5 shadow-glow">
            <h3 className="font-display text-2xl">Importar por external_id</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Use o ID oficial do item para buscar o detalhe, revisar e atualizar manualmente quando precisar.
            </p>
            <input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value.toUpperCase())}
              placeholder="MLB123456789"
              className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-coral/40"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void previewFromExternalId()}
                disabled={busyKey === "preview-external-id"}
                className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-3 text-sm font-semibold text-white transition hover:bg-coral/90 disabled:opacity-60"
              >
                {busyKey === "preview-external-id" ? "Preparando..." : "Enviar para revisao"}
              </button>
              <button
                type="button"
                onClick={() => void syncFromExternalIdInput()}
                disabled={busyKey === "sync-external-id"}
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-black/5 disabled:opacity-60"
              >
                {busyKey === "sync-external-id" ? "Sincronizando..." : "Atualizar dados"}
              </button>
            </div>
          </div>

          {lastPreview ? (
            <div className="rounded-[1.5rem] bg-white p-5 shadow-glow">
              <h3 className="font-display text-2xl">Ultimo item enviado para revisao</h3>
              <p className="mt-3 text-sm font-semibold text-ink">{lastPreview.name}</p>
              <p className="mt-1 text-sm text-neutral-600">
                {lastPreview.externalId} • {formatPrice(lastPreview.price)}
              </p>
              <Link
                href="/admin/produtos/revisar"
                className="mt-4 inline-flex items-center rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white"
              >
                Revisar agora
              </Link>
            </div>
          ) : null}

          {lastSync ? (
            <div className="rounded-[1.5rem] bg-white p-5 shadow-glow">
              <h3 className="font-display text-2xl">Ultima sincronizacao</h3>
              <div className="mt-3 space-y-2 text-sm text-neutral-600">
                <p>
                  Produto interno: <span className="font-semibold text-ink">{lastSync.productId}</span>
                </p>
                <p>
                  External ID: <span className="font-semibold text-ink">{lastSync.productExternalId}</span>
                </p>
                <p>
                  Status: <span className="font-semibold text-ink">{lastSync.productStatus}</span>
                </p>
                <p>
                  Ofertas: <span className="font-semibold text-ink">{lastSync.offersCount}</span>
                </p>
              </div>
              <Link
                href="/admin/produtos"
                className="mt-4 inline-flex items-center rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-black/5"
              >
                Abrir produtos publicados
              </Link>
            </div>
          ) : null}

          {recentMercadoLivreDrafts.length ? (
            <div className="rounded-[1.5rem] bg-white p-5 shadow-glow">
              <h3 className="font-display text-2xl">Rascunhos Mercado Livre</h3>
              <div className="mt-3 space-y-2 text-sm text-neutral-600">
                {recentMercadoLivreDrafts.map((entry) => (
                  <div key={entry.id} className="rounded-2xl bg-black/[0.03] px-3 py-3">
                    <p className="font-semibold text-ink">{entry.draft.name || "Sem nome"}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {entry.draft.externalId || "Sem external_id"} • {new Date(entry.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
