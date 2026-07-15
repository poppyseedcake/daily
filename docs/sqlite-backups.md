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

Success exits with status 0. Invalid configuration, backup, verification, or finalization failures exit non-zero, publish no new finalized recovery point, skip retention, and emit only schema-validated technical events. Temporary directories use a leading dot and are never recovery points.

Backups on the same VPS protect against migration mistakes and release-directory loss, but not complete host loss. Offsite transfer remains a separate operational concern.
