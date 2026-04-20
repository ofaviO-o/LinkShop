import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { AuthSessionProvider } from "@/features/auth";
import { SiteFooter, SiteHeader } from "@/shared/layout";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta"
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://linkshop.example"),
  title: {
    default: "LinkShop | Shopping digital de ofertas",
    template: "%s | LinkShop"
  },
  description:
    "Agregador moderno de ofertas com SEO otimizado, busca rápida, filtros inteligentes e redirecionamento para links afiliados.",
  openGraph: {
    title: "LinkShop",
    description:
      "Shopping digital com curadoria de produtos, descontos, comparações leves e arquitetura pronta para escalar.",
    siteName: "LinkShop",
    locale: "pt_BR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkShop",
    description:
      "Descubra produtos, ofertas do dia e destaques de Amazon, Shopee e Mercado Livre."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} ${grotesk.variable}`}>
      <body>
        <AuthSessionProvider />
        <div className="site-header-shell">
          <SiteHeader />
        </div>
        <div className="page-shell">
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
