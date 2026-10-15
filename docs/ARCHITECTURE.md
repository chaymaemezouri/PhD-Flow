# Architecture

ScholarFlow is a modular monolith. One NestJS API owns the business rules. One React application is the workspace. PostgreSQL is the system of record. There are no microservices.

## Runtime

```text
Browser
  │
  ▼
apps/web (Vite, React, TanStack Query)
  │  /api
  ▼
apps/api (NestJS, /api/v1)
  │
  ▼
PostgreSQL via Prisma ORM 7 and the PostgreSQL driver adapter
```

Redis and MinIO are part of the local environment. The API does not open those clients. Verification and password-reset mail goes out over SMTP to Mailpit in development. Background jobs and private file storage will be added when a workflow needs them.

## Backend modules

`apps/api/src/modules` holds feature modules. `health` and `auth` are implemented. Conferences, submissions, and reviews will be sibling modules that depend on shared `prisma`, `config`, and `common` code.

Controllers stay thin. Services own checks and state changes. Request bodies will be validated with DTO classes and, where the same rule is needed in the browser, with schemas from `@scholarflow/validation`.

## Frontend

`apps/web/src/pages` are routes. `layouts` is the workspace shell. `features` holds behavior such as preferences and health queries. `components/ui` holds the accessible primitives, following the shadcn/ui pattern so later screens can reuse them. `packages/ui` publishes brand tokens for non-CSS surfaces.

Interface copy lives in `apps/web/src/lib/locales`. English and French ship now. The i18next configuration limits `supportedLngs` so Arabic can be added as another locale file without mixing translations into business records.

## API contract

- Base path: `/api/v1`
- OpenAPI: `/api/docs` outside production, or in production when `ENABLE_API_DOCS=true`
- Errors use one JSON shape: `statusCode`, `error`, `message`, `path`, `timestamp`, `requestId`
- Internal failures return a generic message. The stack stays in the log.

## Process boundaries

A conference is an authorization boundary. Membership decides who can read or change a conference. A user who is not a member receives 404 for another conference’s private record. Papers and reviews do not exist yet, so those records are not covered by this check.

Workflow state will be decided on the server. The browser will display the state it is given and will not be allowed to submit an arbitrary next state.
