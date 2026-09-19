# ADR 0026: Deploy Daily to Coolify with one container and SQLite

Status: accepted

## Context

The home server runs Coolify and Traefik. Daily uses SQLite, a scheduled delivery
worker, and verified online backup and offline restore operations. The systemd
deployment remains supported for a VPS, but it cannot be the container control plane.
The application must keep SQLite files on persistent local storage and must not use
the Docker socket.

Coolify scheduled tasks run commands inside a running application container. A
deployment hook does not provide a safe database migration boundary: a pre-deployment
hook can run in the old container, and the old container can still be present while
the new container starts. Rolling updates can also overlap old and new containers.

## Decision

Use one immutable Daily image in one Coolify application:

- run one web process with `node build`;
- mount `/srv/daily/data` at `/var/lib/daily`;
- mount `/srv/daily/backups` at `/var/backups/daily`;
- keep the database, SQLite sidecars, and recovery points outside the image;
- run Scheduled Delivery once per minute with one Coolify scheduled task;
- keep Scheduled Delivery disabled by default and during maintenance;
- run migration, backup, and restore as explicit one-off commands from the same image;
- stop the application before migration or restore;
- keep rolling updates and deployment migration hooks disabled;
- use a local Docker health check and `/health` readiness check;
- run the image as UID/GID `10001:10001` without root privileges.

The image contains compiled commands for web, worker, migration, backup, and
container restore. The container restore command verifies a recovery point, preserves
the replaced database, installs the copy atomically, and runs migration. It does not
start a web process or call systemd.

## Consequences

This model has one web instance and one local SQLite writer set. It does not support
multi-server scaling or a database directory on NFS. A short maintenance outage is
required for migration and restore. A persistent volume is not an offsite backup.

The systemd model and the Coolify model share the SQLite command logic but use
different execution adapters. Operators must follow one model for a deployment; they
must not combine systemd units with Coolify containers.

## Rejected alternatives

- PostgreSQL, Redis, and a queue: not required for the single-server SQLite model.
- systemd inside the container: adds a second process supervisor and does not solve
  the Coolify deployment boundary.
- a Docker socket mount: gives the application control over the host and is not
  required for one-off Coolify tasks.
- migration on web or worker start: can race with the old version and hides a failed
  deployment step.
- a second scheduler in the container: Coolify is the one scheduler for Scheduled
  Delivery in this model.
