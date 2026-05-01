# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkShop is a marketplace price aggregator. Users search products, compare offers from multiple stores, track price history, set price alerts, and get redirected via affiliate links. The stack is Next.js 15 (frontend) + FastAPI (backend) + PostgreSQL.

---

## Development Commands

### Frontend (Next.js)

```bash
npm install
npm run dev          # Dev server on :3000
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run smoke:fullstack  # End-to-end smoke test (requires both services running)
```

### Backend (FastAPI) — Docker Compose (recommended)

```bash
docker compose up --build -d              # Start DB + backend
docker compose logs -f backend            # Follow logs
docker compose run --rm backend python backend/seed.py   # Seed data
docker compose down
```

PowerShell scripts wrap the above:
```powershell
.\scripts\backend.ps1 up       # Start
.\scripts\backend.ps1 migrate  # Alembic upgrade head
.\scripts\backend.ps1 seed     # Seed data
.\scripts\backend.ps1 test     # Run tests
.\scripts\backend.ps1 down     # Stop
```

### Backend — Local (without Docker)

```bash
pip install -r backend/requirements.txt
alembic -c backend/alembic.ini upgrade head
uvicorn app.main:app --reload --app-dir backend
```

### Backend Tests

Tests use SQLite in-memory (no PostgreSQL needed):
```bash
# All tests
pytest backend/tests

# Single test file
pytest backend/tests/test_auth.py

# Single test
pytest backend/tests/test_auth.py::test_login_success
```

---

## Architecture

### Backend — FastAPI (`backend/app/`)

Layered architecture: **routes → services → models**. Routes handle HTTP; services own business logic; models are SQLAlchemy ORM.

- `api/router.py` — central route registry (imports all route modules)
- `core/config.py` — Pydantic Settings; all env vars declared here
- `db/session.py` — SQLAlchemy async session factory
- `models/` — ORM models (one file per domain entity)
- `schemas/` — Pydantic request/response models
- `routes/` — HTTP handlers (thin; delegate to services)
- `services/` — business logic
- `integrations/` — third-party provider adapters (Mercado Livre, mock, JSON feed)

**Integration system:** `integrations/registry.py` maps provider names to adapters. To add a new marketplace, implement `base.py` contracts and register.

**Dev-only routes:** `routes/dev_sync.py` and `routes/dev_alerts.py` expose manual triggers. They are included only when `APP_ENV != production`.

**Auth:** JWT with short-lived access tokens (15 min default) + refresh tokens (30 days). `core/security.py` for JWT; `services/auth_service.py` for session logic. Anonymous users can sync their local state to a newly registered account via `/api/sync/anonymous`.

**Migrations:** Alembic in `backend/alembic/`. `RUN_MIGRATIONS_ON_STARTUP=true` triggers auto-migrate on container start (used in prod/Docker).

### Frontend — Next.js 15 (`app/` + `src/`)

Uses the App Router. Pages live in `app/`; all feature code lives in `src/`.

```
src/features/<domain>/
  components/   # React components
  services/     # API call functions (talk to backend)
  store/        # Zustand state slice
  types/        # TypeScript types for this domain
  data/         # Mock repositories (used when backend is unavailable)
  index.ts      # Public barrel exports
```

Features: `auth`, `catalog`, `product`, `favorites`, `price-alerts`, `cart` (compare list), `offers`, `admin`, `recent-views`.

**API client:** `src/shared/api/api-client.ts` — thin HTTP wrapper. `api-config.ts` reads `NEXT_PUBLIC_API_BASE_URL`. Server-side routes can override with `BACKEND_INTERNAL_API_BASE_URL`.

**State:** Zustand stores in `src/features/<domain>/store/`. The auth store manages tokens; other stores sync to backend on auth state changes.

**Mock data:** Each feature has a `data/` folder with mock repositories. These let the frontend run standalone without a backend.

**Redirect route:** `app/api/redirect/[offerId]/route.ts` is a Next.js Route Handler that proxies to the backend affiliate redirect endpoint to track clicks server-side.

### Environment Variables

Frontend (`.env.local`):
```
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
BACKEND_INTERNAL_API_BASE_URL=   # Optional server-side override
```

Backend (`backend/.env`):
```
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/linkshop
APP_ENV=development
APP_DEBUG=true
AUTH_SECRET_KEY=change-me-in-development
CORS_ORIGINS=http://localhost:3000
```

### Database & Migrations

Use Alembic for all schema changes:
```bash
# Create migration
alembic -c backend/alembic.ini revision --autogenerate -m "description"

# Apply
alembic -c backend/alembic.ini upgrade head

# Rollback one step
alembic -c backend/alembic.ini downgrade -1
```

### Offer Ranking

`services/offer_ranking_service.py` ranks offers by a quality score — not just lowest price. This score weighs store reliability, price, and availability. Admin can inspect ranking via `/api/admin/ranking/products/{id}`.

### Price Alerts

`services/alert_evaluation_service.py` evaluates price watches. Manually triggered via `backend/evaluate_alerts.py` or the dev endpoint `/api/dev/evaluate-alerts`. Alert events are stored in `alert_events` table and surfaced in admin analytics.

---

## Deployment

- **Frontend:** Vercel. Set `NEXT_PUBLIC_API_BASE_URL` to the backend URL.
- **Backend:** Docker container (Render or similar). Uses `docker-compose.prod.yml` + `scripts/release-backend.ps1`.
- **CI:** `.github/workflows/backend-ci.yml` runs migrations + seed + pytest against a real PostgreSQL service container.
