# Local services

Docker Compose starts the infrastructure ScholarFlow uses. The API connects to PostgreSQL and sends account mail through SMTP. Redis and MinIO stay available for later phases.

| Service       | Local address           | Used now                        |
| ------------- | ----------------------- | ------------------------------- |
| PostgreSQL 16 | `localhost:5432`        | Yes, through Prisma             |
| Redis 7       | `localhost:6379`        | No. Reserved for cache and jobs |
| MinIO API     | `localhost:9000`        | Yes, for manuscript PDFs        |
| MinIO console | `localhost:9001`        | No                              |
| Mailpit SMTP  | `localhost:1025`        | Yes, for verification and reset |
| Mailpit UI    | `http://localhost:8025` | Yes, to read those messages     |

The bucket `scholarflow` is created by the `minio-init` container. Credentials in `.env.example` are development defaults and must not be reused in production.

If a host port is already taken, change that port in `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`, or `PORT`). Keep `DATABASE_URL` and `VITE_DEV_API_PROXY` pointed at the ports you chose.

Start the services from the repository root:

```bash
docker compose up -d
```

Apply the database migration after the API dependencies are installed:

```bash
npm run db:deploy
```
