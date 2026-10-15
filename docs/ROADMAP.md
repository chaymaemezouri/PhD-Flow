# Roadmap

Phases are sequential. A phase is complete only when its behavior is implemented and the checks listed for it have been run. Security, authorization, and file access are built with the feature that needs them rather than deferred to the end.

| Phase | Focus                                                                                         | State         |
| ----- | --------------------------------------------------------------------------------------------- | ------------- |
| 0     | Monorepo, API shell, health, design system, workspace preview, Docker, docs                   | Complete      |
| 1     | Registration, login, email verification, password reset, profiles, sessions, role-aware shell | Complete      |
| 2     | Conferences, tracks, deadlines, templates, memberships, public directory                      | Complete      |
| 3     | Submission wizard, authors, manuscript upload, paper ids, author dashboard                    | Complete      |
| 4     | Reviewer directory, conflicts, invitations, assignments                                       | Complete      |
| 5     | Review forms, scores, blind-review enforcement                                                | First version |
| 6     | Revisions, version history, scientific decisions, decision letters                            | First version |
| 7     | Registration and manual payment verification                                                  | First version |
| 8     | Rooms, sessions, program, presentation assessment                                             | First version |
| 9     | Camera-ready submission and validation                                                        | First version |
| 10    | Similarity report upload and manual verification                                              | First version |
| 11    | Copyright templates and signed-document validation                                            | First version |
| 12    | Publication readiness checklist and metadata export                                           | First version |
| 13    | Email jobs, reminders, statistics, CSV export                                                 | First version |
| 14    | Hardening, broader automated tests, accessibility and deployment review                       | First version |

Phase 0 already includes the threat controls listed in [SECURITY.md](SECURITY.md). Redis, MinIO, and Mailpit are available locally before the features that use them.
