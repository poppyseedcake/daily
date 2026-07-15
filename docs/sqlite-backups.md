# SQLite backups

Daily owns one online SQLite backup command for routine and deployment recovery points:

```sh
npm run db:backup -- daily
npm run db:backup -- pre-migration
```

Set `DATABASE_URL` to the live SQLite database and set `BACKUP_DIRECTORY` to persistent storage outside the active release directory. `BACKUP_RETENTION_DAYS` is optional and defaults to 30 days.

The command keeps the WAL-backed application database online and uses SQLite's online backup API. It writes into a private temporary directory, runs SQLite `integrity_check`, calculates a SHA-256 checksum, writes allowlisted metadata, applies file modes `0640` and directory mode `0750`, and atomically renames the directory to its final UTC-and-UUID name. A finalized directory contains:

- `backup.sqlite3` — the consistent SQLite snapshot
- `metadata.json` — purpose, UTC creation time, checksum, size, and format version

Daily and pre-migration commands share a SQLite-backed operation lock in the backup directory, so concurrent processes wait and publish distinct recovery points. Retention starts only after a new point is verified and finalized. Points older than the configured boundary are removed, except that the newest verified point of each purpose is always preserved.

If the filesystem prevents removal of an expired point, the verified new recovery point remains successful and the command emits a `sqlite-backup-retention-failed` warning event. Operators should treat that event as a storage-growth alert and repair the backup-directory permissions or capacity.

Success exits with status 0. Invalid configuration, backup, verification, or finalization failures exit non-zero, publish no new finalized recovery point, skip retention, and emit only schema-validated technical events. Temporary directories use a leading dot and are never recovery points.

Backups on the same VPS protect against migration mistakes and release-directory loss, but not complete host loss. Offsite transfer remains a separate operational concern.

## Offline restore

Restore is intentionally an operator-driven, offline operation. Select a finalized recovery-point directory, not a loose `backup.sqlite3` file. Configure the active database, systemd web service, and local readiness URL, then run:

```sh
export DATABASE_URL=/srv/daily/shared/daily.db
export DAILY_SERVICE_NAME=daily-web.service
export READINESS_URL=http://127.0.0.1:3000/health

sudo systemctl stop "$DAILY_SERVICE_NAME"
npm run db:restore -- /srv/daily/backups/daily-20260715T100000000Z-<backup-id>
```

The command refuses to replace the database unless systemd reports the selected web service as `inactive`, the active database is an ordinary file, and no SQLite `-wal` or `-shm` sidecars remain. It then verifies the metadata checksum and opens the backup read-only for SQLite `integrity_check`. A missing checksum, mismatch, invalid SQLite file, or invalid destination leaves the active database unchanged.

For a valid recovery point, the command copies the verified backup to the active database filesystem, preserves the replaced database with a unique `.recovery-<UTC>-<UUID>` suffix, and atomically renames the verified copy into place. It explicitly runs `npm run db:migrate`, starts the web service, requires systemd to report it active, and requires the readiness endpoint to return exactly `{"status":"ok"}` before reporting success. A failure in any post-install check exits unsuccessfully and keeps the replaced database for operator rollback.

### Operator checklist

1. Confirm the selected recovery point predates the incident and is a finalized directory containing `backup.sqlite3` and `metadata.json`.
2. Stop `DAILY_SERVICE_NAME`; do not run restore against a merely degraded or stopping service.
3. Run the restore command and retain its reported `.recovery-...` path.
4. Confirm the migration, systemd active-state, and readiness checks all succeeded.
5. Exercise the recovered Daily application at the User and Administrator boundaries appropriate to the incident.
6. Keep the replaced database until recovery is explicitly accepted. Only then remove that one reported `.recovery-...` file according to the operational retention policy.

If migration, startup, readiness, or application checks fail, stop the service. To roll back, preserve the failed restored database for investigation, atomically move the reported `.recovery-...` database back to `DATABASE_URL`, and restart the verification checklist. A code rollback does not reverse a forward SQLite migration; rollback is limited to the preserved pre-restore database or another verified recovery point.

Historical finalized recovery points are immutable artifacts: never edit them to repair a restore or remove User data. They retain the same restricted access until backup retention expires. Same-VPS-only storage remains a residual risk because complete host or volume loss can destroy the live database and every local recovery point together; this workflow is not an offsite disaster-recovery system.
