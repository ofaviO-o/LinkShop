# LinkShop

Arquitetura moderna para um agregador de ofertas afiliadas com foco em SEO, performance e escalabilidade.

## Stack

- Next.js com App Router
- React + TypeScript
- Tailwind CSS
- Zustand para estado simples e persistido
- `next/image` para otimizacao de imagens

## O que esta base entrega

- Home editorial com hero, vitrines e catalogo filtravel
- Pagina de autenticacao mock com entrar, cadastrar e continuar como visitante
- Busca global e filtros por preco, loja, categoria e desconto
- Redirecionamento para links afiliados externos
- Area administrativa basica para cadastrar, editar e excluir produtos
- Controle de acesso por roles: `guest`, `user`, `admin`
- Estrutura pronta para autenticacao real, banco de dados e evolucao de SEO
- Rotas preparadas para paginas de oferta individuais

## Estrutura principal

```text
app/
  admin/
  auth/
  buscar/
  conta/
  favoritos/
  lista/
  ofertas/[slug]/
src/
  features/
  shared/
  stores/
backend/
  app/
  seed.py
```

## Responsabilidades

- `app/`: rotas, metadata e shell do Next.js
- `src/features/`: dominios encapsulados por feature
- `src/shared/`: infraestrutura reutilizavel, layout, UI e camada de API client
- `src/stores/`: ponto unico de export das stores
- `backend/`: API FastAPI com PostgreSQL

## Como rodar

```bash
npm install
npm run dev
```

## Integracao local com backend

1. Copie [`.env.example`](/c:/Users/flavi/Desktop/LinkShop/.env.example) para `.env.local`
2. Configure `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api`
3. Suba o backend FastAPI
4. Rode o front com `npm run dev`

Sem `NEXT_PUBLIC_API_BASE_URL`, o front continua usando mock/local nos dominios ainda nao migrados.

## Deploy externo full-stack

Guias praticos:

- [DEPLOY_EXTERNAL.md](/c:/Users/flavi/Desktop/LinkShop/DEPLOY_EXTERNAL.md)
- [FULLSTACK_VALIDATION.md](/c:/Users/flavi/Desktop/LinkShop/FULLSTACK_VALIDATION.md)

Variaveis de frontend para producao:

- `NEXT_PUBLIC_API_BASE_URL` (obrigatoria para o browser)
- `BACKEND_INTERNAL_API_BASE_URL` (opcional para SSR/route handlers)

Smoke full-stack externo:

```bash
FULLSTACK_FRONTEND_BASE_URL=https://app.example.com \
FULLSTACK_BACKEND_BASE_URL=https://api.example.com \
npm run smoke:fullstack
```

## Proximos passos recomendados

- Trocar `mock-products` por banco ou CMS
- Trocar autenticacao mock por provider real na rota `/auth`
- Migrar CRUD local para Server Actions ou API routes
- Criar paginas de categoria e ranking de ofertas
- Adicionar favoritos, tracking de clique e observabilidade
