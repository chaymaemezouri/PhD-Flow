# Decisions

## 1. Modular monolith

One API and one web app. Conference isolation will be an authorization rule, not a separate deployment. Splitting services now would add network and operational failure modes before the domain is stable.

## 2. Prisma ORM 7, not the Prisma 8 pre-release

The `prisma` package tagged `latest` currently points at a Prisma 8 release candidate with a different command set. The API and the schema toolchain both use Prisma ORM 7.10, which is the version NestJS documents for `migrate` and `generate`. The client is generated with the `prisma-client` provider into `apps/api/src/generated/prisma`, and it connects through `@prisma/adapter-pg`.

## 3. TypeScript 5.9 for the application

TypeScript 7 is published, and NestJS still relies on legacy decorator metadata. TypeScript 5.9.3 is the newest 5.x release and matches that decorator model. The choice can be revisited when NestJS supports the TypeScript 7 decorator pipeline.

## 4. NestJS on ECMAScript modules

New NestJS 12 projects are ESM. The API sets `"type": "module"`, compiles with `nodenext`, and uses `.js` extensions in relative imports. The generated Prisma client uses the ESM format inferred from that configuration.

## 5. Schema grows with the features

Each migration covers the tables a phase actually uses. `platform_metadata` landed in Phase 0. Account, session, token, outbox, and audit tables landed in Phase 1. Conference tables wait for Phase 2. The remaining target entities are described in [DATABASE.md](DATABASE.md).

## 6. The API starts when PostgreSQL is down

Prisma connects on the first query instead of during bootstrap. `GET /api/v1/health` then returns HTTP 503 and `status: degraded`. Operators can see that the process is alive and the database is not. A missing `DATABASE_URL` still stops startup, because the process would be misconfigured.

## 7. Redis, MinIO, and Mailpit wait until a feature needs them

Compose starts all three. The API does not open a Redis or MinIO client, so a stopped Redis cannot take the API down. Verification and password-reset messages are sent immediately with Nodemailer and recorded in `email_outbox`. When `NODE_ENV=test`, those messages stay in memory and SMTP is skipped. BullMQ will be introduced with the first background job, not with an idle worker.

## 8. Design system split

Brand colors that emails and documents need live in `@scholarflow/ui`. Interactive components live in `apps/web/src/components/ui` because they depend on Tailwind and Radix. The web app is the only React surface in Phase 0.

## 9. Interface preferences are local

Theme and language are stored in `localStorage` under `scholarflow.preferences` and validated with Zod. They are not an account and they are not sent to the API.

## 10. No sample academic data

Dashboards show an explicit empty state. Charts receive an empty series. The product must not look as if it is managing real submissions before the workflow exists.

## 11. Account mail is synchronous

Phase 1 needs a real verification link before a job queue exists. The API writes an outbox row and sends it in the same request. A failed send marks the row `FAILED` and does not store the message body. Queued delivery can replace this path in Phase 13 without changing the token tables.

## 12. No seeded administrator password

`SYSTEM_ADMIN` is a real role check, but the repository does not ship an admin email or password. Promoting an account is a database update of `users.platform_role`. Profile photos stay out until private object storage exists, and the account page says so.
