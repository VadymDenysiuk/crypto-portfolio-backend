# Crypto Portfolio Tracker (Backend + Infra)

A backend-first project:
Docker → CI/CD → AWS → Observability → Testing/Perf → Kubernetes.

Current scope: **API + Worker + PostgreSQL + Redis**).

## Tech Stack

- Node.js + NestJS
- PostgreSQL
- Redis
- Prisma
- Docker Compose
- pnpm workspaces

## Repository Structure

- `apps/api` — HTTP API (NestJS)
- `apps/worker` — background jobs (NestJS)
- `libs/db` — Prisma schema + migrations + DB client + seed scripts
- `infra/docker` — local infrastructure (docker-compose)

## Local Setup

### 1) Install dependencies

```bash
corepack enable
pnpm install
```

### 2) Start PostgreSQL + Redis

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 3) Environment variables

Create a local .env file from the example:

```bash
cp .env.example .env
```

> [!NOTE]
>
> .env is NOT committed. Only .env.example is tracked

### 4) Prisma: generate + migrate + seed

```bash
pnpm db:generate
pnpm db:migrate -- --name init

pnpm --filter @cpt/db build
node libs/db/dist/seed.js
```

### 5) Run services

In two terminals:

**Terminal 1**

```bash
pnpm --filter api start:dev
```

**Terminal 2**

```bash
pnpm --filter worker start:dev
```

Health checks:

API: GET http://localhost:3000/health

Worker: GET http://localhost:3001/health

> [!NOTE]
>
> If port 5432 is already in use, change Postgres mapping in infra/docker/docker-compose.yml to 5433:5432
> and update DATABASE_URL accordingly.
>
> Prisma VS Code extension may validate the schema using Prisma 7 language server by default; pin it to Prisma 6
> if you want to keep Prisma 6 schema behavior.

```bash
::contentReference[oaicite:0]{index=0}
```
