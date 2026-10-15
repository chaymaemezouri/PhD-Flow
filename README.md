# ScholarFlow

ScholarFlow is a scientific publication and conference management system for authors, reviewers, program chairs, and conference administrators. This repository is a TypeScript monorepo with a NestJS API, a React workspace, account authentication, and local infrastructure.

It does not yet accept manuscripts, reviews, or accounts. Those workflows are planned in [docs/ROADMAP.md](docs/ROADMAP.md). Current status is recorded in [docs/PROGRESS.md](docs/PROGRESS.md).

## Requirements

- Node.js 22.12 or newer (Node.js 24 is used in CI)
- npm 11
- Docker with Compose, for PostgreSQL and the other local services

## Start locally

From the repository root:

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

On Windows PowerShell, copy the environment file with `Copy-Item .env.example .env`.

- Web application: http://localhost:5173
- API health: http://localhost:3000/api/v1/health
- API docs: http://localhost:3000/api/docs
- Mailpit: http://localhost:8025
- MinIO console: http://localhost:9001

The web dev server proxies `/api` to `VITE_DEV_API_PROXY` (http://localhost:3000 by default). Leave `VITE_API_URL` empty when using that proxy. If a default port is already in use, change the host port in `.env` and point `DATABASE_URL` or `VITE_DEV_API_PROXY` at it.

## Scripts

| Command             | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the API and the web app                   |
| `npm run build`     | Build shared packages, the API, and the web app |
| `npm run test`      | Run unit and HTTP tests                         |
| `npm run lint`      | Run ESLint                                      |
| `npm run format`    | Format the repository with Prettier             |
| `npm run db:deploy` | Apply committed Prisma migrations               |
| `npm run db:seed`   | Write the platform version marker               |

`npm run db:migrate` is for creating a new migration while developing a schema change. Do not reset the database unless you intend to discard local data.

## Layout

```text
apps/api        NestJS REST API
apps/web        React workspace
packages/types  Shared response types
packages/validation  Zod schemas shared by the API and the web app
packages/ui     Brand tokens
packages/config Shared TypeScript defaults
docs            Architecture and progress
infrastructure  Notes for the local services
```

## Local demo accounts

`npm run db:seed` replaces the local demonstration records. Every account uses the password `Demo-scholar-12`. These addresses are for a local database only.

| Email                             | Role                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `admin@demo.scholarflow.test`     | Conference administrator (chair of ScholarFlow Demo 2027) |
| `reviewer@demo.scholarflow.test`  | Reviewer, with one accepted double-blind assignment       |
| `chercheur@demo.scholarflow.test` | PhD researcher, with one submitted paper and one draft    |

The public directory lists the demo conference. Author names stay hidden from the reviewer.

## Current limits

- Sign-in, conferences, manuscript submission, and review assignments are implemented. A submitted paper keeps one public id.
- Review forms, scores, and decisions are not implemented. Role dashboards other than submissions and review invitations are still previews.
- Redis starts with Docker Compose and is not called by the API yet. Manuscript PDFs go to MinIO. Mailpit receives account and review mail.
- Profile photos and MFA enrollment are not implemented.
