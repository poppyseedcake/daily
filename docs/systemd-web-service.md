# Operate Daily with systemd

The production web process runs as the dedicated, unprivileged `daily` account. Keep
replaceable release code in `/srv/daily`, persistent SQLite data in `/var/lib/daily`,
configuration in `/etc/daily/daily.env`, and recovery points in
`/var/backups/daily`. None of these locations may be nested inside another.

The service binds to loopback by default. Put the host's TLS reverse proxy in front
of it and keep port 5174 unavailable from the public network.

## Install

Run these steps as an operator with root privileges. Install the supported Node.js
version documented in `docs/supported-runtime.md` at `/usr/bin/node` first.

```sh
sudo useradd --system --home-dir /var/lib/daily --shell /usr/sbin/nologin daily
sudo install --directory --owner=root --group=daily --mode=0750 /srv/daily
sudo install --directory --owner=daily --group=daily --mode=0750 /var/lib/daily
sudo install --directory --owner=root --group=daily --mode=0750 /etc/daily
sudo install --directory --owner=daily --group=daily --mode=0750 /var/backups/daily
sudo install --owner=root --group=daily --mode=0640 deploy/systemd/daily.env.example /etc/daily/daily.env
sudo install --owner=root --group=root --mode=0644 deploy/systemd/daily-web.service /etc/systemd/system/daily-web.service
sudo install --owner=root --group=root --mode=0644 deploy/systemd/daily-scheduled-worker.service /etc/systemd/system/daily-scheduled-worker.service
sudo install --owner=root --group=root --mode=0644 deploy/systemd/daily-scheduled-worker.timer /etc/systemd/system/daily-scheduled-worker.timer
```

Install a successfully built release in a versioned, root-owned directory under
`/srv/daily/releases`. Make `/srv/daily/current` a symlink to that release. The
`daily` account needs read and traverse access to the release, but must not own it.
Edit `/etc/daily/daily.env`, fill every blank or placeholder, and keep its
`root:daily` ownership and `0640` mode. Generate independent random values of at
least 32 bytes for `BETTER_AUTH_SECRET` and `GOOGLE_MAPS_ATTRIBUTION_SECRET`; never
reuse a value from an example or another deployment. The service refuses to start
when either secret is missing, known to be a template value, or too short.

The application does not migrate its database on normal startup; apply every
migration explicitly as part of deployment. Readiness verifies a table introduced
by the latest migration, so a fresh or partially migrated SQLite database remains
unhealthy.

Ask systemd to validate the installed unit, reload it, and enable automatic startup:

```sh
sudo systemd-analyze verify /etc/systemd/system/daily-web.service /etc/systemd/system/daily-scheduled-worker.service /etc/systemd/system/daily-scheduled-worker.timer
sudo systemctl daemon-reload
sudo systemctl enable --now daily-web.service
sudo systemctl enable --now daily-scheduled-worker.timer
```

The restart policy retries unexpected failures after five seconds, but permits no
more than five starts in 60 seconds. A normal stop sends `SIGTERM` to Node and gives
it 30 seconds to finish before systemd escalates termination.

The timer starts `daily-scheduled-worker.service` once per minute. `Persistent=true`
makes systemd evaluate a recently missed activation shortly after a reboot. Because
the target is a single oneshot service, normal timer activation cannot start a
second invocation while that unit is still active. Application-level Delivery Record
idempotency remains authoritative if an operator starts the worker manually or an
abnormal duplicate invocation occurs.

The worker shares the web service's release directory, production environment file,
database configuration, unprivileged identity, and write restrictions. It is still
an independent unit: a non-zero worker exit leaves a failing worker result in systemd
without terminating the web service. The command's privacy-safe aggregate completion
output and exit status are available in the worker service journal.

## Inspect status and logs

```sh
sudo systemctl status daily-web.service
sudo journalctl -u daily-web.service --since today
sudo systemctl status daily-scheduled-worker.timer daily-scheduled-worker.service
sudo journalctl -u daily-scheduled-worker.service --since today
```

After changing `/etc/daily/daily.env` or switching `/srv/daily/current`, restart the
service explicitly and inspect its status:

```sh
sudo systemctl restart daily-web.service
sudo systemctl status daily-web.service
```

After switching `/srv/daily/current` or changing the environment, the next timer
activation uses the new release and configuration. To verify command wiring without
waiting for the timer, start the oneshot explicitly and inspect its result and safe
aggregate log output:

```sh
sudo systemctl start daily-scheduled-worker.service
sudo systemctl status daily-scheduled-worker.service
sudo journalctl -u daily-scheduled-worker.service -n 20
```

## Verify readiness

Run the privacy-safe readiness check locally after every start or deployment:

```sh
curl --fail --silent http://127.0.0.1:5174/health
```

The exact healthy response is `{"status":"ok"}`. A non-success status, another
payload, or a connection failure means the release is not ready. Inspect the unit
status and journal before exposing or accepting the release.

## Verify the hardening on staging

The unit makes the host read-only to the process except for `/var/lib/daily` and a
private temporary directory. `AF_UNIX`, `AF_INET`, and `AF_INET6` remain available
because Node, SQLite, DNS, the reverse proxy, and configured HTTPS providers require
them. Other address families and all Linux capabilities are unavailable.

After changing the unit or the host's systemd/Node versions, repeat these checks on
a staging VPS using the installed unit rather than running Node directly:

1. Start with no SQLite `-wal` or `-shm` sidecars, perform a normal persisted Local
   Setup write, and confirm the application can create and use its SQLite WAL files
   under `/var/lib/daily` while the readiness response stays healthy.
2. Exercise a workflow that creates a private temporary directory and confirm it
   completes without exposing that directory in the host-wide `/tmp` namespace.
   The online backup command is a suitable exercise when its own systemd unit is
   installed; the web unit intentionally cannot write to the backup directory.
3. Exercise each configured external-provider boundary needed by the deployment and
   confirm outbound DNS and HTTPS work. Keep provider payloads and credentials out
   of the journal while checking for privacy-safe success or failure events.
4. Confirm an attempted write as `daily` below `/srv/daily/current`, `/etc/daily`,
   and `/var/backups/daily` fails. The web process must only write application data
   below `/var/lib/daily` and its systemd-provided temporary directory.

Use `systemd-analyze security daily-web.service` as an additional review aid, not as
a substitute for these runtime checks. Record the staging result with the release;
do not promote a unit whose database, temporary-file, or provider checks fail.
