#!/bin/sh

set -eu

IMAGE=${DAILY_CONTAINER_TEST_IMAGE:-daily:coolify-test}
ROOT=$(mktemp -d)
DATA_DIRECTORY="$ROOT/data"
BACKUP_DIRECTORY="$ROOT/backups"
CONTAINER="daily-coolify-test-$$"

cleanup() {
  docker rm --force "$CONTAINER" >/dev/null 2>&1 || true
  docker run --rm --user 0:0 --mount "type=bind,src=$ROOT,dst=/test" "$IMAGE" \
    sh -c 'rm -rf /test/data /test/backups' >/dev/null 2>&1 || true
  rm -rf "$ROOT"
}

trap cleanup EXIT INT TERM

docker build --tag "$IMAGE" .
image_environment=$(docker image inspect --format '{{json .Config.Env}}' "$IMAGE")
case "$image_environment" in
  *BETTER_AUTH_SECRET*|*GOOGLE_CLIENT_SECRET*|*RESEND_API_KEY*|*OPENAI_API_KEY*)
    echo 'The image contains a service secret environment variable.' >&2
    exit 1
    ;;
esac
mkdir -p "$DATA_DIRECTORY" "$BACKUP_DIRECTORY"

docker run --rm --user 0:0 --network none \
  --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  "$IMAGE" sh -c 'chown 10001:10001 /var/lib/daily /var/backups/daily && chmod 0750 /var/lib/daily /var/backups/daily'

run_migration() {
  docker run --rm --network none \
    --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
    --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
    -e DATABASE_URL=/var/lib/daily/daily.db \
    -e MIGRATIONS_DIRECTORY=/app/drizzle \
    "$IMAGE" node build/worker/runSqliteMigrateCommand.js
}

run_migration
run_migration

start_web() {
  docker run --detach --name "$CONTAINER" --network none \
    --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
    --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
    -e NODE_ENV=production \
    -e HOST=0.0.0.0 \
    -e PORT=5174 \
    -e ORIGIN=https://dailykickoff.eu \
    -e BETTER_AUTH_URL=https://dailykickoff.eu \
    -e DATABASE_URL=/var/lib/daily/daily.db \
    -e BACKUP_DIRECTORY=/var/backups/daily \
    -e MIGRATIONS_DIRECTORY=/app/drizzle \
    -e BETTER_AUTH_SECRET=container-test-better-auth-secret-32-bytes \
    -e GOOGLE_CLIENT_ID=container-test-client \
    -e GOOGLE_CLIENT_SECRET=container-test-client-secret \
    -e GOOGLE_MAPS_KILL_SWITCH=false \
    -e GOOGLE_MAPS_ATTRIBUTION_SECRET=container-test-maps-secret-32-bytes \
    -e GOOGLE_ROUTES_GLOBAL_DAILY_CAP=100 \
    -e GOOGLE_ROUTES_GLOBAL_MONTHLY_CAP=1000 \
    -e GOOGLE_ROUTES_PER_PERSON_DAILY_LIMIT=50 \
    -e GOOGLE_PLACES_GLOBAL_MONTHLY_CAP=10000 \
    -e GOOGLE_PLACES_PER_PERSON_DAILY_LIMIT=500 \
    -e SCHEDULED_DELIVERY_ENABLED=false \
    "$IMAGE"

  attempts=0
  while [ "$attempts" -lt 60 ]; do
    health=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || true)
    if [ "$health" = healthy ]; then
      return 0
    fi
    if [ "$health" = unhealthy ]; then
      docker logs "$CONTAINER"
      return 1
    fi
    attempts=$((attempts + 1))
    sleep 1
  done

  docker logs "$CONTAINER"
  return 1
}

assert_marker() {
  expected=$1
  actual=$(docker run --rm --network none \
    --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
    --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
    -e DATABASE_URL=/var/lib/daily/daily.db \
    "$IMAGE" node --input-type=module -e '
      import Database from "better-sqlite3";
      const database = new Database(process.env.DATABASE_URL, { readonly: true });
      console.log(database.prepare("SELECT email FROM users WHERE id = ?").pluck().get("coolify-test-user"));
      database.close();
    ')
  [ "$actual" = "$expected" ]
}

write_marker() {
  value=$1
  docker run --rm --network none \
    --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
    --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
    -e DATABASE_URL=/var/lib/daily/daily.db \
    "$IMAGE" node --input-type=module -e '
      import Database from "better-sqlite3";
      const database = new Database(process.env.DATABASE_URL);
      database.prepare("INSERT INTO users (id, google_subject, email) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email").run("coolify-test-user", "coolify-test-subject", process.argv[1]);
      database.close();
    ' "$value"
}

start_web
[ "$(docker inspect --format '{{.Config.User}}' "$CONTAINER")" = "10001:10001" ]
docker exec "$CONTAINER" node scripts/container-healthcheck.mjs
write_marker backup@example.com
docker stop --time 10 "$CONTAINER" >/dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")" = "0" ]
docker rm "$CONTAINER" >/dev/null

start_web
assert_marker backup@example.com
docker exec "$CONTAINER" node scripts/container-healthcheck.mjs
docker stop --time 10 "$CONTAINER" >/dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")" = "0" ]
docker rm "$CONTAINER" >/dev/null

docker run --rm --network none \
  --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e BACKUP_DIRECTORY=/var/backups/daily \
  -e BACKUP_RETENTION_DAYS=30 \
  "$IMAGE" node build/worker/runSqliteBackupCommand.js daily

RECOVERY_POINT_NAME=$(docker run --rm --network none \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  "$IMAGE" sh -c 'find /var/backups/daily -mindepth 1 -maxdepth 1 -type d -name "daily-*" -printf "%f\n" | sort | tail -n 1')
[ -n "$RECOVERY_POINT_NAME" ]
RECOVERY_POINT="/var/backups/daily/$RECOVERY_POINT_NAME"
CORRUPT_POINT=/var/backups/daily/corrupt-copy

write_marker changed@example.com

if docker run --rm --network none \
  --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  -e DATABASE_URL=/var/lib/daily/missing.db \
  -e BACKUP_DIRECTORY=/var/backups/daily \
  "$IMAGE" node build/worker/runSqliteBackupCommand.js daily; then
  echo 'Expected the backup command to reject a missing database.' >&2
  exit 1
fi

if docker run --rm --network none \
  --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e MIGRATIONS_DIRECTORY=/app/missing-migrations \
  "$IMAGE" node build/worker/runSqliteMigrateCommand.js; then
  echo 'Expected the migration command to reject a missing migration directory.' >&2
  exit 1
fi

docker run --rm --network none \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  "$IMAGE" sh -c 'cp -a "$1" "$2" && printf x >> "$2/backup.sqlite3"' sh "$RECOVERY_POINT" "$CORRUPT_POINT"

if docker run --rm --network none \
  --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e MIGRATIONS_DIRECTORY=/app/drizzle \
  -e DAILY_RESTORE_OFFLINE=true \
  -e SCHEDULED_DELIVERY_ENABLED=false \
  "$IMAGE" node build/worker/runSqliteRestoreContainerCommand.js "$CORRUPT_POINT"; then
  echo 'Expected the restore command to reject a corrupted recovery point.' >&2
  exit 1
fi

docker run --rm --network none \
  --mount "type=bind,src=$DATA_DIRECTORY,dst=/var/lib/daily" \
  --mount "type=bind,src=$BACKUP_DIRECTORY,dst=/var/backups/daily" \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e MIGRATIONS_DIRECTORY=/app/drizzle \
  -e DAILY_RESTORE_OFFLINE=true \
  -e SCHEDULED_DELIVERY_ENABLED=false \
  "$IMAGE" node build/worker/runSqliteRestoreContainerCommand.js "$RECOVERY_POINT"

assert_marker backup@example.com

docker run --rm --network none \
  -e DATABASE_URL=/var/lib/daily/daily.db \
  -e SCHEDULED_DELIVERY_ENABLED=false \
  "$IMAGE" node build/worker/runScheduledDailySummaryWorkerCommand.js

echo 'Coolify container checks passed.'
