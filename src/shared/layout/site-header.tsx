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

type HeaderMenuProps = {
  mode: "top" | "floating";
  isAdmin: boolean;
  isAuthenticated: boolean;
  onSignOut: () => void;
};

const TOP_ZONE = 72;
const NOISE_THRESHOLD = 1.5;
const SHOW_ON_UP_THRESHOLD = 8;
const HIDE_ON_DOWN_THRESHOLD = 10;

function HeaderMenu({ mode, isAdmin, isAuthenticated, onSignOut }: HeaderMenuProps) {
  const isTopHeader = mode === "top";
  const summaryClassName = isTopHeader
    ? "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-white/10 text-white transition hover:bg-white/16"
    : "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-white/10 text-white transition hover:bg-white/16";
  const menuClassName = isTopHeader
    ? "absolute right-0 top-[calc(100%+0.75rem)] z-50 grid min-w-[13rem] gap-1 rounded-2xl border border-white/18 bg-[#fff7f2] p-2 text-sm text-ink shadow-glow"
    : "absolute right-0 top-[calc(100%+0.75rem)] z-50 grid min-w-[13rem] gap-1 rounded-2xl border border-white/18 bg-[#fff7f2] p-2 text-sm text-ink shadow-glow";
  const itemClassName = "rounded-xl px-3 py-2 text-left transition hover:bg-black/5";

  return (
    <details className="relative">
      <summary className={summaryClassName}>
        <span className="sr-only">Abrir menu</span>
        <span className="grid gap-[3px]">
          <span className="block h-[2px] w-4 rounded-full bg-white" />
          <span className="block h-[2px] w-4 rounded-full bg-white" />
          <span className="block h-[2px] w-4 rounded-full bg-white" />
        </span>
      </summary>

      <div className={menuClassName}>
        {isAuthenticated ? (
          <>
            <Link href="/conta" className={itemClassName}>
              Conta
            </Link>
            {isAdmin ? (
              <Link href="/admin" className={itemClassName}>
                Admin
              </Link>
            ) : null}
            <button type="button" onClick={onSignOut} className={itemClassName}>
              Sair
            </button>
          </>
        ) : (
          <Link href="/auth" className={itemClassName}>
            Entrar / Cadastrar
          </Link>
        )}
      </div>
    </details>
  );
}

function HeaderNav({
  mode,
  pathname,
  favoritesCount,
  cartItemsCount
}: Pick<HeaderContentProps, "mode" | "pathname" | "favoritesCount" | "cartItemsCount">) {
  const isTopHeader = mode === "top";

  function navItemClass(href: string) {
    const matchesProductsAlias =
      href === "/buscar" && (pathname === "/produtos" || pathname.startsWith("/produtos/"));
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) || matchesProductsAlias;

    return `rounded-full px-3 py-1.5 text-sm transition ${
      isTopHeader
        ? isActive
          ? "bg-white/18 text-white"
          : "text-white/82 hover:bg-white/12"
        : isActive
          ? "bg-white/18 text-white"
          : "text-white/82 hover:bg-white/12"
    }`;
  }

  return (
    <nav
      className={`flex flex-wrap items-center justify-center text-sm ${
        isTopHeader ? "gap-1.5 text-white/82" : "gap-1 text-white/82"
      }`}
    >
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
  );
}

function SearchForm({
  mode,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit
}: Pick<HeaderContentProps, "mode" | "searchQuery" | "onSearchQueryChange" | "onSearchSubmit">) {
  const isTopHeader = mode === "top";
  const formClassName = isTopHeader
    ? "flex w-full min-w-0 max-w-[36rem] gap-2"
    : "flex w-full min-w-0 max-w-[32rem] justify-self-start gap-2";

  return (
    <form onSubmit={onSearchSubmit} className={formClassName}>
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder="Buscar produto, marca ou categoria"
        className={`min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none transition ${
          isTopHeader
            ? "border border-white/24 bg-white text-ink placeholder:text-neutral-400 focus:border-white/50"
            : "border border-white/24 bg-white text-ink placeholder:text-neutral-400 focus:border-white/50"
        }`}
      />
      <button
        type="submit"
        className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
          isTopHeader ? "bg-ink text-white hover:bg-neutral-900" : "bg-ink text-white hover:bg-neutral-900"
        }`}
      >
        Buscar
      </button>
    </form>
  );
}

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
  const isTopHeader = mode === "top";

  if (!isTopHeader) {
    return (
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_auto_auto] md:items-center">
        <SearchForm
          mode={mode}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          onSearchSubmit={onSearchSubmit}
        />

        <div className="justify-self-center">
          <HeaderNav
            mode={mode}
            pathname={pathname}
            favoritesCount={favoritesCount}
            cartItemsCount={cartItemsCount}
          />
        </div>

        <div className="justify-self-end">
          <HeaderMenu mode={mode} isAdmin={isAdmin} isAuthenticated={isAuthenticated} onSignOut={onSignOut} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/25 bg-white/12 font-display text-xs font-bold tracking-[0.16em] text-white md:h-10 md:w-10">
            LS
          </span>
          <div>
            <strong className="block font-display text-sm text-white md:text-base">LinkShop</strong>
            <span className="hidden text-xs text-white/74 md:block">Comparador de precos e ofertas</span>
          </div>
        </Link>

        <HeaderMenu mode={mode} isAdmin={isAdmin} isAuthenticated={isAuthenticated} onSignOut={onSignOut} />
      </div>

      <SearchForm
        mode={mode}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        onSearchSubmit={onSearchSubmit}
      />

      <HeaderNav
        mode={mode}
        pathname={pathname}
        favoritesCount={favoritesCount}
        cartItemsCount={cartItemsCount}
      />
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
      <header
        data-site-header-boundary
        className="w-full border-b border-black/10 bg-gradient-to-r from-coral via-orange-500 to-orange-400 px-3 py-3 text-white md:px-6 md:py-4"
      >
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

      <div className="pointer-events-none fixed left-0 top-2 z-40 w-screen px-3 md:px-4">
        <div
          data-site-header-boundary
          className={`pointer-events-auto w-full rounded-[1.75rem] border border-white/20 bg-gradient-to-r from-coral via-orange-500 to-orange-400 px-3 py-3 text-white shadow-glow transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform md:px-6 md:py-4 ${
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
    </>
  );
}
