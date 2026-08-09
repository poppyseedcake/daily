#!/bin/sh
set -eu

SOURCE_DIRECTORY=${1:-}
RELEASE_ID=${2:-}
RELEASES_DIRECTORY=${DAILY_RELEASES_DIRECTORY:-/srv/daily/releases}
CURRENT_LINK=${DAILY_CURRENT_LINK:-/srv/daily/current}
SYSTEMD_DIRECTORY=${DAILY_SYSTEMD_DIRECTORY:-/etc/systemd/system}
RELEASE_OWNER=${DAILY_RELEASE_OWNER:-root}
RELEASE_GROUP=${DAILY_RELEASE_GROUP:-daily}
READINESS_URL=${READINESS_URL:-http://127.0.0.1:5174/health}
PREVIOUS_RELEASE_SCHEMA_COMPATIBLE=${DAILY_PREVIOUS_RELEASE_SCHEMA_COMPATIBLE:-false}

fail() {
  printf '%s\n' "Daily deployment failed: $1" >&2
  exit 1
}

[ -n "$SOURCE_DIRECTORY" ] || fail 'source directory is required.'
[ -d "$SOURCE_DIRECTORY" ] || fail 'source directory does not exist.'
[ -f "$SOURCE_DIRECTORY/package-lock.json" ] || fail 'package-lock.json is required.'
[ -n "$RELEASE_ID" ] || fail 'release identifier is required.'
case "$RELEASE_ID" in
  *[!A-Za-z0-9._-]*) fail 'release identifier contains unsupported characters.' ;;
esac
[ -n "${DATABASE_URL:-}" ] || fail 'DATABASE_URL is required.'
[ -n "${BACKUP_DIRECTORY:-}" ] || fail 'BACKUP_DIRECTORY is required.'
case "$PREVIOUS_RELEASE_SCHEMA_COMPATIBLE" in
  true|false) ;;
  *) fail 'DAILY_PREVIOUS_RELEASE_SCHEMA_COMPATIBLE must be true or false.' ;;
esac

SOURCE_DIRECTORY=$(cd "$SOURCE_DIRECTORY" && pwd -P)
SOURCE_COMMIT=$(git -C "$SOURCE_DIRECTORY" rev-parse --verify 'HEAD^{commit}' 2>/dev/null) ||
  fail 'source checkout has no readable commit.'
SOURCE_STATUS=$(git -C "$SOURCE_DIRECTORY" status --porcelain --untracked-files=all) ||
  fail 'source checkout status could not be read.'
[ -z "$SOURCE_STATUS" ] || fail 'source checkout contains uncommitted changes.'
[ "$RELEASE_ID" = "$SOURCE_COMMIT" ] || fail 'release identifier must equal the source commit SHA.'

RELEASE_DIRECTORY=$RELEASES_DIRECTORY/$RELEASE_ID
STAGING_DIRECTORY=$RELEASES_DIRECTORY/.${RELEASE_ID}.staging-$$
NEXT_LINK=${CURRENT_LINK}.next-$$
PREVIOUS_LINK_TARGET=$(readlink "$CURRENT_LINK" 2>/dev/null || true)
PREVIOUS_RELEASE_DIRECTORY=
if [ -n "$PREVIOUS_LINK_TARGET" ]; then
  case "$PREVIOUS_LINK_TARGET" in
    /*) PREVIOUS_RELEASE_DIRECTORY=$PREVIOUS_LINK_TARGET ;;
    *) PREVIOUS_RELEASE_DIRECTORY=$(cd "$(dirname "$CURRENT_LINK")/$PREVIOUS_LINK_TARGET" && pwd -P) ;;
  esac
fi
RELEASE_ACTIVATED=false
SERVICES_STOPPED=false
MIGRATION_ATTEMPTED=false

latest_pre_migration_recovery_point() {
  latest=
  for recovery_point in "$BACKUP_DIRECTORY"/pre-migration-*
  do
    if [ -d "$recovery_point" ] &&
      [ -f "$recovery_point/backup.sqlite3" ] &&
      [ -f "$recovery_point/metadata.json" ]; then
      latest=$recovery_point
    fi
  done
  printf '%s' "$latest"
}

stop_production_units() {
  systemctl stop \
    daily-scheduled-worker.timer \
    daily-backup.timer \
    daily-scheduled-worker.service \
    daily-web.service
}

hold_scheduled_delivery() {
  systemctl disable --now daily-scheduled-worker.timer
  systemctl stop daily-scheduled-worker.service
}

start_web_and_backup_units() {
  systemctl enable daily-web.service daily-backup.timer
  hold_scheduled_delivery
  systemctl restart daily-web.service
  systemctl restart daily-backup.timer
  systemctl is-active --quiet daily-web.service daily-backup.timer
  systemctl is-inactive --quiet daily-scheduled-worker.timer daily-scheduled-worker.service
}

restore_previous_release() {
  if [ -n "$PREVIOUS_LINK_TARGET" ]; then
    rollback_link=${CURRENT_LINK}.rollback-$$
    ln -s "$PREVIOUS_LINK_TARGET" "$rollback_link"
    mv -Tf "$rollback_link" "$CURRENT_LINK"
    for unit in \
      daily-web.service \
      daily-scheduled-worker.service \
      daily-scheduled-worker.timer \
      daily-backup.service \
      daily-backup.timer
    do
      if [ -f "$PREVIOUS_RELEASE_DIRECTORY/deploy/systemd/$unit" ]; then
        install -m 0644 "$PREVIOUS_RELEASE_DIRECTORY/deploy/systemd/$unit" "$SYSTEMD_DIRECTORY/$unit"
      fi
    done
    rm -rf "$RELEASE_DIRECTORY"
  else
    rm -f "$CURRENT_LINK"
    rm -f \
      "$SYSTEMD_DIRECTORY/daily-web.service" \
      "$SYSTEMD_DIRECTORY/daily-scheduled-worker.service" \
      "$SYSTEMD_DIRECTORY/daily-scheduled-worker.timer" \
      "$SYSTEMD_DIRECTORY/daily-backup.service" \
      "$SYSTEMD_DIRECTORY/daily-backup.timer"
  fi
  systemctl daemon-reload
}

[ ! -e "$RELEASE_DIRECTORY" ] || fail 'release identifier already exists.'
mkdir -p "$RELEASES_DIRECTORY" "$SYSTEMD_DIRECTORY"

finish() {
  status=$?
  set +e
  if [ "$status" -ne 0 ]; then
    if [ "$SERVICES_STOPPED" = true ]; then
      stop_production_units || true
      hold_scheduled_delivery || true
    fi
    if [ "$RELEASE_ACTIVATED" = true ] &&
      [ "$PREVIOUS_RELEASE_SCHEMA_COMPATIBLE" = true ] &&
      [ -n "$PREVIOUS_LINK_TARGET" ]; then
      restore_previous_release || true
      start_web_and_backup_units || true
    elif [ "$MIGRATION_ATTEMPTED" = false ] &&
      [ "$RELEASE_ACTIVATED" = false ] &&
      [ "$SERVICES_STOPPED" = true ] &&
      [ -n "$PREVIOUS_LINK_TARGET" ]; then
      start_web_and_backup_units || true
    elif [ "$RELEASE_ACTIVATED" = true ] || [ "$MIGRATION_ATTEMPTED" = true ]; then
      printf '%s\n' \
        'Daily deployment stopped all services. Restore the previous release and the pre-migration database recovery point together; code-only rollback is blocked without explicit schema compatibility.' >&2
    fi
  fi
  rm -rf "$STAGING_DIRECTORY"
  rm -f "$NEXT_LINK"
  trap - EXIT HUP INT TERM
  exit "$status"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$STAGING_DIRECTORY"
cp -a "$SOURCE_DIRECTORY/." "$STAGING_DIRECTORY/"
rm -rf "$STAGING_DIRECTORY/.git" "$STAGING_DIRECTORY/node_modules" "$STAGING_DIRECTORY/build"

(
  cd "$STAGING_DIRECTORY"
  npm ci
  npm run build
)

# The backup command verifies SQLite integrity and its finalized checksum before it succeeds.
PREVIOUS_PRE_MIGRATION_RECOVERY_POINT=$(latest_pre_migration_recovery_point)
(
  cd "$STAGING_DIRECTORY"
  npm run db:backup -- pre-migration
)
PRE_MIGRATION_RECOVERY_POINT=$(latest_pre_migration_recovery_point)
[ -n "$PRE_MIGRATION_RECOVERY_POINT" ] || fail 'pre-migration backup produced no finalized recovery point.'
[ "$PRE_MIGRATION_RECOVERY_POINT" != "$PREVIOUS_PRE_MIGRATION_RECOVERY_POINT" ] ||
  fail 'pre-migration backup did not produce a new recovery point.'

printf '%s\n' \
  "{\"formatVersion\":1,\"releaseId\":\"$RELEASE_ID\",\"sourceCommit\":\"$SOURCE_COMMIT\"}" \
  > "$STAGING_DIRECTORY/release-manifest.json"

SERVICES_STOPPED=true
stop_production_units
hold_scheduled_delivery

MIGRATION_ATTEMPTED=true
(
  cd "$STAGING_DIRECTORY"
  npm run db:migrate
)

chown -R "$RELEASE_OWNER:$RELEASE_GROUP" "$STAGING_DIRECTORY"
chmod -R g+rX,o-rwx "$STAGING_DIRECTORY"
mv "$STAGING_DIRECTORY" "$RELEASE_DIRECTORY"
ln -s "$RELEASE_DIRECTORY" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT_LINK"
RELEASE_ACTIVATED=true

for unit in \
  daily-web.service \
  daily-scheduled-worker.service \
  daily-scheduled-worker.timer \
  daily-backup.service \
  daily-backup.timer
do
  install -m 0644 "$RELEASE_DIRECTORY/deploy/systemd/$unit" "$SYSTEMD_DIRECTORY/$unit"
done

systemctl daemon-reload
start_web_and_backup_units

readiness_response=$(curl --fail --silent --show-error "$READINESS_URL")
[ "$readiness_response" = '{"status":"ok"}' ] || fail 'readiness endpoint returned an unexpected response.'

trap - EXIT HUP INT TERM
printf '%s\n' "Daily deployment succeeded: $RELEASE_ID (pre-migration recovery point: $PRE_MIGRATION_RECOVERY_POINT)"
