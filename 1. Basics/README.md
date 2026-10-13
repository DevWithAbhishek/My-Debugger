# IMS API - debugging exercise repository

> **WARNING: this repository is intentionally broken.**
> It is an interview fixture containing deliberate defects, including authentication and authorization
> flaws. Run it **only on localhost** with the fictional seed data. Never deploy it, expose it to a
> network, or reuse any secret from it. All credentials, tokens and "customer" data here are fake.

Your task is described in [`ASSIGNMENT.md`](./ASSIGNMENT.md). The intended API behaviour is in
[`docs/API.md`](./docs/API.md).

## Prerequisites

- Node.js 20.12+ (developed on Node 22) and npm
- Docker with Compose v2 (for PostgreSQL 16 and Redis 7), **or** your own local PostgreSQL 14+ and Redis 6+
  reachable with the credentials in `.env.example`

## Setup

```bash
npm ci
cp .env.example .env
docker compose up -d            # postgres on 127.0.0.1:5432, redis on 127.0.0.1:6379 (creates `ims` and `ims_test` databases)
npm run db:reset                # applies db/migrations and seeds fictional data
npm start                       # http://127.0.0.1:3000
npm run smoke                   # in another terminal: happy-path check
```

If you use your own PostgreSQL instead of Docker, create the role/databases yourself
(`ims` / `ims_local_pw`, databases `ims` and `ims_test`) or override `DATABASE_URL` and `DATABASE_URL_TEST`.

Seeded users and their shared fictional password are listed in `docs/API.md`.

## Tests - failures are expected

The suite encodes the contracts in `docs/API.md`. **Several tests fail on the unmodified repository; that is
the point.** Do not assume a failing test is a bad test, and do not assume a passing test proves a
behaviour is correct. Tests need PostgreSQL and Redis running; they use database `ims_test` and Redis db 15.

```bash
npm test                  # everything (about 30 s; the startup tests spawn child processes)
npm run test:happy        # core flows + unit tests (should pass at baseline)
npm run test:startup      # process start-up contract
npm run test:errors       # error envelope / request id contract
npm run test:readiness    # dependency outage behaviour (uses injected stand-ins, no Docker needed)
npm run test:shutdown     # SIGTERM during a slow request
npm run test:authn        # authentication contract
npm run test:authz        # role / team authorization contract
npm run test:sessions     # refresh tokens and admin-driven changes
npm run typecheck
```

Run a single test by name: `npx vitest run -t "part of the test name"`.
There is no linter configured.

## Reproduction scripts (all local, all reversible)

| Command | What it does |
|---|---|
| `npm run smoke` | Happy-path calls against a running server |
| `npm run check:startup -- missing-db` / `-- bad-port` | Starts the server with a bad configuration and prints what happens |
| `npm run check:shutdown` | Starts a server, sends a slow request, sends SIGTERM mid-request, reports the outcome |
| `npm run inject:db-outage` | `docker compose stop postgres`, then prints how the running API behaves. Undo: `npm run inject:db-outage -- --restore` |
| `npm run inject:redis-outage` | Same for Redis. Undo: `npm run inject:redis-outage -- --restore` |

The outage scripts only run `docker compose stop|start|exec` for one named service of this repo's
`docker-compose.yml`. Start the API (`npm start`) first. Set `COMPOSE_BIN` if your compose command differs.
Without Docker, stop and start your own PostgreSQL/Redis by hand instead.

`GET /api/v1/debug/boom` and `GET /api/v1/debug/slow?ms=N` are test-support endpoints
(enabled by `ENABLE_DEBUG_ROUTES=true` in `.env.example`).

## Reset / restore

```bash
docker compose start postgres redis     # bring dependencies back
npm run db:reset                        # wipe and re-seed the dev database
docker compose down -v                  # remove containers and data entirely
```

## Troubleshooting

- `Cannot reach the test database` - dependencies are not running; `docker compose up -d`.
- `EADDRINUSE` after a crashed run with `PORT=abc` - delete the stray socket file `./abc`.
- To ignore your `.env` for one run, set `ENV_FILE=none` (e.g. `ENV_FILE=none PORT=3001 JWT_SECRET=... npm start`).
- On Windows, behaviour of non-numeric `PORT` values may differ from macOS/Linux.
- Error text for a missing database configuration differs between machines (it depends on your OS user).

## Layout

`src/` application, `db/` migrations + seed, `tests/` unit and integration tests, `scripts/` local
reproduction helpers, `docs/API.md` intended contract.
