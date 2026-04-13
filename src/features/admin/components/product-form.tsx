"use client";

import { useEffect, useState, type FormEvent } from "react";

import { adminCatalogService } from "@/features/admin/services/admin-catalog.service";
import type { AdminImportedProduct, AdminProductDraft } from "@/features/admin/types/admin.types";
import type { CatalogItem } from "@/features/catalog/types/catalog.types";

type ProductFormProps = {
  item: CatalogItem | null;
  onSave: (item: CatalogItem) => Promise<{ ok: boolean; message: string }>;
  onImportByUrl: (url: string) => Promise<{ ok: boolean; message: string; imported?: AdminImportedProduct }>;
  onCancel: () => void;
};

const emptyDraft = adminCatalogService.buildDraft();

export function ProductForm({ item, onSave, onImportByUrl, onCancel }: ProductFormProps) {
  const [draft, setDraft] = useState<AdminProductDraft>(emptyDraft);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setDraft(adminCatalogService.buildDraft(item));
    setFeedback(null);
  }, [item]);

  async function handleImport() {
    const normalizedUrl = importUrl.trim();
    if (!normalizedUrl) {
      return;
    }

    setIsImporting(true);
    setFeedback(null);

    const result = await onImportByUrl(normalizedUrl);
    const imported = result.imported;

    if (!result.ok || !imported) {
      setFeedback({
        type: "error",
        message: result.message
      });
      setIsImporting(false);
      return;
    }

    setDraft((current) => adminCatalogService.buildDraftFromImport(imported, current));
    setFeedback({
      type: "success",
      message: result.message
    });
    setIsImporting(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    const result = await onSave(adminCatalogService.buildCatalogItemFromDraft(draft, item));
    setFeedback({
      type: result.ok ? "success" : "error",
      message: result.message
    });

    if (result.ok && !item) {
      setDraft(emptyDraft);
    }

    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">{item ? "Editar item do catálogo" : "Cadastrar item"}</h2>
          <p className="mt-1 text-sm text-neutral-500">Formulário isolado dentro da feature admin.</p>
        </div>
        {item ? (
          <button type="button" onClick={onCancel} className="text-sm font-medium text-coral">
            Cancelar edição
          </button>
        ) : null}
      </div>

      <div className="grid gap-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-sm font-semibold text-ink">Importar por link (Mercado Livre)</p>
          <p className="mt-1 text-xs text-neutral-500">
            Cole a URL do produto para preencher automaticamente os campos principais antes da revisao manual.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              placeholder="https://produto.mercadolivre.com.br/..."
              className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-coral/40"
            />
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting || !importUrl.trim()}
              className="inline-flex items-center justify-center rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              {isImporting ? "Importando..." : "Importar por link"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-neutral-600">
            Nome
            <input
              required
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
          <label className="grid gap-2 text-sm text-neutral-600">
            Slug
            <input
              value={draft.slug}
              onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-neutral-600">
            Marca
            <input
              required
              value={draft.brand}
              onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
          <label className="grid gap-2 text-sm text-neutral-600">
            Categoria
            <input
              required
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
        </div>

        <label className="grid gap-2 text-sm text-neutral-600">
          Descrição
          <textarea
            required
            rows={4}
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
          />
        </label>

        <label className="grid gap-2 text-sm text-neutral-600">
          URL da imagem
          <input
            required
            type="url"
            value={draft.thumbnailUrl}
            onChange={(event) => setDraft((current) => ({ ...current, thumbnailUrl: event.target.value }))}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-neutral-600">
            Marketplace
            <select
              value={draft.storeId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, storeId: event.target.value as AdminProductDraft["storeId"] }))
              }
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            >
              <option value="amazon">Amazon</option>
              <option value="mercado-livre">Mercado Livre</option>
              <option value="shopee">Shopee</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-neutral-600">
            Seller
            <input
              required
              value={draft.sellerName}
              onChange={(event) => setDraft((current) => ({ ...current, sellerName: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm text-neutral-600">
            Preço
            <input
              required
              type="number"
              step="0.01"
              value={draft.price}
              onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
          <label className="grid gap-2 text-sm text-neutral-600">
            Preço original
            <input
              type="number"
              step="0.01"
              value={draft.originalPrice}
              onChange={(event) => setDraft((current) => ({ ...current, originalPrice: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
          <label className="grid gap-2 text-sm text-neutral-600">
            Popularidade
            <input
              type="number"
              value={draft.popularityScore}
              onChange={(event) => setDraft((current) => ({ ...current, popularityScore: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
        </div>

        <label className="grid gap-2 text-sm text-neutral-600">
          Link da oferta
          <input
            required
            type="url"
            value={draft.affiliateUrl}
            onChange={(event) => setDraft((current) => ({ ...current, affiliateUrl: event.target.value }))}
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-neutral-600">
            Parcelamento
            <input
              value={draft.installmentText}
              onChange={(event) => setDraft((current) => ({ ...current, installmentText: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
          <label className="grid gap-2 text-sm text-neutral-600">
            Frete
            <input
              type="number"
              step="0.01"
              value={draft.shippingCost}
              onChange={(event) => setDraft((current) => ({ ...current, shippingCost: event.target.value }))}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-coral/40"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={draft.isFeatured}
              onChange={(event) => setDraft((current) => ({ ...current, isFeatured: event.target.checked }))}
            />
            Destacar oferta
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Produto ativo
          </label>
        </div>

        {feedback ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border border-lagoon/20 bg-lagoon/10 text-lagoon"
                : "border border-coral/20 bg-coral/10 text-coral"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-70"
        >
          {isSubmitting ? "Salvando..." : "Salvar item"}
        </button>
      </div>
    </form>
  );
}
