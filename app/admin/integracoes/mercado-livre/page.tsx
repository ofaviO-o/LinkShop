import type { Metadata } from "next";

import { AdminMercadoLivreIntegrationView } from "@/features/admin/components/admin-mercado-livre-integration-view";
import { AccessGuard } from "@/features/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin - Integracao Mercado Livre",
  description: "Busca, revisao e sincronizacao manual do catalogo oficial do Mercado Livre."
};

export default function AdminMercadoLivreIntegrationPage() {
  return (
    <AccessGuard
      allowedRoles={["admin"]}
      title="Somente administradores podem entrar aqui"
      description="A integracao Mercado Livre e restrita para operacao interna."
    >
      <AdminMercadoLivreIntegrationView />
    </AccessGuard>
  );
}
