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

SOURCE_DIRECTORY=$(cd "$SOURCE_DIRECTORY" && pwd -P)
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

[ ! -e "$RELEASE_DIRECTORY" ] || fail 'release identifier already exists.'
mkdir -p "$RELEASES_DIRECTORY" "$SYSTEMD_DIRECTORY"

finish() {
  status=$?
  set +e
  if [ "$status" -ne 0 ] && [ "$RELEASE_ACTIVATED" = true ]; then
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
    else
      rm -f "$CURRENT_LINK"
      rm -f \
        "$SYSTEMD_DIRECTORY/daily-web.service" \
        "$SYSTEMD_DIRECTORY/daily-scheduled-worker.service" \
        "$SYSTEMD_DIRECTORY/daily-scheduled-worker.timer" \
        "$SYSTEMD_DIRECTORY/daily-backup.service" \
        "$SYSTEMD_DIRECTORY/daily-backup.timer"
    fi
    rm -rf "$RELEASE_DIRECTORY"
    systemctl daemon-reload
  fi
  if [ "$status" -ne 0 ] && [ "$SERVICES_STOPPED" = true ] && [ -n "$PREVIOUS_LINK_TARGET" ]; then
    systemctl restart daily-web.service daily-scheduled-worker.timer daily-backup.timer
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
(
  cd "$STAGING_DIRECTORY"
  npm run db:backup -- pre-migration
)

SERVICES_STOPPED=true
systemctl stop \
  daily-scheduled-worker.timer \
  daily-backup.timer \
  daily-scheduled-worker.service \
  daily-web.service

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
systemctl enable daily-web.service daily-scheduled-worker.timer daily-backup.timer
systemctl restart daily-web.service
systemctl restart daily-scheduled-worker.timer daily-backup.timer
systemctl is-active --quiet daily-web.service daily-scheduled-worker.timer daily-backup.timer

readiness_response=$(curl --fail --silent --show-error "$READINESS_URL")
[ "$readiness_response" = '{"status":"ok"}' ] || fail 'readiness endpoint returned an unexpected response.'

trap - EXIT HUP INT TERM
printf '%s\n' "Daily deployment succeeded: $RELEASE_ID"
