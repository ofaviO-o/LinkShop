"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuthStore, useCartStore, useFavoritesStore } from "@/stores";
import { getPreferenceOwnerId } from "@/shared/lib/identity";

type HeaderContentProps = {
  mode: "top" | "floating";
  pathname: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isAdmin: boolean;
  isAuthenticated: boolean;
  favoritesCount: number;
  cartItemsCount: number;
  onSignOut: () => void;
};

const TOP_ZONE = 72;
const NOISE_THRESHOLD = 1.5;
const SHOW_ON_UP_THRESHOLD = 8;
const HIDE_ON_DOWN_THRESHOLD = 10;

function HeaderContent({
  mode,
  pathname,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  isAdmin,
  isAuthenticated,
  favoritesCount,
  cartItemsCount,
  onSignOut
}: HeaderContentProps) {
  function navItemClass(href: string) {
    const matchesProductsAlias =
      href === "/buscar" && (pathname === "/produtos" || pathname.startsWith("/produtos/"));
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) || matchesProductsAlias;

    return `rounded-full px-3 py-1.5 text-sm transition ${
      isActive ? "bg-black/10 text-ink" : "text-neutral-600 hover:bg-black/5"
    }`;
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-coral to-orange-400 font-display text-xs font-bold tracking-[0.16em] text-white md:h-10 md:w-10">
            LS
          </span>
          <div>
            <strong className="block font-display text-sm md:text-base">LinkShop</strong>
            <span className="hidden text-xs text-neutral-500 md:block">Comparador de precos e ofertas</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Link
              href="/admin"
              className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-black/10"
            >
              Admin
            </Link>
          ) : null}

          {isAuthenticated ? (
            <>
              <Link href="/conta" className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-black/10">
                Conta
              </Link>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-black/10"
              >
                Sair
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
            >
              Entrar / Cadastrar
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Buscar produto, marca ou categoria"
          className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm outline-none transition focus:border-coral/40"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Buscar
        </button>
      </form>

      <nav className={`flex flex-wrap items-center text-sm text-neutral-600 ${mode === "floating" ? "gap-1" : "gap-1.5"}`}>
        <Link href="/" className={navItemClass("/")}>
          Inicio
        </Link>
        <Link href="/buscar" className={navItemClass("/buscar")}>
          Produtos
        </Link>
        <Link href="/favoritos" className={navItemClass("/favoritos")}>
          Favoritos ({favoritesCount})
        </Link>
        <Link href="/lista" className={navItemClass("/lista")}>
          Carrinho ({cartItemsCount})
        </Link>
      </nav>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const signOut = useAuthStore((state) => state.signOut);
  const favorites = useFavoritesStore((state) => state.favorites);
  const carts = useCartStore((state) => state.carts);

  const role = session?.user.role ?? "guest";
  const isAdmin = role === "admin";
  const isAuthenticated = Boolean(session);
  const ownerId = useMemo(() => getPreferenceOwnerId(session), [session]);
  const favoritesCount = favorites.filter((favorite) => favorite.userId === ownerId).length;
  const cart = carts.find((entry) => entry.ownerId === ownerId);
  const cartItemsCount = cart?.totalItems ?? 0;

  const [searchQuery, setSearchQuery] = useState("");
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);
  const isFloatingVisibleRef = useRef(false);

  const lastScrollYRef = useRef(0);
  const upTravelRef = useRef(0);
  const downTravelRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (pathname === "/buscar" || pathname === "/produtos") {
      const queryFromUrl = new URLSearchParams(window.location.search).get("q") ?? "";
      setSearchQuery(queryFromUrl);
    } else {
      setSearchQuery("");
    }
  }, [pathname]);

  useEffect(() => {
    setIsFloatingVisible(false);
    isFloatingVisibleRef.current = false;
    upTravelRef.current = 0;
    downTravelRef.current = 0;
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    lastScrollYRef.current = window.scrollY;
    setIsFloatingVisible(false);
    isFloatingVisibleRef.current = false;
    upTravelRef.current = 0;
    downTravelRef.current = 0;

    function setFloatingVisible(nextVisible: boolean) {
      if (isFloatingVisibleRef.current === nextVisible) {
        return;
      }

      isFloatingVisibleRef.current = nextVisible;
      setIsFloatingVisible(nextVisible);
    }

    function handleScroll() {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;

        const currentY = window.scrollY;
        const delta = currentY - lastScrollYRef.current;

        if (Math.abs(delta) < NOISE_THRESHOLD) {
          return;
        }

        if (currentY <= TOP_ZONE) {
          upTravelRef.current = 0;
          downTravelRef.current = 0;
          if (isFloatingVisibleRef.current) {
            setFloatingVisible(false);
          }
          lastScrollYRef.current = currentY;
          return;
        }

        if (delta < 0) {
          upTravelRef.current += Math.abs(delta);
          downTravelRef.current = 0;

          if (!isFloatingVisibleRef.current && upTravelRef.current >= SHOW_ON_UP_THRESHOLD) {
            setFloatingVisible(true);
            upTravelRef.current = 0;
          }
        } else {
          downTravelRef.current += delta;
          upTravelRef.current = 0;

          if (isFloatingVisibleRef.current && downTravelRef.current >= HIDE_ON_DOWN_THRESHOLD) {
            setFloatingVisible(false);
            downTravelRef.current = 0;
          }
        }

        lastScrollYRef.current = currentY;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = searchQuery.trim();
    const nextParams = new URLSearchParams();

    if (nextQuery) {
      nextParams.set("q", nextQuery);
    }

    router.push(`/buscar${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
  }

  return (
    <>
      <header className="glass-panel px-3 py-3 md:px-5 md:py-4">
        <HeaderContent
          mode="top"
          pathname={pathname}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          isAdmin={isAdmin}
          isAuthenticated={isAuthenticated}
          favoritesCount={favoritesCount}
          cartItemsCount={cartItemsCount}
          onSignOut={() => void signOut()}
        />
      </header>

      <div className="pointer-events-none fixed left-0 top-2 z-40 w-full px-3 md:px-0">
        <div className="mx-auto w-[min(100%-1.5rem,80rem)] md:w-[min(100%-2rem,80rem)]">
          <div
            className={`glass-panel pointer-events-auto px-3 py-3 transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform md:px-5 md:py-4 ${
              isFloatingVisible ? "translate-y-0 opacity-100" : "-translate-y-[108%] opacity-0"
            }`}
          >
            <HeaderContent
              mode="floating"
              pathname={pathname}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSearchSubmit={handleSearchSubmit}
              isAdmin={isAdmin}
              isAuthenticated={isAuthenticated}
              favoritesCount={favoritesCount}
              cartItemsCount={cartItemsCount}
              onSignOut={() => void signOut()}
            />
          </div>
        </div>
      </div>
    </>
  );
}
