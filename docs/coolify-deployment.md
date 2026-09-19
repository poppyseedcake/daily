# Deploy Daily with Coolify

This document is the operator guide for the home server. It prepares Daily for
Coolify, but it does not deploy to the server, change Cloudflare, change DNS, change
firewall rules, send real messages, or publish code.

The deployment model is one immutable Daily image, one web container, local SQLite,
and one Coolify Scheduled Task for Scheduled Delivery. The image uses Node.js
22.23.2, runs as UID/GID `10001:10001`, listens on port `5174`, and stores no
application data in its writable container filesystem.

Coolify documentation:

- [Scheduled Tasks](https://coolify.io/docs/applications/operations/scheduled-tasks)
- [Persistent Storage](https://coolify.io/docs/applications/configuration/persistent-storage)
- [Dockerfile deployments](https://coolify.io/docs/applications/builds/dockerfile)
- [Rolling Updates](https://coolify.io/docs/applications/deployments/rolling-updates)
- [Health Checks](https://coolify.io/docs/applications/configuration/health-checks)

## 1. Build one immutable image

Build the image from the exact Git commit that will run in production. Push it to a
private or trusted container registry. Replace the example image name with the real
registry name. Do not put service secrets in the build command or Dockerfile.

```sh
git status --short
git rev-parse HEAD
docker build --tag ghcr.io/example/daily:<commit-sha> .
docker push ghcr.io/example/daily:<commit-sha>
```

Use the image digest in Coolify when possible. Do not use `latest` for a production
deployment. The Dockerfile runs `npm ci`, compiles the web and administration
commands, removes development dependencies from the runtime stage, and runs the
application as the fixed unprivileged user.

The image contains these commands:

```text
node build
node build/worker/runScheduledDailySummaryWorkerCommand.js
node build/worker/runSqliteMigrateCommand.js
node build/worker/runSqliteBackupCommand.js daily
node build/worker/runSqliteBackupCommand.js pre-migration
node build/worker/runSqliteRestoreContainerCommand.js <recovery-point-directory>
```

The worker command is a one-shot process. It claims due work, uses the existing
delivery idempotency rules, and uses a SQLite-backed invocation lock. A second
invocation exits without sending work while the first invocation holds the lock.

## 2. Prepare local persistent storage

Run on the Debian host. Use a local filesystem. Do not use NFS for SQLite data. The
fixed numeric identity is part of the image contract.

```sh
sudo install --directory --owner=10001 --group=10001 --mode=0750 /srv/daily/data
sudo install --directory --owner=10001 --group=10001 --mode=0750 /srv/daily/backups
sudo chown 10001:10001 /srv/daily/data /srv/daily/backups
sudo chmod 0750 /srv/daily/data /srv/daily/backups
```

The two mounts are:

| Host path | Container path | Mode |
| --- | --- | --- |
| `/srv/daily/data` | `/var/lib/daily` | read/write |
| `/srv/daily/backups` | `/var/backups/daily` | read/write |

Mount the complete data directory, not only `daily.db`. SQLite can create `daily.db-wal`,
`daily.db-shm`, and the worker lock file beside the database. All must stay on the
same local filesystem. A persistent mount protects against container replacement. It
is not a backup.

## 3. Create the Coolify application

Create one Coolify application for the immutable image. Use the following settings:

| Setting | Value |
| --- | --- |
| Image | the commit image or digest from step 1 |
| Container port | `5174` |
| Public domain | `https://dailykickoff.eu` |
| Health path | `/health` if Coolify asks for a path |
| Rolling updates | disabled |
| Published host port | none |
| Persistent storage | the two bind mounts from step 2 |

If the Coolify version presents different names, set the equivalent recreate or
non-rolling deployment mode. Confirm on the host that only the intended Daily
container owns the application route. Do not mount `/var/run/docker.sock`.

Use a Docker Image application for production. A Git/Dockerfile build can be used to
produce the image, but production must still use an immutable tag or digest. Do not
put migration commands in a pre-deployment or post-deployment hook. A pre-deployment
hook can run in the old container, and a post-deployment hook runs after the new
container is already up. Neither hook is the migration boundary in this guide.

## 4. Configure environment variables

Import `deploy/coolify/daily.env.example` into Coolify, then set all empty values.
The example has no production secrets. Keep the initial value of
`SCHEDULED_DELIVERY_ENABLED` as `false`.

Validate the web configuration inside the running image before accepting traffic:

```sh
node scripts/validate-production-environment.mjs --context=web
```

The validator prints variable names only. It does not print secret values. Use the
context that matches the command:

```sh
node scripts/validate-production-environment.mjs --context=worker
node scripts/validate-production-environment.mjs --context=migrate
node scripts/validate-production-environment.mjs --context=backup
node scripts/validate-production-environment.mjs --context=restore
```

### Required for web and login

- `NODE_ENV=production`, `HOST=0.0.0.0`, and `PORT=5174`.
- `ORIGIN=https://dailykickoff.eu` and
  `BETTER_AUTH_URL=https://dailykickoff.eu`.
- `DATABASE_URL=/var/lib/daily/daily.db`.
- A random `BETTER_AUTH_SECRET` of at least 32 bytes.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- A separate random `GOOGLE_MAPS_ATTRIBUTION_SECRET` of at least 32 bytes.
- All five positive Google Maps limit variables in the example.

The Google OAuth redirect URI in the Google Cloud project is:

```text
https://dailykickoff.eu/api/auth/callback/google
```

The application starts login with `/api/auth/google`. Its successful application
return paths are `/?localSetupImport=1` and `/?calendarConnection=success`; its
calendar error path is `/?calendarConnection=failed`. These return paths do not
replace the Google provider redirect URI above.

### Required when Scheduled Delivery is enabled

- `SCHEDULED_DELIVERY_ENABLED=true`.
- `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google token refresh.
- `BETTER_AUTH_SECRET` and `GOOGLE_MAPS_ATTRIBUTION_SECRET`.
- `DATABASE_URL`.

`OPENAI_API_KEY` is optional. Without it, the weather summary add-on returns its
normal unavailable result. Google Routes and Google Places API keys are also
feature-specific optional values. The five Google Maps limits are required because
the usage gate must have safe numeric limits.

### Optional features and limits

- `GOOGLE_ROUTES_API_KEY` enables route estimates.
- `GOOGLE_PLACES_API_KEY` enables Places search.
- `GOOGLE_MAPS_KILL_SWITCH=true` disables Google Maps operations.
- `GOOGLE_MAPS_OPERATOR_ALERT_EMAIL` receives configured cap alerts.
- `ADMINISTRATOR_EMAIL_ALLOWLIST` is a comma-separated list of allowed admin emails.
- `OPERATIONAL_RETENTION_DAYS` controls operational record retention.
- `SCHEDULED_WORKER_OVERDUE_MINUTES` controls the worker health threshold.
- `BACKUP_RETENTION_DAYS` controls verified recovery-point retention.

Set `MIGRATIONS_DIRECTORY=/app/drizzle` and `BACKUP_DIRECTORY=/var/backups/daily`.
Do not put the database or recovery points in the image or release directory.

### Resend domain verification

In the Resend dashboard, add and verify the sending domain. Publish every DNS record
that Resend shows for the domain, including SPF and DKIM records. Wait for the domain
to show as verified, then set `RESEND_FROM_EMAIL` to an address at that verified
domain. Cloudflare domain activation does not verify a Resend sending domain. Do not
enable Scheduled Delivery until Resend shows the domain as verified.

## 5. First deployment

Keep the application stopped while preparing the empty database. The exact image
must be used for migration and for the first web start. The following commands are
operator examples; run them on the host with the same two mounts as Coolify.

Prepare the database directory, then run migration once:

```sh
docker run --rm --network none \
  --mount type=bind,src=/srv/daily/data,dst=/var/lib/daily \
  --mount type=bind,src=/srv/daily/backups,dst=/var/backups/daily \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e MIGRATIONS_DIRECTORY=/app/drizzle \
  ghcr.io/example/daily:<commit-sha> \
  node build/worker/runSqliteMigrateCommand.js
```

An absent database is valid for the first migration. A failed migration is not a
successful first deployment. Run the migration command a second time to verify that
it is safe to repeat.

Start the Coolify application with `SCHEDULED_DELIVERY_ENABLED=false`, then check:

```sh
curl --fail --silent https://dailykickoff.eu/health
```

The expected response is exactly `{"status":"ok"}`. Also verify that the Docker
health check is healthy and that the container user is `10001:10001`. Test login and
application pages with Scheduled Delivery still disabled. Do not send a real message
as part of this local or first-deployment check.

## 6. Configure the one-minute Scheduled Task

Create one Coolify Scheduled Task for the application:

| Field | Value |
| --- | --- |
| Command | `node build/worker/runScheduledDailySummaryWorkerCommand.js` |
| Schedule | `* * * * *` |
| Timeout | at least `900` seconds |
| Initial state | disabled |

The task must run in the same application container and use the same database mount.
Coolify executes the command through the container shell. Disable the task before
each migration and restore. Disabling future runs does not stop a command that is
already running, so wait for the active task to finish before stopping the app.

Keep `SCHEDULED_DELIVERY_ENABLED=false` until the operator acceptance steps are
complete. When the task is explicitly enabled, set the application variable to
`true` in the same maintenance action. If the task runs by mistake while the value
is `false`, the worker exits without loading delivery providers. Do not add a second
cron, systemd timer, or long-running worker container.

If one run can exceed one minute, the invocation lock still prevents overlapping
worker execution. Check the Coolify task history and the `scheduled_worker_runs`
records for failures and overdue state.

## 7. Update procedure

Use a short maintenance window. Do not rely on a Coolify pre-deployment hook to stop
the old container.

1. Build and push the candidate image. Do not change the running image or mounts.
2. Disable the Coolify Scheduled Task and set `SCHEDULED_DELIVERY_ENABLED=false`.
3. Wait longer than the task timeout, or confirm in Coolify that no task execution is
   active. A disabled task does not cancel an active execution.
4. Stop the Daily application container. Confirm that no old Daily container can
   write to `/srv/daily/data`.
5. Run a pre-migration backup with the current image:

   ```sh
   docker run --rm --network none \
     --mount type=bind,src=/srv/daily/data,dst=/var/lib/daily \
     --mount type=bind,src=/srv/daily/backups,dst=/var/backups/daily \
     -e DATABASE_URL=/var/lib/daily/daily.db \
     -e BACKUP_DIRECTORY=/var/backups/daily \
     -e BACKUP_RETENTION_DAYS=30 \
     ghcr.io/example/daily:<current-sha> \
     node build/worker/runSqliteBackupCommand.js pre-migration
   ```

6. Confirm that the command created a new finalized directory containing
   `backup.sqlite3` and `metadata.json`. A previous recovery point is not proof that
   this backup succeeded.
7. Run the migration from the candidate image. A non-zero result stops the update:

   ```sh
   docker run --rm --network none \
     --mount type=bind,src=/srv/daily/data,dst=/var/lib/daily \
     --mount type=bind,src=/srv/daily/backups,dst=/var/backups/daily \
     -e DATABASE_URL=/var/lib/daily/daily.db \
     -e MIGRATIONS_DIRECTORY=/app/drizzle \
     ghcr.io/example/daily:<candidate-sha> \
     node build/worker/runSqliteMigrateCommand.js
   ```

8. Point Coolify to the candidate digest and recreate the application. Do not use
   rolling updates. Confirm that the old container is gone before the new container
   writes to the database.
9. Check the Docker health check, `/health`, logs, and basic application pages.
10. Keep Scheduled Delivery disabled. Enable it only after the candidate passes the
    operator acceptance check.

If backup or migration fails, do not start the candidate. Keep the old application
stopped until the cause is understood. Restore the pre-migration recovery point only
with the offline restore procedure below when the database must be returned to its
previous schema.

## 8. Code rollback and database rollback

A Coolify image rollback changes code only. It does not reverse a SQLite migration or
change a persistent mount. A code-only rollback is allowed only when the previous
image is known to support the current schema.

For a schema-compatible code rollback:

1. Disable the Scheduled Task and set `SCHEDULED_DELIVERY_ENABLED=false`.
2. Wait for active worker execution to finish.
3. Stop the Daily application.
4. Point Coolify to the previous immutable image and recreate the application.
5. Check `/health` and keep Scheduled Delivery disabled until the application is
   accepted.

For a schema-incompatible failure, restore the matching pre-migration point before
starting the previous image. Never switch only the image and assume the database was
rolled back.

## 9. Offline restore in a container

Restore requires all database writers to be stopped. Keep the Scheduled Task disabled,
stop the web container, and verify that no Daily container is running. If a host loss
created an empty data directory, run the migration command once first so that
`daily.db` exists; the restore command intentionally refuses a missing active file.

Set these values only for the one-off restore container:

```sh
DAILY_RESTORE_OFFLINE=true
SCHEDULED_DELIVERY_ENABLED=false
```

Run restore with the same data and backup mounts:

```sh
docker run --rm --network none \
  --mount type=bind,src=/srv/daily/data,dst=/var/lib/daily \
  --mount type=bind,src=/srv/daily/backups,dst=/var/backups/daily \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e MIGRATIONS_DIRECTORY=/app/drizzle \
  -e DAILY_RESTORE_OFFLINE=true \
  -e SCHEDULED_DELIVERY_ENABLED=false \
  ghcr.io/example/daily:<image-sha> \
  node build/worker/runSqliteRestoreContainerCommand.js \
  /var/backups/daily/pre-migration-<timestamp>-<uuid>
```

The command checks the metadata, SHA-256 checksum, SQLite integrity, destination
sidecars, and offline flag. It copies the new database to a temporary file, verifies
the copy, renames the old database to a `.recovery-<timestamp>-<uuid>` path, and
installs the copy atomically. A migration failure leaves the replaced database at
that path. The command never starts web and never calls `systemctl`.

After restore:

1. Keep Scheduled Delivery disabled.
2. Start the Coolify application with the same image and mounts.
3. Check Docker health and `https://dailykickoff.eu/health`.
4. Check login, stored configuration, and the affected data.
5. Keep the `.recovery-*` database until acceptance is complete.
6. Enable Scheduled Delivery only after the recovered application passes acceptance.

If the recovery point is damaged, the command exits non-zero and leaves the active
database unchanged. Do not repair a recovery point in place. Select another verified
point or repair the backup process.

## 10. Backup and Restic integration

Daily backup is SQLite-aware. Do not use Restic to copy the live `daily.db` while the
application is running and call that a database backup. Run the Daily backup command
first, then transfer finalized recovery points.

The final artifacts for Backblaze B2 are the directories below:

```text
/srv/daily/backups/daily-*/backup.sqlite3
/srv/daily/backups/daily-*/metadata.json
/srv/daily/backups/pre-migration-*/backup.sqlite3
/srv/daily/backups/pre-migration-*/metadata.json
```

Exclude these working files and directories:

```text
**/.backup-operation-lock.sqlite3
**/.*.tmp
**/.recovery-*
**/.restore-*
```

Run Restic only after the Daily backup command reports success and a new finalized
directory is visible. The exact Restic repository and password remain host secrets;
store them outside this repository. An example transfer is:

```sh
restic backup /srv/daily/backups \
  --exclude='**/.backup-operation-lock.sqlite3' \
  --exclude='**/.*.tmp' \
  --exclude='**/.recovery-*' \
  --exclude='**/.restore-*'
restic check
```

Verify freshness with `restic snapshots` and inspect the newest `metadata.json` after
restore or download. Check its `createdAt`, `purpose`, `checksum`, `sizeBytes`, and
`integrityCheck` fields. A historical snapshot is not proof that the current Daily
backup succeeded.

Back up the recovery procedure, image digest, Coolify application settings, storage
mounts, domain route, and all environment secrets separately. Do not put secrets in
Restic command arguments or Git. Keep the current secret values in a password manager
or another encrypted operator store.

### Host-loss recovery

1. Install Debian, Docker, Coolify, and the required trusted registry access.
2. Recreate `/srv/daily/data` and `/srv/daily/backups` with UID/GID `10001:10001` and
   mode `0750`.
3. Restore the required Daily recovery point from B2 into `/srv/daily/backups`.
4. Restore the saved Coolify environment values and image digest.
5. Run the migration command to create an empty `daily.db`.
6. Run the offline container restore command.
7. Start the application with Scheduled Delivery disabled and verify `/health`.
8. Recreate the Cloudflare and Traefik route as a separate operator task.
9. Enable Scheduled Delivery only after the recovered data and email configuration
   pass acceptance.

## 11. Proxy and tunnel boundary

The intended route is:

```text
Cloudflare -> cloudflared on the host -> Traefik -> Daily container:5174
```

Daily listens on `0.0.0.0:5174` inside its container so that Traefik can reach it.
Do not publish port 5174 on every host interface. Do not expose the Coolify panel on
the Daily domain. Keep the public application URL as
`https://dailykickoff.eu`; the local connector-to-Traefik protocol can be HTTP if the
existing host route uses HTTP.

Do not add an origin HTTP-to-HTTPS redirect without checking the current Traefik and
cloudflared route. The public HTTPS URL is already provided by the public proxy. A
second blind redirect at the origin can create a loop. `ORIGIN` and
`BETTER_AUTH_URL` must remain the public HTTPS URL so that callbacks and secure
cookies use the public address.

This repository change does not create the Cloudflare tunnel route, change DNS, or
change firewall rules. The operator must check those values in the existing homelab
configuration.

## 12. Acceptance boundary

Completed locally in this repository:

- TypeScript and Svelte check.
- Unit tests for compiled migration, worker lock, disabled delivery, container
  restore, validation, and existing systemd behaviour.
- Production web and worker build.
- Docker image build without production secrets.
- Container run as UID/GID `10001:10001` with no host port.
- `/health` and Docker health check.
- Container recreation with database persistence.
- Idempotent migration rerun.
- Verified backup, corrupted-point rejection, offline restore, and restore data check.
- Local provider isolation with `--network none`; no real messages.

Required later on the homelab or service consoles:

- Configure the Coolify application, storage mounts, domain, and one-minute task.
- Confirm the Cloudflare, cloudflared, and Traefik route for `dailykickoff.eu`.
- Verify Google OAuth redirect URI and a real signed-in login.
- Verify Resend domain and sender configuration.
- Run a controlled Test Delivery to an approved recipient.
- Run one controlled Scheduled Delivery and inspect the delivery record and provider
  idempotency result.
- Verify Restic upload, B2 retention, `restic check`, and host-loss recovery evidence.

Do not mark the deployment production-ready because `/health` returns 200 alone.
