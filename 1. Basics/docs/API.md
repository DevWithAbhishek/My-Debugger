# IMS API contract (intended behaviour)

Base URL `http://127.0.0.1:3000`. JSON everywhere. Access tokens are HS256 JWTs valid for 15 minutes
(`Authorization: Bearer <token>`). Refresh tokens are opaque, single-use, valid 14 days.

## Fictional seed users (password for all: `Passw0rd!demo`)

| Email | Role | Team |
|---|---|---|
| admin@ims.test | admin | none (platform admin, may access every team) |
| alice@alpha.test | responder | Alpha Platform |
| victor@alpha.test | viewer | Alpha Platform |
| bob@bravo.test | responder | Bravo Payments |
| dana@delta.test | responder | Delta Data |
| nora@unassigned.test | responder | **none** (new hire, not yet assigned) |

Roles: `viewer` (read), `responder` (read + create/update incidents and notes), `admin` (everything, including `/admin/*`).

## Error envelope

Every non-2xx response, from every route, has this shape and status mapping:

```json
{ "error": { "code": "MACHINE_CODE", "message": "human text", "details": [], "requestId": "<same as X-Request-Id header>" } }
```

| Situation | Status | `code` |
|---|---|---|
| No `Authorization` header / not a bearer token | 401 | `UNAUTHENTICATED` |
| Token signature or format invalid | 401 | `INVALID_TOKEN` |
| Token expired | 401 | `TOKEN_EXPIRED` |
| Session revoked (logout, refresh-token reuse) | 401 | `SESSION_REVOKED` |
| Wrong email/password | 401 | `INVALID_CREDENTIALS` |
| Role not allowed | 403 | `FORBIDDEN_ROLE` |
| Resource belongs to another team, or caller has no team (non-admin) | 403 | `TEAM_ACCESS_DENIED` |
| User disabled | 403 | `ACCOUNT_DISABLED` |
| User's team deactivated | 403 | `TEAM_INACTIVE` |
| Malformed JSON body | 400 | `MALFORMED_JSON` |
| Body/query/params fail validation | 400 | `VALIDATION_ERROR` (`details`: `[{ "path": "email", "message": "..." }]`) |
| Unknown resource/route | 404 | `NOT_FOUND` |
| Refresh token unknown/expired/revoked | 401 | `INVALID_REFRESH_TOKEN` |
| Refresh token already used | 401 | `REFRESH_TOKEN_REUSED` |
| Database or Redis unreachable | 503 | `DEPENDENCY_UNAVAILABLE` |
| Anything unexpected | 500 | `INTERNAL_ERROR` - generic message, **no stack traces or internals** |

Every response carries an `X-Request-Id` header (a valid caller-supplied `X-Request-Id` is echoed back). Log lines
for a request carry the same `requestId`.

## Operational contract

- **Start-up:** invalid or missing configuration must make the process exit non-zero **before** it listens.
  `PORT` must be an integer 1-65535.
- `GET /healthz` - liveness: 200 while the process runs, independent of dependencies.
- `GET /readyz` - readiness: 200 only if PostgreSQL **and** Redis are reachable right now; otherwise 503 with
  `{"status":"not_ready","checks":{"database":"ok|fail","redis":"ok|fail"}}`.
- **Shutdown:** on `SIGTERM` stop accepting new connections, let in-flight requests finish (bounded wait),
  close the database pool and Redis, then exit 0.

## Security policy

- Revocation state lives in Redis. If it cannot be read, authenticated requests fail closed with 503.
- A rotated refresh token that is presented again means the session may be stolen: reject it **and end that
  whole session** (its other refresh tokens and its access tokens). Other sessions of the same user are unaffected.
- **Privilege reductions take effect immediately**, not at access-token expiry: demoting a role, moving a user to
  another team, disabling a user, and deactivating a team must all stop previously issued tokens from acting with
  the old privileges. Login and refresh are also refused for disabled users and members of deactivated teams.
- Non-admin users with no team may authenticate and call `/auth/me`, but every team-scoped route is
  `403 TEAM_ACCESS_DENIED` for them. Admins are not team-scoped.
- Team scoping applies to an incident **and all its sub-resources**.

## Routes

| Method & path | Auth | Notes |
|---|---|---|
| POST `/api/v1/auth/login` `{email,password}` | - | -> `{accessToken, refreshToken, expiresIn, user}` |
| POST `/api/v1/auth/refresh` `{refreshToken}` | - | rotates; returns a new pair |
| POST `/api/v1/auth/logout` | any | revokes the caller's session, 204 |
| GET `/api/v1/auth/me` | any | current profile |
| GET `/api/v1/incidents?status=&limit=` | any | caller's team (admin: all teams) |
| POST `/api/v1/incidents` `{title,severity,description?,teamId?}` | responder, admin | admin must pass `teamId` |
| GET `/api/v1/incidents/:id` | any (team-scoped) | |
| PATCH `/api/v1/incidents/:id/status` `{status}` | responder, admin (team-scoped) | `open|acknowledged|mitigated|resolved` |
| GET / POST `/api/v1/incidents/:id/notes` | read: any; write: responder, admin (team-scoped) | |
| GET `/api/v1/admin/users` | admin | |
| PATCH `/api/v1/admin/users/:id` `{role?,teamId?,status?}` | admin | |
| POST `/api/v1/admin/teams/:id/deactivate` / `activate` | admin | |
| GET `/api/v1/admin/reports/summary` | admin | per-team incident counts |
| GET `/api/v1/legacy/incidents/:id` | any (team-scoped) | old dashboard; same contract as the main API |
| GET `/api/v1/debug/boom`, `/api/v1/debug/slow?ms=` | none | test-support only (`ENABLE_DEBUG_ROUTES=true`) |

Severity values: `sev1`..`sev4`.

### Example

```bash
curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"alice@alpha.test","password":"Passw0rd!demo"}'
```
