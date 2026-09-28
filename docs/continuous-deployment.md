# Continuous deployment on homelab

Daily uses a short maintenance window for SQLite migrations. GitHub builds and tests
the image; a host-side systemd timer checks for a new release every five minutes.
Coolify still owns the application container, proxy route, and mail schedule. The
timer only coordinates deployments; it is not another mail scheduler.

This pull model does not give GitHub Actions SSH access, a Coolify token, or access
to the private Tailscale network. It requires a Coolify API token stored on homelab.
It replaces the previously proposed GitHub-to-Tailscale deployment trigger.

## Release flow

1. Both existing CI jobs must pass for a push to `main`.
2. The publishing job builds and runs the container acceptance test again. That
   tested image receives source and revision labels and a unique
   `sha-<commit>-<run>-<attempt>` tag in `ghcr.io/poppyseedcake/daily`.
3. If the commit is still the current `main` head, the job updates the `cd` channel.
   Pull requests cannot publish. Existing workflow concurrency serializes main runs.
4. The host pulls `cd` while the old application is still serving requests. The
   channel is only discovery: deployment pins the resolved SHA-256 digest in Coolify.
   The publication-side head check is best effort: a push can arrive between that
   check and the registry update. Before changing tasks, the host independently
   compares the image revision with the current GitHub `main` ref. A stale channel
   is skipped; an unavailable or rate-limited GitHub API blocks maintenance.
5. If the running image already matches, the host exits without changing anything.
6. The host records a maintenance journal, disables all Daily scheduled tasks, and
   waits for active executions and the mail worker to finish. A full quiet minute
   allows an already-started scheduler tick to settle. The web app remains online
   during this wait.
   Immediately before stopping web, the host checks `main` again. If it advanced
   while draining, the old web stays running and the original task states are
   restored. This final check freezes release selection for this deployment;
   pushes arriving afterward are handled by a later timer run, without interrupting
   an already-started migration.
7. The host synchronously stops the web container, checks for other containers with
   write access to the database directory, and makes a verified pre-migration backup
   using the current image. It requires a newly finalized recovery point.
8. It runs migration from the candidate digest with no network or provider secrets.
9. It updates the image digest through the Coolify API and waits for that deployment
   to finish. It checks the actual running image, mounts, user, Docker health, local
   `/health`, production configuration, and public HTTPS `/health`.
10. By default, schedules stay disabled for operator acceptance. The installation
    wizard offers an explicit opt-in to restore previously enabled schedules after
    automated acceptance. It never enables a schedule that was previously disabled.

The automated path disables the scheduler without changing the persisted
`SCHEDULED_DELIVERY_ENABLED` value. Offline migration containers explicitly receive
`false`. This avoids a second web deployment merely to restore an environment value.
Do not run tasks manually during maintenance. Automated acceptance verifies service
readiness, not a real Google login or email delivery; it sends no test email.

## Install and activate

Review and merge the repository changes first. The publishing job uses the standard
`GITHUB_TOKEN` with `packages: write`; no repository secrets are required. For an
existing GHCR package, grant this repository Actions write access in the package
settings if it does not already inherit access. A public Git repository does not
automatically make its package public. Keep the package readable by the host: make
it public deliberately, or configure a separate read-only registry credential in
`/etc/daily-cd/docker` on homelab. The service uses that `DOCKER_CONFIG` path because
`ProtectHome=true` hides `/root/.docker`. After the installer creates the directory,
use another host terminal to run:

```sh
sudo docker --config /etc/daily-cd/docker login ghcr.io
```

Enter a token with `read:packages` at the hidden password prompt. Do not put it in
command arguments, chat, Git, or the image. Coolify's own image-pull credentials are
separate and must also retain access to a private package. The installer verifies
its host-side credentials by pulling and validating `cd` before enabling the timer;
wait for the first successful main publication before that check.

On **homelab**, from a checkout containing these changes:

```sh
sudo bash scripts/setup-daily-cd.sh
```

The wizard checks the hostname, asks for a Coolify API token, installs the files,
runs a read-only preflight, and asks before enabling the timer. It opens console URLs
when a browser is available; on a headless host, open the printed URLs on your workstation.
Never paste the token into chat or commit it.

Create the token in the team owning Daily, with `read`, `write`, and `deploy`.
Sensitive permissions and `root` are not needed. Enable API access in Coolify
Settings if required. The token is team-scoped, not restricted to Daily; protect it
as an administrative credential. If an API allowlist is configured, allow the actual
host request source rather than opening API access publicly.

Installed files:

| File | Purpose |
| --- | --- |
| `/usr/local/lib/daily-cd/coolify_cd.py` | Reviewed host deployment code |
| `/etc/daily-cd/config.json` | Application/task identifiers and paths |
| `/etc/daily-cd/token` | Root-only Coolify API token |
| `/etc/daily-cd/setup.env` | Root-only wizard state containing the same token |
| `/etc/daily-cd/docker/config.json` | Optional root-only GHCR pull credential |
| `/etc/systemd/system/daily-cd.service` | One deployment attempt |
| `/etc/systemd/system/daily-cd.timer` | Five-minute polling |
| `/var/lib/daily-cd/maintenance.json` | In-progress or failed deployment journal |
| `/var/lib/daily-cd/last-success.json` | Last accepted image and recovery point |
| `/var/lib/daily-cd/last-skipped.json` | Release superseded while draining; no database change |

The example config contains the identifiers observed on 2026-09-28. Preflight checks
the image application, non-rolling mode, empty hooks, task, mounted paths, container
identity, health, and absence of active Coolify deployments. It fails closed if the
expected consistent container name does not match the host. Adjust config to the
observed host state; do not rename a running container to make the check pass.

The host script uses only Python's standard library and Docker. Its Coolify API
contracts and digest tag encoding were checked against upstream **v4.3.23** source.
Run preflight after Coolify upgrades; it cannot prove every mutation endpoint before
a controlled end-to-end release.

```sh
sudo python3 /usr/local/lib/daily-cd/coolify_cd.py --check
sudo python3 /usr/local/lib/daily-cd/coolify_cd.py --check-registry
sudo systemctl status daily-cd.timer
sudo journalctl -u daily-cd.service -n 80 --no-pager
```

`--check` does not pull images, deploy, stop containers, or change tasks. It writes
only local lock/state-directory housekeeping. `--check-registry` additionally pulls
and validates the image using the same Docker configuration path as the service;
it does not deploy or change tasks. The first `cd` image may contain the
same application source as the manually deployed image but have a different image
ID because of release labels; this is still a real first automated deployment.

## Failure and manual recovery

A failed or interrupted deployment retains `maintenance.json`. Every later timer
run refuses to deploy until an operator resolves it. The script never automatically
rolls code back across a potentially changed schema and never silently retries a
migration. Scheduled tasks remain disabled; inspect them if the API was unavailable
during failure handling. If failure happens after starting the candidate, that web
container can still be running and requires inspection. Do not assume a failed CD
means that all containers have stopped.

1. Stop **the timer only** and let any active service finish. Do not interrupt an
   active migration or backup:

   ```sh
   sudo systemctl stop daily-cd.timer
   sudo systemctl status daily-cd.service
   sudo cat /var/lib/daily-cd/maintenance.json
   ```

2. Inspect the recorded phase, Coolify deployment queue, scheduled task state, and
   Docker containers. A timeout can leave an offline container named
   `<application-container>-cd-operation`; confirm it is stopped before recovery.
   A queued Coolify deployment must be cancelled or allowed to settle before a
   rollback. Avoid simultaneous manual deployment and CD.
3. If migration has started, use the coordinated image/database restore procedure
   in [the Coolify deployment guide](coolify-deployment.md#9-offline-restore-in-a-container).
   The journal records the old image ID, old tag, candidate digest, and recovery path.
   Preserve the old image and recovery point. A stopped old container normally also
   prevents its image from being pruned during migration.
4. Verify the recovered application and restore task states deliberately. If the
   `cd` channel still points at a rejected candidate, leave the timer stopped until
   CI publishes a corrected release. Do not clear the journal and immediately retry
   the rejected image.
5. Archive the resolved journal, then enable the timer again when the next candidate
   and the current database state are understood.

Only one operator/controller may change this application during deployment. The
local file lock serializes this script, but cannot lock out an administrator using
Coolify or a separate host process writing SQLite. Manual maintenance requires
stopping the timer and waiting for the service to finish first.

## Backups and operational limits

The pre-migration backup is local. It does not prove that Restic uploaded it to B2.
Keep the existing SQLite-aware backup/Restic procedure and verify offsite freshness
separately. Add `/etc/daily-cd`, `/usr/local/lib/daily-cd`, and `/var/lib/daily-cd` to
the encrypted host backup sources. These include credentials and must stay private.

The timer intentionally does not prune Docker images or remove recovery points.
Monitor `/srv/docker` space and retain the previous accepted image for rollback.
Service errors are visible in journald; external failure notifications are not
configured by this change. Automated releases take up to about five minutes to be
noticed, plus pull/drain/deployment time. Measure downtime on the first controlled
release rather than promising a fixed duration.

## Validation

```sh
python3 -m unittest discover -s scripts -p 'test_coolify_cd.py'
bash -n scripts/setup-daily-cd.sh
```

Tests exercise failure boundaries, candidate identity, persistent retry blocking,
backup freshness, no-op releases, and schedule restoration without production access.
Host installation, API writes, GHCR publication, and an end-to-end deployment still
need to be verified on homelab after operator setup.

References:

- [Coolify v4.3.23 API schema](https://github.com/coollabsio/coolify/blob/v4.3.23/openapi.yaml)
- [Coolify image digest handling](https://github.com/coollabsio/coolify/blob/v4.3.23/app/Jobs/ApplicationDeploymentJob.php)
- [Coolify API permissions](https://coolify.io/docs/api/permissions)
- [Scheduled task lifecycle](https://coolify.io/docs/core/automation/scheduled-tasks/manage-tasks)
