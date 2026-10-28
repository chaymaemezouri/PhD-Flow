# Progress

## Current phase

Phase 14 — first version. Phases 5–13 are implemented: review scores, decisions, files, registration, program, publication checklist, statistics, and mail retry. Broader tests cover the decision and similarity rules. A full accessibility audit and a production deployment rehearsal are still open.

## Overall status

Local seed accounts cover superadmin, chair, sub-admin, committee, reviewers, session chair, and authors (password `Demo-scholar-12`). Full conference workflow is available in the React workspace: submissions, reviews, decisions, registration, program board, publication, and document downloads. Similarity stays unsatisfied at 20 percent until a chair verifies a report under that threshold.

## Completed functionality

- [x] npm workspaces for `apps/web`, `apps/api`, and shared packages
- [x] NestJS API with `/api/v1/health`, OpenAPI, structured errors, Helmet, CORS, validation pipe, and in-memory rate limiting
- [x] Prisma 7 schema, `platform_metadata`, and the account tables from migration `20261010162537_auth_accounts`
- [x] Registration, email verification, login, logout, password reset, profile update, and Argon2id password hashing
- [x] HttpOnly session cookie, double-submit CSRF, and a system-admin guard on `GET /api/v1/system/status`
- [x] Docker Compose for PostgreSQL, Redis, MinIO, and Mailpit
- [x] React workspace shell with English and French copy, light, dark, and system theme, and a saved preferences form
- [x] Role dashboards for author, reviewer, committee, chair, session chair, and system admin
- [x] Conference work navigation (fiche, papers, reviews, program, publication, team)
- [x] Live API health display on the landing page and in the workspace footer
- [x] GitHub Actions workflow for lint, format, build, test, and migration deploy
- [x] Local verification of build, lint, tests, migration, seed, and startup

## Remaining functionality

- [ ] Broader accessibility audit beyond labels, skip link, and landmarks already in the shell
- [ ] Production deployment rehearsal (the CI job deploys migrations and runs tests against PostgreSQL only)
- [ ] Shared rate-limit counters across API processes

## Database migrations

- [x] `20261010153000_init` creates `platform_metadata`
- [x] `20261010162537_auth_accounts` creates users, profiles, sessions, email verification tokens, password reset tokens, the email outbox, and audit logs
- [x] `20261010173500_conferences` creates conferences, tracks, deadlines, templates, memberships, and invitations
- [x] `20261011171005_papers` creates papers, authors, manuscript files, and status history
- [x] `20261011172658_review_assignments` creates review assignments and conflict declarations
- [x] Applied locally against PostgreSQL 16, including `20261011171005_papers`. Seed wrote `platform.version = 0.1.0`.

## Implemented API endpoints

- [x] `GET /api/v1/health`
- [x] `GET /api/docs` (development, or `ENABLE_API_DOCS=true`)
- [x] `GET /api/v1/auth/csrf`
- [x] `POST /api/v1/auth/register`, `login`, `logout`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `change-password`
- [x] `GET /api/v1/auth/me` and `PATCH /api/v1/auth/profile`
- [x] `GET /api/v1/system/status` (system administrator only)
- [x] Conference directory, membership, and invitation routes
- [x] Paper draft, authors, PDF upload, submit, and withdraw
- [x] `GET /api/v1/directory` and `GET /api/v1/directory/:slug`
- [x] Conference create, update, tracks, deadlines, templates, invitations, and membership removal under `/api/v1/conferences`

## Implemented frontend pages

- [x] `/` introduction and live health
- [x] `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`
- [x] `/workspace/account`
- [x] `/directory` and `/directory/:slug`
- [x] `/workspace/conferences` and `/workspace/conferences/:conferenceId`
- [x] `/workspace/submissions`, `/workspace/submissions/new`, and `/workspace/submissions/:paperId`
- [x] `/invitations/accept`
- [x] `/workspace/author`
- [x] `/workspace/reviewer`
- [x] `/workspace/committee`
- [x] `/workspace/administrator`
- [x] `/workspace/system`
- [x] `/workspace/preferences`
- [x] Workspace routes for submissions, reviews, program, session board, assignments (planned-module stubs removed)
- [x] Unknown URLs show a not-found page

## Tests

| Check                        | Result                            |
| ---------------------------- | --------------------------------- |
| Validation schema unit tests | Passed, 3 tests                   |
| Health service unit tests    | Passed, included in the API suite |
| Health HTTP tests            | Passed, 200 and 503 cases         |
| Environment schema tests     | Passed                            |
| Preferences storage tests    | Passed, 3 tests                   |
| Landing page test            | Passed                            |
| Auth HTTP tests              | Passed, included in the API suite |
| Full `npm test`              | API 11 tests and web 4 tests      |
| `npm run lint`               | Passed                            |
| `npm run format:check`       | Passed                            |
| Web production build         | Passed                            |
| API production build         | Passed                            |

## Known bugs

None.

## Technical debt

- Rate-limit counters are per process. Login and registration share the global limit of 120 requests per minute.
- Redis retries failed mail from `email_outbox` (list `scholarflow:mail`, then a database scan). The first send is still immediate. Rate limits stay in process memory. BullMQ is unused.
- A system administrator can only be created by setting `platform_role` in the database. There is no seeded admin password.
- MinIO and Mailpit image tags float on `latest` and are not pinned to a digest.
- The web production bundle is about 1.3 MB before gzip because fonts and chart code ship in one chunk.
- `npm audit` reported 4 high severity issues after install. They were not triaged in this phase.
- Nest CLI prints an engine warning on Node.js 24.13 because a transitive Angular package asks for Node.js 24.15 or newer. The build and tests still succeeded.

## Security considerations

See [SECURITY.md](SECURITY.md). Passwords are Argon2id hashes. Session, verification, and reset secrets are stored only as SHA-256 hashes. Development credentials in `.env.example` are not production secrets.

## Next development step

Finish the phase 14 audit: keyboard pass on every form, and a deployment checklist that includes Redis, MinIO, and Mailpit rather than PostgreSQL alone.

## Verification log

Commands run from the repository root on 10 October 2026:

| Command                | Result                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `npm install`          | Passed. 720 packages.                                      |
| `npm run build`        | Passed for packages, API, and web.                         |
| `npm run format:check` | Passed.                                                    |
| `npm run lint`         | Passed.                                                    |
| `npm test`             | Passed. 15 tests.                                          |
| `docker compose up -d` | Passed after Docker Desktop was started.                   |
| `npm run db:deploy`    | Passed. Migration `20261010153000_init` applied.           |
| `npm run db:seed`      | Passed.                                                    |
| `npm run dev`          | Passed. Web on port 5173 and API on port 4000.             |
| `GET /api/v1/health`   | HTTP 200, `status: ok`, database `up`.                     |
| `GET /` through Vite   | HTTP 200. The Vite proxy returned the same health payload. |
| `GET /api/docs`        | HTTP 200.                                                  |

On this machine, ports 3000, 5432–5435, 55432, 6379, and 9000 were already used by other projects. The gitignored `.env` maps ScholarFlow to API `4000`, PostgreSQL `5436`, Redis `6380`, and MinIO `9100`/`9101`. `.env.example` still documents the standard ports. Docker Desktop was not running at the first attempt; starting it allowed Compose to proceed.

Phase 1 checks on the same day, after migration `20261010162537_auth_accounts`:

| Command                            | Result                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| API `tsc -p tsconfig.build.json`   | Passed after regenerating the Prisma client.                          |
| Web `tsc -b`                       | Passed.                                                               |
| `npm run test -w @scholarflow/api` | Passed. 11 tests, including register, verify, login, CSRF, and reset. |
| `npm run test -w @scholarflow/web` | Passed. 4 tests.                                                      |
| `npm run lint` and `format:check`  | Passed.                                                               |
