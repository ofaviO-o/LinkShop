# Deploy Inicial Do Backend (Externo Controlado)

Este guia cobre um primeiro deploy real do backend com foco em previsibilidade.

## Estrategia

- backend em container (`backend/Dockerfile`)
- compose de release em [docker-compose.prod.yml](/c:/Users/flavi/Desktop/LinkShop/docker-compose.prod.yml)
- banco externo recomendado
- opcao de banco em container com profile `with-db`

## Arquivos-Chave

- [docker-compose.prod.yml](/c:/Users/flavi/Desktop/LinkShop/docker-compose.prod.yml)
- [backend/.env.production.example](/c:/Users/flavi/Desktop/LinkShop/backend/.env.production.example)
- [.env.deploy.example](/c:/Users/flavi/Desktop/LinkShop/.env.deploy.example)
- [scripts/release-backend.ps1](/c:/Users/flavi/Desktop/LinkShop/scripts/release-backend.ps1)
- [backend/post_deploy_smoke.py](/c:/Users/flavi/Desktop/LinkShop/backend/post_deploy_smoke.py)

## Variaveis Obrigatorias Do Backend

Minimo para ambiente externo:

- `APP_ENV=production`
- `APP_DEBUG=false`
- `DATABASE_URL`
- `AUTH_SECRET_KEY`
- `CORS_ORIGINS`
- `ACCESS_TOKEN_TTL_MINUTES`
- `REFRESH_TOKEN_TTL_DAYS`
- `APP_HOST`
- `APP_PORT`
- `PORT` (em Render e similares, costuma vir automaticamente e tem prioridade sobre `APP_PORT`)
- `WEB_CONCURRENCY`
- `LOG_LEVEL`

## Preparacao

1. Copie `backend/.env.production.example` para `backend/.env.production`.
2. Ajuste valores sensiveis e URLs publicas.
3. Copie `.env.deploy.example` para `.env.deploy`.
4. Defina `BACKEND_IMAGE` com tag imutavel.

## Subida Recomendada

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release-backend.ps1 up
powershell -ExecutionPolicy Bypass -File .\scripts\release-backend.ps1 migrate
```

Seed opcional (somente ambiente controlado):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release-backend.ps1 seed
```

## Validacao Pos-Deploy

Smoke remoto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release-backend.ps1 smoke -SmokeBaseUrl https://api.example.com
```

Checks minimos:

- `GET /health` -> `200`
- `GET /health/ready` -> `200`
- smoke script com exit code `0`

## Rollback Manual Simples

Use imagem anterior:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release-backend.ps1 rollback -RollbackImage linkshop-backend:TAG_ANTIGA
```

## Limites Atuais

- sem deploy automatizado completo
- sem observabilidade externa forte
- sem autorizacao avancada de rotas internas
- sem estrategia completa de backup/restore documentada

Para uma visao full-stack (frontend + backend), use tambem [DEPLOY_EXTERNAL.md](/c:/Users/flavi/Desktop/LinkShop/DEPLOY_EXTERNAL.md).
Checklist operacional completo: [FULLSTACK_VALIDATION.md](/c:/Users/flavi/Desktop/LinkShop/FULLSTACK_VALIDATION.md).
