# PapersManagement (ScholarFlow monorepo)

PapersManagement is a scientific publication and conference management system for authors, reviewers, program chairs, committee members, session chairs, and conference administrators. This repository is a TypeScript monorepo with a NestJS API, a React workspace, account authentication, and local infrastructure.

Workflows covered locally: conferences, submissions, peer review, decisions, registration, program scheduling, publication follow-up, and demo documents (certificate, receipt, attestation).

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
- API health: http://localhost:4000/api/v1/health (or the port in `.env`)
- API docs: http://localhost:4000/api/docs
- Mailpit: http://localhost:8025
- MinIO console: http://localhost:9001

The web dev server proxies `/api` to `VITE_DEV_API_PROXY`. Leave `VITE_API_URL` empty when using that proxy.

## Scripts

| Command             | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the API and the web app                   |
| `npm run build`     | Build shared packages, the API, and the web app |
| `npm run test`      | Run unit and HTTP tests                         |
| `npm run lint`      | Run ESLint                                      |
| `npm run format`    | Format the repository with Prettier             |
| `npm run db:deploy` | Apply committed Prisma migrations               |
| `npm run db:seed`   | Load local demonstration data                   |

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

`npm run db:seed` replaces the local demonstration records. Every account uses the password `Demo-scholar-12`.

| Email                                  | Role                                      |
| -------------------------------------- | ----------------------------------------- |
| `superadmin@demo.scholarflow.test`     | Platform superadmin                       |
| `admin@demo.scholarflow.test`          | Conference chair (PapersManagement Demo 2027)  |
| `sousadmin@demo.scholarflow.test`      | Sub-admin (ADMINISTRATOR)                 |
| `committee@demo.scholarflow.test`      | Programme committee                       |
| `reviewer@demo.scholarflow.test`       | Reviewer                                  |
| `reviewer2@demo.scholarflow.test`      | Second reviewer                           |
| `sessionchair@demo.scholarflow.test`   | Session chair                             |
| `chercheur@demo.scholarflow.test`      | Author / PhD researcher                   |
| `auteur2@demo.scholarflow.test`        | Second author                             |

Public directory: `/directory` (demo conference `demo-2027`).

Soutenance walkthrough: [docs/DEMO.md](docs/DEMO.md) and in-app **Guide démo** at `/workspace/demo-guide`.

Re-seed after pull if conference names still say ScholarFlow: `npm run db:seed`.

## Current scope

- Sign-in, conferences, manuscript submission, review invitations and forms, decisions, registration, program board, publication follow-up, and document downloads are implemented for the local demo.
- Redis is available with Docker Compose. Manuscript PDFs go to MinIO. Email verification is deferred; new accounts can sign in right after registration.
- Profile photo upload and MFA enrollment are still limited.
