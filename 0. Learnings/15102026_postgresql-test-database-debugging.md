# PostgreSQL Test Database Debugging — Interview Notes

## 1. Summary

We were trying to run the project's Vitest test suite, but its global setup could not connect to PostgreSQL.

The intended local database configuration was:

```yaml
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres
POSTGRES_DB: imsDebug
```

The application/test connection URL was:

```text
postgresql://postgres:postgres@localhost:3002/imsDebug
```

The failure was caused by a mismatch between the current Docker Compose configuration and the PostgreSQL database cluster stored in a persistent Docker volume. After resetting that volume, initialization exposed a second mismatch: an SQL initialization script tried to create a database owned by a role named `ims`, even though the configured user was `postgres`.

The consistent fix was to use `postgres` and `imsDebug` throughout the Compose configuration, correct the initialization script to use `postgres`, and recreate the disposable database volume so PostgreSQL could initialize from the corrected configuration.

> **Important:** The final fix described below is the configuration we agreed on. The session ended before we saw the final successful connection and test output, so the final success still needs to be verified.

---

## 2. What was the original error?

Vitest failed during `tests/global-setup.ts`, at the call to `client.connect()`.

The error was:

```text
Cannot reach the test database at
postgresql://postgres:postgres@localhost:3002/imsDebug

password authentication failed for user "postgres"
```

This happened before the tests themselves could run.

### What the connection URL means

| Part | Meaning |
|---|---|
| `postgresql://` | PostgreSQL connection |
| `postgres` before `:` | Database username |
| `postgres` after `:` | Password |
| `localhost` | Connect to this computer |
| `3002` | Host port |
| `imsDebug` | Database name |

The URL told us what credentials the test process was trying to use. It did not prove that the running database had those credentials.

---

## 3. How we reproduced and investigated the problem

### Step 1 — Try connecting without Vitest

We ran:

```bash
psql -h localhost -p 3002 -U postgres -d imsDebug -W
```

It failed with:

```text
FATAL: password authentication failed for user "postgres"
```

**What this told us:** the problem was not limited to Vitest. A direct PostgreSQL connection failed too.

### Step 2 — Compare the configuration

The Compose file contained:

```yaml
environment:
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: postgres
  POSTGRES_DB: imsDebug
ports:
  - "3002:5432"
volumes:
  - ./docker/initdb:/docker-entrypoint-initdb.d:ro
  - pgdata:/var/lib/postgresql/data
```

The environment file contained:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:3002/imsDebug
```

The test configuration loaded `DATABASE_URL`, and the global setup used it to connect to PostgreSQL.

At first, the application and Compose settings appeared to match. We needed to check the actual database stored on disk.

### Step 3 — Start PostgreSQL and try connecting inside the container

We ran:

```bash
docker compose up -d postgres
docker compose exec postgres psql -U postgres -d postgres
```

The second command failed:

```text
FATAL: role "postgres" does not exist
```

This was the most useful clue. The PostgreSQL server was running, but the database cluster did not contain the expected `postgres` role.

### Step 4 — Inspect the container and logs

We ran:

```bash
docker compose ps
docker compose logs postgres --tail=100
```

The logs said:

```text
PostgreSQL Database directory appears to contain a database; Skipping initialization
```

They also said:

```text
DETAIL: Role "postgres" does not exist.
```

**Root cause confirmed:** Docker was reusing an already-initialized PostgreSQL data directory. Changing `POSTGRES_USER` or `POSTGRES_PASSWORD` in Compose does not rewrite the users and passwords inside an existing database cluster.

### Step 5 — Find the initialization script

We ran:

```bash
ls -la docker/initdb
cat docker/initdb/01-create-test-db.sql
```

The script contained:

```sql
-- The integration tests run against a separate database so they can reset freely.
CREATE DATABASE ims_test OWNER ims;
```

But the Compose configuration defined `postgres`, not `ims`.

This was a second configuration mismatch. Once we removed the old volume and forced a fresh initialization, PostgreSQL ran this script and failed because the `ims` role did not exist.

### Step 6 — Inspect Docker volumes

We ran:

```bash
docker volume ls
```

The relevant volume was:

```text
1basics_pgdata
```

The other volumes belonged to other projects. We needed to be careful not to delete unrelated databases.

---

## 4. Root causes

There were two related issues.

### Root cause A — Stale PostgreSQL data volume

The Compose file described the desired initial user and database, but the persistent volume held a previously initialized cluster with different roles.

PostgreSQL initialization variables such as `POSTGRES_USER` and `POSTGRES_PASSWORD` are used when the data directory is first initialized. They are not a general-purpose way to update an existing database.

### Root cause B — Initialization SQL disagreed with Compose

The SQL script used:

```sql
CREATE DATABASE ims_test OWNER ims;
```

The configured user was:

```yaml
POSTGRES_USER: postgres
```

During fresh initialization, PostgreSQL could not assign ownership to `ims` because that role had not been created.

### Separate issue — Test discovery

Vitest also printed:

```text
Test Files no tests
Tests no tests
```

This is a separate issue from PostgreSQL authentication. It means Vitest did not discover any test files in that run. The database setup still ran and failed. After the database works, test discovery should be checked separately.

---

## 5. Alternatives we considered

### Option A — Recover the existing database and change its password

If the existing database had important data, we could have tried to connect using its actual existing administrator role, inspect its roles, and change the password or create the missing role.

**Advantages**
- Preserves existing database data.
- Appropriate for databases that contain useful information.

**Disadvantages**
- We did not know which roles existed.
- It required more investigation and possibly recovery steps.

### Option B — Delete the local test database volume and initialize it again

We chose this approach because the database was being used as a local test fixture and we accepted losing its existing data.

**Advantages**
- Starts from a clean, known configuration.
- Avoids recovering unknown credentials.
- Makes initialization repeatable.

**Disadvantages**
- Permanently deletes data in the removed volume.
- Initialization scripts must all be correct or the new setup can fail again.

**Safety rule:** Never remove a database volume unless you know what data it contains and have decided that deleting it is acceptable.

---

## 6. The fix we selected

The goal was to keep one consistent configuration:

- Username: `postgres`
- Password: `postgres`
- Main database: `imsDebug`
- Host port: `3002`
- Container port: `5432`

### Step 1 — Correct the initialization SQL

We changed `docker/initdb/01-create-test-db.sql` to:

```sql
-- The integration tests run against a separate database so they can reset freely.
CREATE DATABASE ims_test OWNER postgres;
```

This keeps the separate `ims_test` database while assigning ownership to the configured `postgres` user. It avoids introducing an `ims` role.

### Step 2 — Correct the PostgreSQL health check

The earlier health check used `ims`:

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ims -d ims"]
```

We changed it to:

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres -d imsDebug"]
  interval: 3s
  timeout: 3s
  retries: 20
```

The health check should reflect the user and database that the Compose configuration actually creates.

### Step 3 — Keep the main database URL consistent

The `.env` value remains:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:3002/imsDebug
```

The test configuration uses `DATABASE_URL`, so this URL must match the database that PostgreSQL exposes on the host.

### Step 4 — Recreate the disposable volume

We ran:

```bash
docker compose down
docker volume rm 1basics_pgdata
docker compose up -d
```

The volume removal was intentional: it forced PostgreSQL to initialize a new database cluster using the corrected settings.

**Data-loss warning:** `docker volume rm 1basics_pgdata` deletes the data stored in that volume. Do not use this as a routine fix for production or for a database whose data must be preserved.

---

## 7. How to verify the fix

Do not assume that editing the files means the problem is fixed. Verify each layer.

### Check 1 — Is the container running?

```bash
docker compose ps
docker compose logs postgres --tail=50
```

The PostgreSQL container should stay running. The logs should not show the `role "ims" does not exist` error.

### Check 2 — Can we connect to the main database?

```bash
psql -h localhost -p 3002 -U postgres -d imsDebug -W
```

Enter the configured password:

```text
postgres
```

If connected, PostgreSQL shows a prompt such as:

```text
imsDebug=#
```

Exit with:

```sql
\q
```

### Check 3 — Does the test database exist with the right owner?

```bash
docker compose exec postgres psql -U postgres -d postgres -c "\l"
```

Check that `ims_test` exists and its owner is `postgres`.

### Check 4 — Do the tests run?

```bash
npm run test
```

If the database connection works but Vitest still says `Test Files no tests`, investigate test discovery independently. Check the test file names, Vitest configuration, and the directory from which the command is run.

---

## 8. What to do differently next time

1. **Treat configuration and persistent state as separate things.** A Compose file describes how a new database should be initialized. A Docker volume stores the actual existing database.
2. **Do not assume an environment variable changed an existing database.** `POSTGRES_PASSWORD` does not automatically change the password of a previously initialized cluster.
3. **Keep database settings consistent.** The Compose environment, connection URL, health check, initialization SQL, and application configuration must agree.
4. **Inspect logs before changing more things.** Messages such as `Skipping initialization`, `role does not exist`, and `connection refused` describe different failure stages.
5. **Test outside the application.** A direct `psql` connection helps distinguish a database connectivity problem from an application or test-runner problem.
6. **Understand Docker port mapping.** `3002:5432` means port `3002` on the host maps to port `5432` inside the container.
7. **Make initialization scripts safe and consistent.** Every role referenced by a script must exist before that script runs. PostgreSQL initialization scripts run in filename order when a fresh data directory is initialized.
8. **Do not delete volumes blindly.** First identify the exact volume and confirm that its data can be discarded.
9. **Verify one layer at a time.** Check container status, database connectivity, database/schema initialization, and finally test discovery.
10. **Keep test setup deterministic.** A new developer should be able to start dependencies and run tests using documented commands without relying on old local database state.

---

## 9. Interview-level explanation

**Question: How did you debug the PostgreSQL connection failure?**

I started by reproducing the error with `psql` outside Vitest. The same authentication error occurred, so I knew it was not just a test-runner problem.

I compared the connection URL with the Docker Compose configuration. They both specified the `postgres` user, but the container logs showed that PostgreSQL was skipping initialization because a persistent data directory already existed. When I tried connecting inside the container, PostgreSQL reported that the `postgres` role did not exist.

I then inspected the Docker volume and the initialization SQL. The SQL attempted to create `ims_test` owned by `ims`, while Compose configured `postgres`. That was a second mismatch that would break a fresh initialization.

I chose to reset the local test volume because its existing data was disposable. I aligned the initialization SQL and health check with the configured `postgres` user, then recreated the volume so PostgreSQL could initialize from scratch.

Finally, I would verify the container logs, connect using `psql`, confirm the test database owner, and rerun Vitest. I would treat any remaining test-discovery error separately from database connectivity.

**Main lesson:** When a database connection fails, do not just keep changing passwords. Compare the application's connection settings with the actual database state, inspect the logs, and distinguish persistent-volume problems from configuration problems.
