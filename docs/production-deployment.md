# Deploy Daily to production

Daily uses one production topology: Node.js 22.15.0 and npm 10.9.2 on one VPS.
The web process and scheduled jobs run under systemd. Run deployment as root from a
trusted source checkout.

The release identifier must be the full Git commit SHA. The deployment command rejects
a dirty checkout or a release identifier that does not match HEAD. Each release is
stored in its own directory and contains release-manifest.json. The previous release
directory stays in place for rollback.

## Production prerequisites

Create the dedicated, unprivileged daily account and the directory layout described in
docs/systemd-web-service.md before the first deployment:

- /srv/daily/releases contains root-owned, daily-group-readable release directories;
- /srv/daily/current is the active-release symlink;
- /var/lib/daily/daily.db is persistent application data owned by daily;
- /var/backups/daily is persistent backup storage owned by daily;
- /etc/daily/daily.env is root:daily mode 0640 and contains production values.

Keep release code, the database, recovery points, and the environment file separate.
Install the exact supported Node.js and npm versions from docs/supported-runtime.md.
Configure at least DATABASE_URL=/var/lib/daily/daily.db,
BACKUP_DIRECTORY=/var/backups/daily, and every value in
deploy/systemd/daily.env.example. Do not place secrets in a release checkout.

## Prepare one immutable candidate

Run the checks from the exact commit that will be deployed. Do not change the checkout
after these checks:

~~~
cd /path/to/daily-source
git status --short
RELEASE_SHA="$(git rev-parse HEAD)"
npm ci
npm run check
npm run test
npm run build
DAILY_RELEASE_SHA="$RELEASE_SHA" npm run verify:email-client-kit
~~~

The email-client kit must pass for the same candidate. Use its five fixtures and its
real Test Delivery evidence procedure. Do not use a local HTML preview as proof of
delivery.

## Deploy a release

Load the production environment and run the one ordered deployment command:

~~~
set -a
. /etc/daily/daily.env
set +a
PREVIOUS_RELEASE="$(readlink -f /srv/daily/current)"
RELEASE_SHA="$(git -C /path/to/daily-source rev-parse HEAD)"
sudo --preserve-env=DATABASE_URL,BACKUP_DIRECTORY,READINESS_URL \
  npm run deploy:production -- /path/to/daily-source "$RELEASE_SHA"
~~~

The command exits non-zero on any failed step:

1. It copies the clean source into a private staging release, removes copied build and
   dependency state, installs package-lock.json with npm ci, and builds the web and
   worker output before touching the active release.
2. It runs the verified pre-migration SQLite backup. The backup command checks SQLite
   integrity and the final checksum. Deployment also requires a new finalized recovery
   point containing backup.sqlite3 and metadata.json.
3. It stops the Scheduled Delivery timer, the worker, the Backup timer, and the Web
   service. It then runs npm run db:migrate exactly once from the candidate.
4. It restricts the candidate permissions, writes its release manifest, atomically
   switches /srv/daily/current, and installs the candidate systemd units.
5. It enables and starts only the Web service and the Backup timer. It disables the
   Scheduled Delivery timer and verifies that both the timer and worker are inactive.
6. It requires the Web service and Backup timer to be active, then requires the local
   readiness endpoint to return exactly {"status":"ok"}.

Scheduled Delivery remains stopped through migration, Web startup, Preview, and the
controlled Test Delivery smoke verification. Starting the Web service or the Backup
timer does not start Scheduled Delivery.

The release contains one production Daily Summary generation path and one TypeScript
renderer. Do not add a long-lived Daily Grid feature flag or keep a legacy renderer in
parallel with the released path.

The command reports the pre-migration recovery-point path on success. Record that path,
the candidate SHA, the package-lock checksum, and the command output with the release
evidence.

## Smoke verification before Scheduled Delivery

Keep daily-scheduled-worker.timer disabled until all checks below pass:

1. Check daily-web.service, the readiness endpoint, and the Web journal.
2. Use a dedicated verification User to open Preview. Confirm all four Summary Sections
   remain present in Weather, Commute, Calendar, Todo order.
3. Use the signed-in User Test Delivery action. Confirm the intended Summary Recipient,
   the test subject, one sent Test Delivery Record, complete HTML, complete plain text,
   and no duplicate provider submission.
4. Check the immutable email-client matrix. A missing, duplicated, or reordered section,
   a structural failure, lost HTML/plain-text meaning, clipping, or a broken Open Daily
   link is a release failure.
5. In a controlled maintenance window, run one genuine Scheduled Delivery for the
   dedicated verification User with the timer still disabled:

~~~
sudo systemctl start daily-scheduled-worker.service
sudo systemctl status daily-scheduled-worker.service
sudo systemctl is-inactive --quiet daily-scheduled-worker.timer
~~~

Confirm the Summary Recipient, one Scheduled Delivery Record, the expected occurrence
identity, and the expected provider idempotency result. Start the worker service a
second time only as an idempotency check; it must not create a duplicate message.

After the controlled delivery passes, enable general Scheduled Delivery:

~~~
sudo systemctl enable --now daily-scheduled-worker.timer
sudo systemctl is-active --quiet daily-scheduled-worker.timer
~~~

Observe the first 24 hours. The Scheduled Delivery timer is the control to stop when a
release fails after deployment.

## Failure and rollback rules

Build, backup, migration, unit installation, service-state, readiness, Preview,
Test Delivery, or email-client failure is a failed release. Inspect systemctl status
and journalctl as described in docs/systemd-web-service.md. Do not promote or report
a failed release as healthy.

The following failures require an immediate stop and a coordinated rollback:

- duplicate or wrong-recipient delivery;
- a missing, duplicated, reordered, or structurally broken Summary Section;
- lost HTML/plain-text meaning or a broken untracked Open Daily link;
- corrupted Summary Configuration, Delivery Records, occurrence identity, or provider
  idempotency;
- a systematic failure that affects more than one User or Summary Section.

Stop Scheduled Delivery first and keep it stopped while collecting evidence:

~~~
sudo systemctl disable --now daily-scheduled-worker.timer
sudo systemctl stop daily-scheduled-worker.service
sudo systemctl status daily-scheduled-worker.timer daily-scheduled-worker.service
~~~

Do not retry a failed Test Delivery to a real Summary Recipient until the recipient,
record, and provider result are understood. Keep the candidate release, the previous
release, the recovery-point path, service status, journals, and email evidence.

### Code-only rollback during deployment

The deployment command can perform code-only rollback only when the operator explicitly
proves that the previous release supports the migrated schema. Set this value before
starting the deployment; it is not a standalone rollback command:

~~~
DAILY_PREVIOUS_RELEASE_SCHEMA_COMPATIBLE=true \
  npm run deploy:production -- /path/to/daily-source "$RELEASE_SHA"
~~~

This flag is an explicit operator assertion. It is not a compatibility test. A
compatibility-approved rollback restores the previous release and starts only Web and
Backup; Scheduled Delivery stays stopped.

Before deployment, record the retained previous release. For a code-only rollback after
the deployment has already stopped, use that recorded path in this sequence:

~~~
sudo systemctl disable --now daily-scheduled-worker.timer
sudo systemctl stop daily-scheduled-worker.service daily-backup.timer daily-web.service
sudo ln -s "$PREVIOUS_RELEASE" /srv/daily/current.rollback-$$
sudo mv -Tf /srv/daily/current.rollback-$$ /srv/daily/current
for unit in daily-web.service daily-scheduled-worker.service daily-scheduled-worker.timer daily-backup.service daily-backup.timer; do
  sudo install -m 0644 "$PREVIOUS_RELEASE/deploy/systemd/$unit" "/etc/systemd/system/$unit"
done
sudo systemctl daemon-reload
sudo systemctl enable --now daily-web.service daily-backup.timer
sudo systemctl disable --now daily-scheduled-worker.timer
sudo systemctl stop daily-scheduled-worker.service
sudo systemctl is-inactive --quiet daily-scheduled-worker.timer daily-scheduled-worker.service
sudo curl --fail --silent http://127.0.0.1:5174/health
~~~

Use this sequence only when the migrated database is known to support the previous
release. Otherwise use the coordinated code and database rollback below.

### Coordinated code and database rollback

If the previous release is not explicitly compatible, restore the previous release and
the pre-migration recovery point together. Do not switch only the application symlink.
Use the offline restore workflow in docs/sqlite-backups.md:

1. Disable the Scheduled Delivery timer and stop the worker, Backup timer, and Web
   service. Confirm the Web service is inactive and no SQLite -wal or -shm sidecars
   remain.
2. Atomically switch /srv/daily/current to the retained previous release and install
   that release's systemd unit files.
3. Run npm run db:restore -- /path/to/pre-migration-recovery-point from the retained
   release with DATABASE_URL, DAILY_SERVICE_NAME=daily-web.service, and the local
   READINESS_URL configured.
4. Require the offline restore checksum, SQLite integrity, migration, Web active-state,
   and readiness checks to pass. Keep the replaced database until recovery is accepted.
5. Start only the Backup timer. Repeat Preview and controlled Test Delivery. Keep
   Scheduled Delivery stopped until the recovery is verified.

The offline restore command preserves the replaced database. If restore or readiness
fails, stop Web and restore the preserved database or another verified recovery point.
Never edit a historical recovery point. A recovery point on the same VPS does not protect
against complete host or storage loss.

Transient provider failures can use the existing bounded retry rules after the cause is
understood. They do not permit a release with duplicate delivery, wrong recipients,
structural section failure, lost HTML/plain-text meaning, corrupted records, or a
systematic failure to remain active.

## Routine rollback after a successful cutover

For a later operational failure, use the same stop-first and coordinated rollback rules.
Keep the previous immutable release until the 24-hour observation window and all smoke
evidence are accepted. Do not delete a previous release or a recovery point as part of a
failed deployment.
