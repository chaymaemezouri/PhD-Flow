# Security

ScholarFlow will store unpublished manuscripts and personal academic data. Account security is in place for platform users. Conference-scoped authorization arrives with conference records.

## Assumptions

- Clients are untrusted, including the first-party web app.
- A user of one conference must not read another conference’s private records.
- Reviewers must not receive author identity under a double-blind policy, other reviewers’ confidential comments, or administrative notes.
- Logs and audit records are useful to operators and must not become a second copy of secrets or manuscripts.

## In place now

- Helmet sets security headers. Content Security Policy is enabled when `NODE_ENV=production`.
- CORS allows only origins listed in `CORS_ORIGINS`. Credentials are permitted so the session cookie can be sent.
- A global validation pipe will whitelist and reject unexpected fields once body DTOs exist.
- Rate limiting is in memory: 120 requests per minute per client. A single API process does not share this counter. Redis-backed limits can replace it when the API starts using Redis.
- Errors returned to clients omit stack traces. Request ids are generated or echoed from `X-Request-Id` and written to the log. Authorization and cookie headers are redacted from request logs.
- Prisma sends parameterized queries. The health check does not concatenate SQL.
- Secrets are read from the environment. `.env` is gitignored. `.env.example` contains development defaults only.
- The health endpoint reports database failure as HTTP 503 with `status: degraded`. It does not include a connection string or driver error.
- Passwords are hashed with Argon2id (`memoryCost` 19456, `timeCost` 2, `parallelism` 1). A dummy hash is verified when the email is unknown so that path still pays a hash cost.
- The session cookie `scholarflow_session` is HttpOnly, `SameSite=lax`, path `/`, and lasts 7 days. `Secure` is set only when `NODE_ENV=production`. The raw token is stored as a SHA-256 hex hash. Logout, password reset, and a password change revoke sessions.
- Mutating requests need the `scholarflow_csrf` cookie and a matching `x-csrf-token` header. The comparison uses `timingSafeEqual`. GET, HEAD, and OPTIONS skip the check. The CSRF cookie is not HttpOnly so the browser app can read it.
- Email verification tokens last 24 hours. Password reset tokens last 1 hour, are single use, and unused tokens are invalidated when a new reset is requested. Responses for forgot-password and resend-verification do not say whether the account exists. Registration returns 409 when the email is already registered.
- Login is refused until the email is verified. Failed login audit rows store the email and never the password. Audit rows do not store raw tokens. The outbox stores the subject and body so a failed message can be sent again. It does not store session or reset tokens.
- MFA starts with `POST /api/v1/auth/mfa/start` and turns on only after `POST /api/v1/auth/mfa/confirm` accepts a 6-digit TOTP code. Login asks for that code only when `mfa_enabled` is true.
- `GET /api/v1/system/status` requires a signed-in user whose `platform_role` is `SYSTEM_ADMIN`. The default role is `RESEARCHER`.
- Conference membership decides who can read a conference. A manuscript PDF is accepted only when it starts with `%PDF-`, is at most 20 MB, and is stored in a private bucket. Download requires the paper's author or a conference manager. Reviewers receive the file only after they accept an assignment. In a double-blind conference the download name is `manuscript.pdf` and the author list is omitted.

## Not in place yet

- Rate limits are still counted in memory. They are not shared across API processes.
- The first mail send is immediate. Redis and the outbox retry a failed message up to five times. There is no separate worker process.

## Operational notes

Development passwords in Docker Compose are for a local machine. Production must supply its own secrets and must not enable API docs on a public network unless that is an explicit choice (`ENABLE_API_DOCS`).
