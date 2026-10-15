# Local deployment check

This is the rehearsal for the services ScholarFlow actually uses. It is not a production host.

## Start

From the repository root, with `.env` copied from `.env.example` and the local ports adjusted:

```bash
docker compose up -d
npm run db:deploy
npm run db:seed
npm run dev
```

## Confirm each service

- API: `GET http://localhost:4000/api/v1/health` returns `database: up`.
- Web: `http://localhost:5173` opens the sign-in page.
- PostgreSQL: the health check above is the proof.
- Redis: the API logs a connected client, and failed mail is pushed to the list `scholarflow:mail`. Request limits use the keys `scholarflow:throttle:*`. If Redis is down, limits stay in the API process memory.
- MinIO: a manuscript upload from a submission creates an object in the `scholarflow` bucket.
- Mailpit: `http://localhost:8025` shows the verification message. Gmail does not receive local mail.

## Still manual

- A full keyboard and screen-reader audit.
- A host outside this machine, with secrets that are not the demo password.
- More than one API process, to watch the shared Redis counters under load.
