"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/produtos", label: "Produtos" },
  { href: "/admin/produtos/importar", label: "Importar" },
  { href: "/admin/produtos/revisar", label: "Revisar" }
];

function isActive(pathname: string, href: string) {
  return pathname === href;
}

export function AdminSectionNav() {
  const pathname = usePathname();
  const isCreateActive = pathname === "/admin/produtos/novo";

  return (
    <nav className="mb-6 rounded-[1.5rem] bg-white p-3 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-2">
          {ADMIN_LINKS.map((link) => {
            const active = isActive(pathname, link.href);

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active ? "bg-coral text-white" : "bg-black/5 text-neutral-700 hover:bg-black/10"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href="/admin/produtos/novo"
          aria-label="Criar novo produto"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold transition ${
            isCreateActive ? "bg-coral text-white" : "bg-ink text-white hover:bg-neutral-800"
          }`}
        >
          +
        </Link>
      </div>
    </nav>
  );
}
