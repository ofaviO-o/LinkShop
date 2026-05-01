# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão Geral do Projeto

LinkShop é um agregador de preços de marketplaces. Usuários buscam produtos, comparam ofertas de múltiplas lojas, acompanham histórico de preços, configuram alertas de preço e são redirecionados via links de afiliado. Stack: Next.js 15 (frontend) + FastAPI (backend) + PostgreSQL.

---

## Comandos de Desenvolvimento

### Frontend (Next.js)

```bash
npm install
npm run dev          # Servidor de dev na :3000
npm run build        # Build de produção
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run smoke:fullstack  # Smoke test end-to-end (requer ambos os serviços rodando)
```

### Backend (FastAPI) — Docker Compose (recomendado)

```bash
docker compose up --build -d              # Inicia DB + backend
docker compose logs -f backend            # Acompanhar logs
docker compose run --rm backend python backend/seed.py   # Popular dados
docker compose down
```

Scripts PowerShell que encapsulam os comandos acima:
```powershell
.\scripts\backend.ps1 up       # Iniciar
.\scripts\backend.ps1 migrate  # Alembic upgrade head
.\scripts\backend.ps1 seed     # Popular dados
.\scripts\backend.ps1 test     # Rodar testes
.\scripts\backend.ps1 down     # Parar
```

### Backend — Local (sem Docker)

```bash
pip install -r backend/requirements.txt
alembic -c backend/alembic.ini upgrade head
uvicorn app.main:app --reload --app-dir backend
```

### Testes do Backend

Os testes usam SQLite em memória (não é necessário PostgreSQL):
```bash
# Todos os testes
pytest backend/tests

# Arquivo específico
pytest backend/tests/test_auth.py

# Teste específico
pytest backend/tests/test_auth.py::test_login_success
```

---

## Arquitetura

### Backend — FastAPI (`backend/app/`)

Arquitetura em camadas: **routes → services → models**. Routes tratam HTTP; services têm a lógica de negócio; models são ORM SQLAlchemy.

- `api/router.py` — registro central de rotas (importa todos os módulos de rota)
- `core/config.py` — Pydantic Settings; todas as env vars declaradas aqui
- `db/session.py` — factory de sessão SQLAlchemy
- `models/` — modelos ORM (um arquivo por entidade de domínio)
- `schemas/` — modelos Pydantic de request/response
- `routes/` — handlers HTTP (finos; delegam para services)
- `services/` — lógica de negócio
- `integrations/` — adaptadores de provedores externos (Mercado Livre, mock, JSON feed)

**Sistema de integração:** `integrations/registry.py` mapeia nomes de provedores para adaptadores. Para adicionar um novo marketplace, implemente os contratos de `base.py` e registre.

**Rotas apenas para dev:** `routes/dev_sync.py` e `routes/dev_alerts.py` expõem triggers manuais. Incluídos apenas quando `APP_ENV != production`.

**Auth:** JWT com access tokens de vida curta (15 min padrão) + refresh tokens (30 dias). `core/security.py` para JWT; `services/auth_service.py` para lógica de sessão. Usuários anônimos podem sincronizar o estado local para uma conta recém-criada via `/api/sync/anonymous`.

**Migrations:** Alembic em `backend/alembic/`. `RUN_MIGRATIONS_ON_STARTUP=true` dispara auto-migrate na inicialização do container (usado em prod/Docker).

### Frontend — Next.js 15 (`app/` + `src/`)

Usa App Router. Pages ficam em `app/`; todo o código de feature fica em `src/`.

```
src/features/<dominio>/
  components/   # Componentes React
  services/     # Funções de chamada à API (falam com o backend)
  store/        # Slice de estado Zustand
  types/        # Tipos TypeScript deste domínio
  data/         # Repositórios mock (usados quando o backend está indisponível)
  index.ts      # Barrel exports públicos
```

Features: `auth`, `catalog`, `product`, `favorites`, `price-alerts`, `cart` (lista de comparação), `offers`, `admin`, `recent-views`.

**API client:** `src/shared/api/api-client.ts` — wrapper HTTP simples. `api-config.ts` lê `NEXT_PUBLIC_API_BASE_URL`. Rotas server-side podem sobrescrever com `BACKEND_INTERNAL_API_BASE_URL`.

**Estado:** Stores Zustand em `src/features/<dominio>/store/`. O auth store gerencia tokens; outros stores sincronizam com o backend quando o estado de auth muda.

**Dados mock:** Cada feature tem uma pasta `data/` com repositórios mock. Permitem o frontend rodar isolado sem backend.

**Rota de redirect:** `app/api/redirect/[offerId]/route.ts` é um Next.js Route Handler que faz proxy para o endpoint de redirect afiliado do backend para rastrear cliques no server-side.

### Variáveis de Ambiente

Frontend (`.env.local`):
```
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
BACKEND_INTERNAL_API_BASE_URL=   # Sobrescrita server-side opcional
```

Backend (`backend/.env`):
```
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/linkshop
APP_ENV=development
APP_DEBUG=true
AUTH_SECRET_KEY=change-me-in-development
CORS_ORIGINS=http://localhost:3000
```

### Banco de Dados e Migrations

Use Alembic para todas as mudanças de schema:
```bash
# Criar migration
alembic -c backend/alembic.ini revision --autogenerate -m "descricao"

# Aplicar
alembic -c backend/alembic.ini upgrade head

# Reverter um passo
alembic -c backend/alembic.ini downgrade -1
```

### Ranking de Ofertas

`services/offer_ranking_service.py` ranqueia ofertas por um score de qualidade — não apenas pelo menor preço. O score considera confiabilidade da loja, preço e disponibilidade. Admin pode inspecionar o ranking via `/api/admin/ranking/products/{id}`.

### Alertas de Preço

`services/alert_evaluation_service.py` avalia watches de preço. Disparado manualmente via `backend/evaluate_alerts.py` ou pelo endpoint dev `/api/dev/evaluate-alerts`. Eventos de alerta ficam na tabela `alert_events` e são exibidos no painel admin.

### Integração Mercado Livre

**OAuth:** `services/mercado_livre_oauth_service.py` gerencia tokens. `resolve_access_token()` não retorna token expirado — se o refresh falhar e o token já expirou, retorna env var ou `None`.

**Busca dual:**
- Com token OAuth → endpoint de catálogo `/products/search?` + validação por item via `/products/{id}`
- Sem token → endpoint público `/sites/MLB/search` (sem validação de disponibilidade por item)

**Validação de disponibilidade (catálogo):** `_resolve_catalog_display_item()` em `integrations/catalog/mercado_livre_provider.py` rejeita produtos sem `buy_box_winner` confirmado. Falha na API → rejeita (fail-closed).

**Serviço de disponibilidade:** `services/mercado_livre_availability_service.py` — cache em memória (TTL 10 min), chama `/products/{id}`, retorna `available|unavailable|unknown`.

**Guard de redirect:** `routes/redirect.py` bloqueia com HTTP 409 se o produto ML de catálogo (`/p/MLB...`) estiver indisponível antes de redirecionar o usuário.

---

## Deploy

- **Frontend:** Vercel. Definir `NEXT_PUBLIC_API_BASE_URL` com a URL do backend.
- **Backend:** Container Docker (Render ou similar). Usa `docker-compose.prod.yml` + `scripts/release-backend.ps1`.
- **CI:** `.github/workflows/backend-ci.yml` roda migrations + seed + pytest contra um container PostgreSQL real.
