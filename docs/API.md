# API

Base URL: `/api/v1`

Interactive documentation: `/api/docs` in development.

## Errors

```json
{
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Cannot GET /api/v1/missing",
  "path": "/api/v1/missing",
  "timestamp": "2026-10-10T12:00:00.000Z",
  "requestId": "…"
}
```

`error` is the HTTP status name. `message` is safe to show. HTTP 500 responses use the message `Internal server error`.

## GET /api/v1/health

Reports whether this API process is running and whether PostgreSQL accepts a trivial query.

HTTP 200 when both are up:

```json
{
  "status": "ok",
  "service": "scholarflow-api",
  "version": "0.1.0",
  "timestamp": "2026-10-10T12:00:00.000Z",
  "checks": { "api": "up", "database": "up" }
}
```

HTTP 503 when the process is up and the database is not. `status` is `degraded` and `checks.database` is `down`. The response does not include the database error text.

## Account

Cookie mutations require `GET /api/v1/auth/csrf` first. The response sets `scholarflow_csrf`. Send that value back as `x-csrf-token`. The session cookie is `scholarflow_session`.

| Method | Path                               | Auth                       | Result                                                                                     |
| ------ | ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/auth/csrf`                | No                         | Sets the CSRF cookie                                                                       |
| POST   | `/api/v1/auth/register`            | CSRF                       | 201 account without `passwordHash`, or 409 if the email exists                             |
| POST   | `/api/v1/auth/login`               | CSRF                       | 200 and a session cookie, 401 if the credentials are wrong, 403 if the email is unverified |
| POST   | `/api/v1/auth/logout`              | CSRF and session           | 204 and clears the session cookie                                                          |
| POST   | `/api/v1/auth/verify-email`        | CSRF                       | 204. Body `{ "token" }`                                                                    |
| POST   | `/api/v1/auth/resend-verification` | CSRF                       | 202. Does not reveal whether the email exists                                              |
| POST   | `/api/v1/auth/forgot-password`     | CSRF                       | 202. Same disclosure rule                                                                  |
| POST   | `/api/v1/auth/reset-password`      | CSRF                       | 204 once. 400 if the token is missing, used, or expired                                    |
| GET    | `/api/v1/auth/me`                  | Session                    | Current user and profile                                                                   |
| POST   | `/api/v1/auth/change-password`     | CSRF and session           | 204. Other sessions are revoked                                                            |
| PATCH  | `/api/v1/auth/profile`             | CSRF and session           | Updated current user                                                                       |
| GET    | `/api/v1/system/status`            | Session and `SYSTEM_ADMIN` | `{ "accounts": <count> }`. Researchers receive 403                                         |

Passwords are 12–128 characters and must include a letter and a digit. The public user object is `id`, `email`, `platformRole`, `emailVerified`, `mfaEnabled`, and `profile`.

## Conferences

`GET /api/v1/directory` and `GET /api/v1/directory/:slug` are public. They return published conferences whose visibility is `PUBLIC`. Drafts and unlisted meetings are omitted. The payload has no member emails.

Signed-in routes:

| Method      | Path                                                   | Who                                                           |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| GET         | `/api/v1/conferences`                                  | The caller's active and invited memberships                   |
| POST        | `/api/v1/conferences`                                  | Any signed-in user. The creator becomes `CHAIR`               |
| GET         | `/api/v1/conferences/:id`                              | Members and system administrators. Others receive 404         |
| PATCH       | `/api/v1/conferences/:id`                              | Chair, administrator, or system administrator                 |
| POST/DELETE | `/api/v1/conferences/:id/tracks` and `.../deadlines`   | Same managers                                                 |
| POST        | `/api/v1/conferences/:id/templates`                    | Same managers. Upserts by kind and language                   |
| POST        | `/api/v1/conferences/:id/invitations`                  | Same managers. Body `{ email, role }`. Role cannot be `CHAIR` |
| POST        | `/api/v1/conferences/:id/members/:membershipId/remove` | Same managers. The chair cannot be removed                    |
| POST        | `/api/v1/invitations/accept` and `.../decline`         | The signed-in user whose email matches the invitation         |

Authors and reviewers can read tracks and deadlines. They do not receive the member list or templates. Committee members can read the member list. Invitation links expire after 7 days and work once.

## Papers

Signed-in routes. A reviewer in the same conference cannot read another person's manuscript.

| Method | Path                             | Result                                                                                    |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/api/v1/papers`                 | Papers the caller wrote, plus papers in conferences they chair or administer              |
| POST   | `/api/v1/conferences/:id/papers` | Creates a draft. Active authors, chairs, administrators, and committee members may submit |
| PATCH  | `/api/v1/papers/:id`             | Edits a draft                                                                             |
| PUT    | `/api/v1/papers/:id/authors`     | Replaces the author list. One author must be corresponding                                |
| POST   | `/api/v1/papers/:id/manuscript`  | Multipart field `manuscript`. PDF only, 20 MB, `%PDF-` signature checked                  |
| GET    | `/api/v1/papers/:id/manuscript`  | Authorized download. The object is not public                                             |
| POST   | `/api/v1/papers/:id/submit`      | Assigns `publicId` once, then freezes the draft                                           |
| POST   | `/api/v1/papers/:id/withdraw`    | From submitted only. The public id stays                                                  |

A submission deadline in the past rejects submit. A track deadline overrides the conference-wide submission deadline when the paper is on that track. In tests, file bytes stay in memory. Otherwise they go to the private MinIO bucket.

## Reviews

Chairs, administrators, and committee members can list reviewers and record a conflict against a paper or an author email. They can invite a reviewer only for a submitted paper. The same reviewer cannot hold two active assignments for one paper. A conflict, including the reviewer being an author, rejects the invitation.

Assignment statuses are `INVITED`, `ACCEPTED`, `DECLINED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, and `OVERDUE`. The reviewer accepts or declines. A passed review deadline marks an open assignment `OVERDUE`. `COMPLETED` waits for a submitted review form.

In a double-blind conference, the author does not see the reviewer, and the reviewer does not see author names or the original file name. An accepted reviewer can download the PDF. Review scores are not part of this phase.
