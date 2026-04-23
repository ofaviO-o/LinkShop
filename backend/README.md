# LinkShop Backend

Base inicial do backend em FastAPI para o comparador de precos.

## Checklist rapido de producao (Render)

1. Variaveis obrigatorias no backend:
   - `DATABASE_URL`
   - `AUTH_SECRET_KEY`
   - `RUN_MIGRATIONS_ON_STARTUP`
   - `CORS_ORIGINS`
2. Em Render, use explicitamente `RUN_MIGRATIONS_ON_STARTUP=true`.
3. Ordem recomendada:
   - ajustar envs no Render
   - fazer deploy do backend
   - validar `GET /health` e `GET /health/ready`
   - depois validar login/cadastro e fluxos no frontend
4. Backend subiu corretamente quando:
   - `GET /health` retorna `200`
   - `GET /health/ready` retorna `200`
5. O frontend depende das URLs corretas do backend em producao (ex.: `NEXT_PUBLIC_API_BASE_URL` apontando para a API publica).
6. Em producao, `CORS_ORIGINS` deve incluir o dominio publico do frontend (Vercel) e nao apenas localhost.

## Estrutura

```text
backend/
  app/
    api/
    core/
    db/
    integrations/
    models/
    routes/
    schemas/
    services/
    main.py
  seed.py
  requirements.txt
  .env.example
  .env.test.example
  .env.production.example
  DEPLOY.md
  SMOKE_CHECKS.md
```

## Como rodar

1. Crie e ative um ambiente virtual Python.
2. Instale as dependencias:

```bash
pip install -r backend/requirements.txt
```

3. Copie `backend/.env.example` para `backend/.env` e ajuste a `DATABASE_URL`.
   Se necessario, ajuste tambem `APP_HOST`, `APP_PORT`, `WEB_CONCURRENCY`, `CORS_ORIGINS`, `AUTH_SECRET_KEY` e `LOG_LEVEL`.
   Em plataformas como Render, `PORT` (quando presente) sobrescreve `APP_PORT`.
4. Suba um PostgreSQL local.
5. Rode as migracoes:

```bash
alembic -c backend/alembic.ini upgrade head
```

6. Rode o seed:

```bash
python backend/seed.py
```

Credenciais locais padrao apos o seed:

- admin: `admin@linkshop.dev` / `123456`
- usuario demo: `user@linkshop.dev` / `123456`

Se voce quiser apenas garantir o admin sem repopular o restante da base, use:

```bash
python backend/ensure_admin_user.py
```

Esse bootstrap local continua manual. O startup do FastAPI nao cria admin automaticamente fora dos fluxos containerizados com migracao habilitada.

7. Inicie a API:

```bash
uvicorn app.main:app --reload --app-dir backend
```

## Docker e ambiente reprodutivel

Arquivos principais:

- [Dockerfile](/c:/Users/flavi/Desktop/LinkShop/backend/Dockerfile)
- [docker-entrypoint.sh](/c:/Users/flavi/Desktop/LinkShop/backend/docker-entrypoint.sh)
- [docker-compose.yml](/c:/Users/flavi/Desktop/LinkShop/docker-compose.yml)
- [docker-compose.prod.yml](/c:/Users/flavi/Desktop/LinkShop/docker-compose.prod.yml)
- [.env.deploy.example](/c:/Users/flavi/Desktop/LinkShop/.env.deploy.example)
- [release-backend.ps1](/c:/Users/flavi/Desktop/LinkShop/scripts/release-backend.ps1)

Fluxo recomendado com containers:

1. Copie `backend/.env.example` para `backend/.env`
2. Suba banco e backend:

```bash
docker compose up --build -d
```

3. Acompanhe os logs:

```bash
docker compose logs -f backend
```

O backend sobe com migracoes automáticas habilitadas por `RUN_MIGRATIONS_ON_STARTUP=true`.
O seed continua sendo manual para evitar carga inesperada de dados.

Para rodar seed no ambiente containerizado:

```bash
docker compose run --rm backend python backend/seed.py
```

Para rodar migracoes manualmente:

```bash
docker compose run --rm backend alembic -c backend/alembic.ini upgrade head
```

Para rodar testes:

```bash
docker compose run --rm backend pytest backend/tests
```

Para rodar smoke check operacional pos-subida:

```bash
docker compose run --rm -e SMOKE_BASE_URL=http://backend:8000 backend python backend/post_deploy_smoke.py
```

Para derrubar tudo:

```bash
docker compose down
```

Para um deploy externo controlado (primeira subida real), veja:

- [DEPLOY.md](/c:/Users/flavi/Desktop/LinkShop/backend/DEPLOY.md)
- [DEPLOY_EXTERNAL.md](/c:/Users/flavi/Desktop/LinkShop/DEPLOY_EXTERNAL.md)
- [FULLSTACK_VALIDATION.md](/c:/Users/flavi/Desktop/LinkShop/FULLSTACK_VALIDATION.md)

## Configuracao por ambiente

Arquivos base:

- desenvolvimento: [`.env.example`](/c:/Users/flavi/Desktop/LinkShop/backend/.env.example)
- teste: [`.env.test.example`](/c:/Users/flavi/Desktop/LinkShop/backend/.env.test.example)
- producao inicial: [`.env.production.example`](/c:/Users/flavi/Desktop/LinkShop/backend/.env.production.example)
- compose/release: [`.env.deploy.example`](/c:/Users/flavi/Desktop/LinkShop/.env.deploy.example)

Variaveis novas e importantes:

- `APP_HOST`
- `APP_PORT`
- `PORT` (opcional para plataformas; tem prioridade sobre `APP_PORT`)
- `WEB_CONCURRENCY`
- `RUN_MIGRATIONS_ON_STARTUP`
- `INTEGRATION_JSON_FEED_PATH`

Regras atuais:

- `production` exige `APP_DEBUG=false`
- `production` exige `AUTH_SECRET_KEY` diferente do default
- `production` exige `CORS_ORIGINS` configurado

## Automacao basica de desenvolvimento

Para reduzir atrito no dia a dia, existe um script PowerShell em [backend.ps1](/c:/Users/flavi/Desktop/LinkShop/scripts/backend.ps1).

Exemplos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 up
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 migrate
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 seed
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 test
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 down
```

Acoes disponiveis:

- `up`: sobe `db` e `backend` com Docker Compose
- `down`: derruba o ambiente
- `logs`: acompanha logs do backend
- `migrate`: aplica migracoes Alembic
- `seed`: executa o seed
- `test`: roda a suite de testes
- `compile`: valida compilacao Python
- `ci-check`: executa compile + migrate + seed + tests
- `ps`: mostra status dos containers
- `smoke`: executa smoke check operacional pos-subida
- `smoke-dev`: executa smoke check operacional incluindo endpoints internos de desenvolvimento

## Healthchecks

- `GET /health`: liveness simples do processo
- `GET /health/ready`: readiness com validacao de conexao ao banco, configuracao minima e integracoes registradas

Exemplo:

```http
GET /health
GET /health/ready
```

O backend tambem devolve `X-Request-ID` em todas as respostas para facilitar correlacao de logs e diagnostico.
No `docker-compose`, o servico `backend` usa `GET /health/ready` como healthcheck do container.

## Paginacao

- O padrao reutilizavel de listagem usa:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 120
  }
}
```

- Nesta etapa ele foi aplicado de forma incremental em `GET /api/products`, para fortalecer a base operacional sem quebrar os contratos de endpoints que o front ja consome hoje.
- Tambem foi expandido para superfices internas/admin:
  - `GET /api/admin/analytics/click-events`
  - `GET /api/admin/analytics/alert-events`

## Endpoints iniciais

- `GET /health`
- `GET /health/ready`
- `GET /api/products`
- `GET /api/products/search`
- `GET /api/products/by-slug/{slug}`
- `GET /api/products/{product_id}`
- `GET /api/products/{product_id}/price-history`
- `GET /api/offers?productId=...`
- `GET /api/stores`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/me/favorites`
- `POST /api/me/favorites`
- `DELETE /api/me/favorites/{product_id}`
- `GET /api/me/compare-list`
- `POST /api/me/compare-list`
- `PATCH /api/me/compare-list/{item_id}`
- `DELETE /api/me/compare-list/{item_id}`
- `GET /api/me/price-watches`
- `POST /api/me/price-watches`
- `PATCH /api/me/price-watches/{watch_id}`
- `DELETE /api/me/price-watches/{watch_id}`
- `POST /api/sync/anonymous`
- `GET /api/redirect/{offer_id}`
- `GET /api/admin/analytics/clicks?periodDays=30`
- `GET /api/admin/analytics/alerts?periodDays=30`
- `GET /api/admin/analytics/click-events?page=1&pageSize=20`
- `GET /api/admin/analytics/alert-events?page=1&pageSize=20`
- `GET /api/admin/ranking/products/{product_id}`
- `POST /api/dev/sync/offers?provider=mock-marketplace`
- `POST /api/dev/sync/offers?provider=json-feed`
- `POST /api/dev/evaluate-alerts`
- `GET /api/admin/integrations/sync-runs?page=1&pageSize=20`
- `GET /api/admin/integrations/sync-runs/latest`
- `GET /api/admin/operations/summary`

## Autenticacao inicial

- A autenticacao agora usa `access token` curto + `refresh token` persistido por sessao.
- O login e o cadastro retornam:
  - `access_token`
  - `refresh_token`
  - `access_expires_at`
  - `refresh_expires_at`
- Para rotas autenticadas, envie:

```http
Authorization: Bearer <access_token>
```

- Para renovar sessao:

```http
POST /api/auth/refresh
```

- Para logout consistente:

```http
POST /api/auth/logout
```

## Observacoes

- O projeto usa SQLAlchemy 2.x com tipagem moderna.
- O banco alvo e PostgreSQL.
- O schema agora deve evoluir por Alembic, nao por `create_all`.
- O seed cria `users`, `products`, `stores`, `offers`, `favorites`, `compare_list_items`, `price_history`, `price_watches`, `alert_configs` e `alert_events`.
- A API responde erros com envelope padronizado e inclui `request_id` para correlacao.

Exemplo de erro padronizado:

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product not found"
  },
  "meta": {
    "request_id": "d9b5...",
    "timestamp": "2026-04-02T12:00:00+00:00",
    "path": "/api/products/unknown"
  }
}
```

## Analytics e observabilidade

- `ClickAnalyticsService` agrega cliques por produto, oferta, loja, origem e periodo.
- `AlertAnalyticsService` agrega alertas disparados por motivo, produto, watch e periodo.
- As rotas administrativas de analytics ficam em `/api/admin/analytics/*`.
- O endpoint `/api/admin/operations/summary` expoe:
  - contadores runtime por fluxo critico (`auth`, `redirect`, `sync`, `offers.sync`, `alerts.evaluate`)
  - ultimo erro relevante com `request_id` para correlacao
  - resumo persistido (totais e ultimos eventos de click/alert/sync run)
- Nesta etapa, elas ficam liberadas apenas em modo de desenvolvimento (`app_debug=true`).

Importante:

- os contadores runtime sao em memoria do processo (reiniciam no restart)
- foram desenhados para diagnostico operacional inicial pos-deploy, sem stack externa pesada

Exemplos:

```http
GET /api/admin/analytics/clicks?periodDays=30
GET /api/admin/analytics/alerts?periodDays=30
GET /api/admin/operations/summary
```

## Testes

Existe uma suite basica em `backend/tests/` cobrindo:

- auth
- health e products
- favorites
- price_watches
- smoke tests de:
  - sync visitante -> usuario
  - redirect com tracking de clique
  - sync de ofertas
  - avaliacao de alertas
  - analytics/admin internos

Para rodar:

```bash
pytest backend/tests
```

Os testes usam SQLite em memoria e override de dependencia do FastAPI, para validar endpoints sem depender do PostgreSQL local.

## Smoke checks operacionais

Os smoke checks pos-deploy ficam separados da suite de testes e estao documentados em [SMOKE_CHECKS.md](/c:/Users/flavi/Desktop/LinkShop/backend/SMOKE_CHECKS.md).

Objetivo:

- validar ambiente ja subido
- verificar runtime real
- detectar falhas operacionais basicas rapidamente

Execucao rapida:

```bash
python backend/post_deploy_smoke.py
```

Ou via Docker Compose:

```bash
docker compose run --rm -e SMOKE_BASE_URL=http://backend:8000 backend python backend/post_deploy_smoke.py
```

Ou pelo script padronizado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 smoke
```

## Fluxo operacional local recomendado

1. Instale dependencias
2. Rode migracoes
3. Rode seed
4. Suba a API
5. Execute os testes basicos
6. Execute smoke tests dos fluxos criticos

Exemplo:

```bash
pip install -r backend/requirements.txt
alembic -c backend/alembic.ini upgrade head
python backend/seed.py
uvicorn app.main:app --reload --app-dir backend
pytest backend/tests
```

## Fluxo operacional com Docker

Subida minima reproduzivel:

```bash
docker compose up --build -d
docker compose run --rm backend python backend/seed.py
```

Fluxo completo sugerido:

1. `docker compose up --build -d`
2. `docker compose logs -f backend`
3. `docker compose run --rm backend python backend/seed.py`
4. `docker compose run --rm backend pytest backend/tests`
5. `docker compose run --rm -e SMOKE_BASE_URL=http://backend:8000 backend python backend/post_deploy_smoke.py`

Ou usando o script padronizado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 up
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 ci-check
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 smoke
powershell -ExecutionPolicy Bypass -File .\scripts\backend.ps1 down
```

Endpoints uteis para conferir o ambiente:

```http
GET /health
GET /health/ready
```

Smoke tests mais importantes nesta etapa:

- `backend/tests/test_sync_smoke.py`
- `backend/tests/test_redirect_smoke.py`
- `backend/tests/test_dev_workflows.py`

## Ingestao e sync de ofertas

- A camada `app/integrations/` concentra providers e adapters de ingestao.
- `OfferSyncService` cuida da persistencia das ofertas, registra `price_history` automaticamente quando houver criacao ou mudanca relevante e salva o resultado de cada execucao em `integration_sync_runs`.
- Providers agora expõem um contrato mais explicito com `source_reference` e `warnings`, o que deixa a ingestao mais proxima de um caso real.
- Alem do mock em memoria, existe um provider `json-feed` que lê um feed local configurado por `INTEGRATION_JSON_FEED_PATH`.

Para rodar o sync localmente:

```bash
python backend/sync_offers.py
```

Ou escolhendo explicitamente o provider:

```bash
python backend/sync_offers.py json-feed
```

Ou, em desenvolvimento:

```http
POST /api/dev/sync/offers?provider=mock-marketplace
POST /api/dev/sync/offers?provider=json-feed
GET /api/admin/integrations/sync-runs/latest
```

## Ranking de ofertas

- O backend agora calcula `ranking_score` e `quality_score` para cada oferta ativa por produto.
- A "melhor oferta" passa a considerar sinais de qualidade alem do menor preco bruto:
  - preco competitivo
  - desconto
  - frete
  - disponibilidade
  - recencia de sync
  - confiabilidade inicial da loja
  - completude minima de dados
- `lowest_price` continua separado e representa o menor preco bruto entre as ofertas.
- O endpoint de ofertas ja devolve os campos:
  - `ranking_score`
  - `quality_score`
  - `ranking_reason`

Diagnostico interno:

```http
GET /api/admin/ranking/products/{product_id}
```

## Avaliacao de alertas

- `AlertEvaluationService` avalia `price_watches` ativos com base em preco atual, historico recente, melhor oferta atual e configuracoes do `alert_config`.
- O sistema registra internamente eventos de alerta em `alert_events`, sem envio real de notificacao nesta etapa.

Regras iniciais implementadas:

- preco atual abaixo ou igual ao `target_price`
- queda relevante de preco quando `notify_on_price_drop` estiver ativo
- nova melhor oferta quando `notify_on_new_best_offer` estiver ativo

Para rodar a avaliacao localmente:

```bash
python backend/evaluate_alerts.py
```

Ou, em desenvolvimento:

```http
POST /api/dev/evaluate-alerts
```

## CI inicial

Existe uma pipeline inicial do backend em [backend-ci.yml](/c:/Users/flavi/Desktop/LinkShop/.github/workflows/backend-ci.yml).

Ela cobre:

- instalacao de dependencias Python
- compilacao do backend
- subida de PostgreSQL de apoio
- migracoes com Alembic
- seed
- execucao da suite de testes

Essa base ja deixa o projeto preparado para evoluir depois para:

- build de imagem em CI
- checks adicionais de qualidade
- deploy inicial com gates basicos

Observacao:

- a CI continua focada em validacao de codigo, migracoes, seed e testes
- o smoke pos-deploy foi separado para validar ambiente executando de verdade apos a subida

## Deploy inicial

Existe um guia prático em [DEPLOY.md](/c:/Users/flavi/Desktop/LinkShop/backend/DEPLOY.md) cobrindo:

- variaveis obrigatorias
- ordem de subida
- migracoes
- seed opcional
- validacao de health/readiness
- limites atuais para producao plena
