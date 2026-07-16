# Deploy Daily to production

Daily supports one production topology: Node.js 22.15.0 and npm 10.9.2 on a single VPS,
with the web process and scheduled jobs supervised by systemd. Run deployments as a root
operator from a trusted, complete source checkout whose release identifier is immutable
(for example, the Git commit SHA).

## Production prerequisites

Create the dedicated, unprivileged `daily` account and the directory layout described in
`docs/systemd-web-service.md` before the first deployment:

- `/srv/daily/releases` contains replaceable, root-owned and `daily`-group-readable releases;
- `/srv/daily/current` is the active-release symlink;
- `/var/lib/daily/daily.db` is persistent application data owned by `daily`;
- `/var/backups/daily` is persistent backup storage owned by `daily`;
- `/etc/daily/daily.env` is `root:daily` mode `0640` and contains the production environment.

The release, database, backups, and environment file must remain separate. Install the exact
supported Node and npm versions from `docs/supported-runtime.md`. Configure at least
`DATABASE_URL=/var/lib/daily/daily.db`, `BACKUP_DIRECTORY=/var/backups/daily`, and every value
documented by `deploy/systemd/daily.env.example`. Do not place secrets in a release checkout.

## Deploy a release

Load the production environment for the operator command, then invoke the workflow with the
source checkout and a new release identifier:

```sh
set -a
. /etc/daily/daily.env
set +a
sudo --preserve-env=DATABASE_URL,BACKUP_DIRECTORY npm run deploy:production -- /path/to/daily-source "$(git -C /path/to/daily-source rev-parse HEAD)"
```

The command performs one ordered workflow and exits non-zero on any failed step:

1. Copies the source into a private staging release, removes copied build/dependency state,
   installs exactly `package-lock.json` with `npm ci`, and completes the production web and
   worker build before touching the running release.
2. Runs the verified `pre-migration` online backup. The backup command creates a new recovery
   point, checks SQLite integrity and its checksum, and only then succeeds. A failure stops the
   deployment before services are stopped or migration is invoked.
3. Stops both timers, the worker, and the web service, then runs `npm run db:migrate` exactly once
   from the candidate release. Normal web and worker startup never runs migrations.
4. Restricts the release to `root:daily`, atomically switches `/srv/daily/current`, installs all
   required units, reloads systemd, enables the web service and both timers, and restarts them.
5. Requires the web service and timers to be active, then requires the local readiness endpoint
   to return exactly `{"status":"ok"}`.

Build, backup, migration, unit installation, service-state, or readiness failure makes the
deployment unsuccessful. Inspect `systemctl status` and `journalctl` as described in
`docs/systemd-web-service.md`; do not report or promote a failed deployment. If a failure occurs
after services stop, the command attempts to restart the previous release. If the candidate was
already activated, it first restores the previous application symlink and unit files; a rejected
first release is removed so the immutable release identifier can be retried. A completed migration
is not reversed by this application rollback, so verify the old release remains schema-compatible
or use the database restore procedure below.

## Rollback and restoration

An application rollback switches `/srv/daily/current` to a previously built release and restarts
the units. It does **not** reverse database migrations, and older application code may be
incompatible with the migrated schema. Database recovery is a separate, offline operation using
a verified recovery point. Follow the supported restore procedure and its validation checklist in
`docs/sqlite-backups.md`; never substitute a code rollback for database restoration.
