# Frontend Navigation Structural Diagnosis (LinkShop)

Analysis date: 2026-04-12  
Scope: real code inspection in `app/`, `src/shared/layout`, `src/features/*` (no implementation changes).

## Executive Summary

Current navigation supports the main discovery flow well (`home -> search -> product -> store`) and stays aligned with App Router and feature-based architecture.  
The biggest risks are in the admin surface: `/admin` is indexable and access control is mostly client-side, with data loading happening before visual guard logic.  
There are also UX/navigation frictions (header with duplicated paths/CTAs, context loss when opening product details, and no active menu state).

## Current Navigation Map

### 1) Current routes

### Public pages (open access)

- `/` (home)
- `/buscar` (search/listing with query-param filters)
- `/ofertas/[slug]` (product detail + offer comparison)
- `/favoritos` (works for anonymous and authenticated users)
- `/lista` (light compare list, anonymous and authenticated)
- `/auth` (login/register)
- `/conta` (shows login CTA when user is not authenticated)
- `/api/redirect/[offerId]` (tracking + redirect)
- `/robots.txt`, `/sitemap.xml`
- global `not-found`

### Authenticated-context pages

- `/conta` (full content when authenticated)
- `/favoritos` and `/lista` (local for anonymous, sync for authenticated users)

### Administrative pages

- `/admin` (front guarded by role via `AccessGuard`)

### Primary vs secondary routes

- Primary product routes: `/`, `/buscar`, `/ofertas/[slug]`
- Retention/support routes: `/favoritos`, `/lista`, `/conta`
- Internal operations route: `/admin`
- Technical route: `/api/redirect/[offerId]`

### 2) Navigation structure

### Header and main menu

- Single global header on all pages (`app/layout.tsx` + `SiteHeader`).
- Main links: `Inicio`, `Catalogo`, `Favoritos`, `Sua lista`, `Minha conta` (when logged), `Admin` (admin role), `Entrar` (anonymous).
- Header also contains extra CTAs that duplicate existing menu destinations (`Minha conta`, `Admin`, `Entrar`).

### Secondary/context navigation

- Home: central search + product cards linking to detail pages.
- Search page: side filters + pagination.
- Product page: store CTA (via `/api/redirect/...`), favorite/list/watch actions.
- Account page: shortcuts to favorites and list.
- Admin page: single long dashboard surface (no segmented internal sub-navigation like tabs/anchors).

### Entry and return points

- Main entry: `/`.
- Intent-based entry: `/buscar`.
- Global return path: header.
- Weak contextual return from product detail: no breadcrumb and no explicit "back to filtered results".

### 3) Layouts and shells

- One global shell for all contexts (header + footer + session provider).
- No dedicated admin layout.
- `/admin` uses `dynamic = "force-dynamic"` and safe data fallback, but still uses public shell.
- Visual consistency is generally good; main inconsistency is context framing (admin looks like another public page).

### 4) User flows (as implemented)

### Anonymous visitor

1. Enters at `/`  
2. Goes to `/buscar`  
3. Opens `/ofertas/[slug]`  
4. Can save favorite/list/watch locally  
5. Can start auth at `/auth`

### Authenticated user

1. Login/register at `/auth`  
2. Anonymous data merge into user context  
3. Navigates `/conta`, `/favoritos`, `/lista`, `/ofertas/[slug]`  
4. Goes to external store through tracked redirect

### Admin user

1. Accesses `/admin` (header link appears when role is admin)  
2. Sees operational dashboard + internal catalog management  
3. No segmented admin navigation (single-page flow)

## Issues Found (by severity)

### Critical

1. `/admin` is present in sitemap and not isolated from public indexing.  
Impact: unwanted discoverability of internal surface and SEO noise.

2. `/admin` protection is mainly visual (client guard) and data loads before role gating.  
Impact: unnecessary internal endpoint calls and operational exposure risk in permissive environments.

### Important

1. Header has duplicated navigation (menu + CTA buttons to same destinations).  
Impact: cognitive load and weaker path clarity.

2. No active-state indication in main nav.  
Impact: weaker orientation, especially on mobile and long sessions.

3. Search -> product journey loses context (no breadcrumb/back with preserved filters).  
Impact: users depend on browser back behavior.

4. Search page reuses a large home hero block.  
Impact: result grid and filters are pushed down more often.

5. Account watchlist limits rendering (`limit=6`) with no explicit "view all" path.  
Impact: partial visibility and potential perception that watched items disappeared.

6. Global `not-found` copy is offer-specific for every missing route.  
Impact: confusing message outside product context.

### Cosmetic

1. Route labels can be more semantically consistent (`Catalogo`/`Buscar`, `Lista`/`Comparativa`).  
Impact: no functional break, but less clarity.

2. Admin and public contexts share the same shell with minimal visual distinction.  
Impact: mixed-context perception.

## Improvement Priority

### Critical (first)

1. Remove `/admin` from sitemap/indexing surface and reinforce noindex for internal admin pages.
2. Move admin access decision earlier in page lifecycle (before loading admin data), without breaking current architecture.

### Important (second wave)

1. Simplify header and remove duplicated destinations.
2. Add active state in main navigation.
3. Add contextual return in product detail with preserved search parameters.
4. Reduce top visual weight on search result pages.
5. Add explicit route/action to view full watchlist from account.

### Cosmetic (third wave)

1. Standardize naming in labels and headings.
2. Adjust `not-found` copy to neutral/global language.
3. Add lightweight visual separation for admin context without creating a new design system.

## Incremental Plan (safe, non-destructive)

### Phase 1 - Internal navigation governance

- Remove `/admin` from public discovery surfaces (sitemap/indexing).
- Enforce admin access gating before loading admin dashboard dependencies.
- Acceptance: non-admin users do not trigger useful admin data loading, and `/admin` is not promoted in SEO surfaces.

### Phase 2 - Main journey clarity

- Reduce header to one clear set of primary paths.
- Add active-state (`aria-current` + visual state) in main nav.
- Add "back to results" from product detail preserving search filters.
- Acceptance: round-trip between search and product no longer depends on browser back.

### Phase 3 - Retention navigation quality

- Improve discoverability of favorites/list/watch actions from account context.
- Expose "view all" when watch items exceed visible limit.
- Acceptance: users can consistently locate all saved/monitored items.

### Phase 4 - Semantic polish

- Normalize navigation terminology and heading patterns.
- Make `not-found` wording context-agnostic.
- Acceptance: lower ambiguity without changing store/service contracts.

## Code Evidence (inspected files)

- `app/layout.tsx`
- `app/page.tsx`
- `app/buscar/page.tsx`
- `app/ofertas/[slug]/page.tsx`
- `app/admin/page.tsx`
- `app/auth/page.tsx`
- `app/conta/page.tsx`
- `app/favoritos/page.tsx`
- `app/lista/page.tsx`
- `app/sitemap.ts`
- `src/shared/layout/site-header.tsx`
- `src/features/auth/components/access-guard.tsx`
- `src/features/auth/components/auth-card.tsx`
- `src/features/auth/components/account-page-view.tsx`
- `src/features/catalog/components/catalog-search-view.tsx`
- `src/features/catalog/components/home-search-hero.tsx`
- `src/features/catalog/components/catalog-filters.tsx`
- `src/features/catalog/components/catalog-product-card.tsx`
- `src/features/offers/components/offer-list.tsx`
- `src/features/admin/services/admin-page.service.ts`
- `src/features/admin/components/admin-dashboard.tsx`
- `src/features/price-alerts/components/account-price-watch-list.tsx`

## Final notes

- Structural base is solid for incremental evolution (App Router + feature modules + service layer intact).
- Recommended focus now: remove admin navigation risk points and improve clarity of the public discovery journey.
