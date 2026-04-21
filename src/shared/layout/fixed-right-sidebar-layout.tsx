"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

type FixedRightSidebarLayoutProps = {
  main: ReactNode;
  sidebar: ReactNode;
  className?: string;
  mainClassName?: string;
  sidebarClassName?: string;
  desktopSidebarWidth?: number;
  desktopGap?: number;
  desktopTopOffset?: number;
  desktopMinMainWidth?: number;
  collapsedToggleLabel?: string;
};

type LayoutMetrics = {
  viewportWidth: number | null;
  containerWidth: number;
  containerRight: number;
  headerBottom: number;
};

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FixedRightSidebarLayout({
  main,
  sidebar,
  className,
  mainClassName,
  sidebarClassName,
  desktopSidebarWidth = 320,
  desktopGap = 32,
  desktopTopOffset = 160,
  desktopMinMainWidth = 760,
  collapsedToggleLabel = "Filtrar"
}: FixedRightSidebarLayoutProps) {
  const layoutRef = useRef<HTMLElement | null>(null);
  const [layoutMetrics, setLayoutMetrics] = useState<LayoutMetrics>({
    viewportWidth: null,
    containerWidth: 0,
    containerRight: 0,
    headerBottom: desktopTopOffset
  });
  const [isCollapsedPanelOpen, setIsCollapsedPanelOpen] = useState(false);

  const desktopBreakpoint = 1280;
  const edgeOffset = 16;
  const collapsedHandleWidth = 48;

  useEffect(() => {
    function syncLayoutMetrics() {
      const nextViewportWidth = window.innerWidth;
      const rect = layoutRef.current?.getBoundingClientRect();
      const headerBottom = Array.from(document.querySelectorAll<HTMLElement>("[data-site-header-boundary]")).reduce(
        (maxBottom, element) => {
          const elementRect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          const isVisible =
            computedStyle.display !== "none" &&
            computedStyle.visibility !== "hidden" &&
            Number.parseFloat(computedStyle.opacity || "1") > 0.05 &&
            elementRect.bottom > 0;

          if (!isVisible) {
            return maxBottom;
          }

          return Math.max(maxBottom, elementRect.bottom);
        },
        desktopTopOffset
      );

      setLayoutMetrics({
        viewportWidth: nextViewportWidth,
        containerWidth: rect?.width ?? 0,
        containerRight: rect?.right ?? nextViewportWidth,
        headerBottom
      });
    }

    syncLayoutMetrics();

    const observer =
      typeof ResizeObserver !== "undefined" && layoutRef.current
        ? new ResizeObserver(() => syncLayoutMetrics())
        : null;

    if (observer && layoutRef.current) {
      observer.observe(layoutRef.current);
    }

    window.addEventListener("resize", syncLayoutMetrics, { passive: true });
    window.addEventListener("scroll", syncLayoutMetrics, { passive: true });

    return () => {
      window.removeEventListener("resize", syncLayoutMetrics);
      window.removeEventListener("scroll", syncLayoutMetrics);
      observer?.disconnect();
    };
  }, [desktopTopOffset]);

  const viewportWidth = layoutMetrics.viewportWidth ?? 0;
  const isDesktop = viewportWidth >= desktopBreakpoint;
  const sidebarLeft = viewportWidth - edgeOffset - desktopSidebarWidth;
  const hasEnoughMainWidth = layoutMetrics.containerWidth >= desktopMinMainWidth;
  const hasDockingLane = sidebarLeft >= layoutMetrics.containerRight + desktopGap;
  const canDockSidebar = isDesktop && hasEnoughMainWidth && hasDockingLane;
  const effectiveTopOffset = Math.ceil(layoutMetrics.headerBottom + 12);

  useEffect(() => {
    if (!isDesktop || canDockSidebar) {
      setIsCollapsedPanelOpen(false);
    }
  }, [isDesktop, canDockSidebar]);

  const mainStyle = useMemo(
    () =>
      ({
        maxWidth: `${desktopMinMainWidth + 320}px`
      }) as CSSProperties,
    [desktopMinMainWidth]
  );

  const dockedPanelStyle = useMemo(
    () =>
      ({
        top: `${effectiveTopOffset}px`,
        width: `${desktopSidebarWidth}px`,
        height: `calc(100vh - ${effectiveTopOffset + 16}px)`
      }) as CSSProperties,
    [desktopSidebarWidth, effectiveTopOffset]
  );

  const collapsedDrawerStyle = useMemo(
    () =>
      ({
        top: `${effectiveTopOffset}px`,
        width: `${desktopSidebarWidth + collapsedHandleWidth}px`,
        height: `calc(100vh - ${effectiveTopOffset + 16}px)`
      }) as CSSProperties,
    [collapsedHandleWidth, desktopSidebarWidth, effectiveTopOffset]
  );

  const collapsedDrawerMotionStyle = useMemo(
    () =>
      ({
        transform: isCollapsedPanelOpen ? "translate3d(0, 0, 0)" : `translate3d(${desktopSidebarWidth}px, 0, 0)`
      }) as CSSProperties,
    [desktopSidebarWidth, isCollapsedPanelOpen]
  );

  const collapsedPanelStyle = useMemo(
    () =>
      ({
        width: `${desktopSidebarWidth}px`,
        marginLeft: `${collapsedHandleWidth}px`
      }) as CSSProperties,
    [collapsedHandleWidth, desktopSidebarWidth]
  );

  return (
    <section ref={layoutRef} className={joinClasses("mt-6", className)}>
      <div className="min-w-0">
        <div className={joinClasses("mx-auto min-w-0", mainClassName)} style={mainStyle}>
          {main}
        </div>
      </div>

      {!isDesktop ? (
        <aside className={joinClasses("mt-6 min-w-0", sidebarClassName)}>{sidebar}</aside>
      ) : canDockSidebar ? (
        <aside
          className={joinClasses("fixed right-4 z-30 mt-0 overflow-y-auto overscroll-contain 2xl:right-6", sidebarClassName)}
          style={dockedPanelStyle}
        >
          {sidebar}
        </aside>
      ) : (
        <div
          className="fixed z-30 overflow-visible transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform"
          style={{
            right: `${edgeOffset}px`,
            ...collapsedDrawerStyle,
            ...collapsedDrawerMotionStyle
          }}
        >
          <button
            type="button"
            onClick={() => setIsCollapsedPanelOpen((current) => !current)}
            aria-expanded={isCollapsedPanelOpen}
            aria-label={isCollapsedPanelOpen ? "Fechar filtros" : "Abrir filtros"}
            title={collapsedToggleLabel}
            className="absolute left-0 top-1/2 z-40 inline-flex h-16 w-12 -translate-y-1/2 items-center justify-center rounded-l-[1.35rem] border border-r-0 border-white/60 bg-white/95 text-lg font-semibold text-neutral-600 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur transition-[background-color,color,box-shadow] duration-300 ease-out hover:bg-white hover:text-ink hover:shadow-[0_14px_36px_rgba(15,23,42,0.12)]"
          >
            <span
              className={`leading-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isCollapsedPanelOpen ? "rotate-180" : "rotate-0"
              }`}
            >
              &lsaquo;
            </span>
          </button>

          <aside
            className={joinClasses(
              "ml-auto h-full overflow-y-auto overscroll-contain rounded-[2rem] border border-white/60 bg-white/95 p-2 shadow-glow backdrop-blur",
              sidebarClassName
            )}
            style={collapsedPanelStyle}
          >
            {sidebar}
          </aside>
        </div>
      )}
    </section>
  );
}
