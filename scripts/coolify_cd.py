#!/usr/bin/env python3
"""Run on the homelab host. Pull a tested release and deploy through Coolify.

No third-party Python packages. Never import application secrets or print API bodies.
"""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request


class DeploymentError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def command(*args, timeout=120):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise DeploymentError(f"{args[0]} failed or timed out; inspect host state.") from None
    require(result.returncode == 0, f"{args[0]} failed; output withheld to protect secrets.")
    return result.stdout


class Coolify:
    def __init__(self, url, token):
        self.url = url.rstrip('/') + '/api/v1'
        self.token = token

    def call(self, path, method='GET', payload=None):
        request = urllib.request.Request(
            self.url + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise DeploymentError(f"Coolify {method} {path}: HTTP {error.code}.") from None
        except (OSError, ValueError):
            raise DeploymentError(f"Coolify {method} {path}: unavailable or invalid response.") from None


def inspect_container(container):
    return json.loads(command('docker', 'inspect', container))[0]


def data_writers(data_path):
    ids = command('docker', 'ps', '-q').split()
    if not ids:
        return []
    containers = json.loads(command('docker', 'inspect', *ids))
    return [c for c in containers if any(
        m.get('RW') and os.path.realpath(m.get('Source', '')) == os.path.realpath(data_path)
        for m in c.get('Mounts', [])
    )]


def verify_container(container, config, image_id=None):
    require(container['State']['Running'], 'Daily is not running.')
    require(container['Name'].lstrip('/') == config['container'], 'Unexpected Daily container name.')
    require(container['Config']['User'] == '10001:10001', 'Unexpected container user.')
    for source, target in [(config['data'], '/var/lib/daily'), (config['backups'], '/var/backups/daily')]:
        require(any(m.get('Source') == source and m.get('Destination') == target and m.get('RW')
                    for m in container['Mounts']), f'Missing mount at {target}.')
    require(not container['HostConfig'].get('PortBindings'), 'Unexpected published application port.')
    require(container['State'].get('Health', {}).get('Status') == 'healthy', 'Docker health is not healthy.')
    if image_id:
        require(container['Image'] == image_id, 'Running image differs from candidate digest.')


class Deployment:
    def __init__(self, config, api, state_dir):
        self.config = config
        self.api = api
        self.state_dir = Path(state_dir)
        self.journal = self.state_dir / 'maintenance.json'
        self.app_path = '/applications/' + config['application_uuid']
        self.record = {}

    def mark(self, phase, **values):
        self.record.update(values, phase=phase)
        temporary = self.journal.with_suffix('.tmp')
        with temporary.open('w') as stream:
            json.dump(self.record, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(self.journal)
        # Persist the latch directory entry as well as its contents before mutations.
        descriptor = os.open(self.state_dir, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        print('Daily CD: ' + phase, flush=True)

    def tasks(self):
        tasks = self.api.call(self.app_path + '/scheduled-tasks')
        require(isinstance(tasks, list), 'Unexpected scheduled task response.')
        return tasks

    def set_task(self, uuid, enabled):
        result = self.api.call(self.app_path + '/scheduled-tasks/' + uuid, 'PATCH', {'enabled': enabled})
        require(result.get('enabled') is enabled, 'Task state change was not confirmed.')

    def preflight(self):
        require(not self.journal.exists(), 'Unfinished deployment: inspect maintenance.json before recovery.')
        app = self.api.call(self.app_path)
        require(app.get('build_pack') == 'dockerimage', 'Expected a Docker Image application.')
        require(app.get('docker_registry_image_name') == self.config['image'], 'Unexpected image repository.')
        require(not app.get('pre_deployment_command') and not app.get('post_deployment_command'),
                'Deployment hooks must be empty.')
        settings = app.get('settings') or {}
        require(settings.get('is_consistent_container_name_enabled') is True,
                'Consistent container name / no rolling updates must be enabled.')
        active = self.api.call('/deployments')
        require(isinstance(active, (list, dict)), 'Unexpected active deployment response.')
        require(not active, 'A Coolify deployment is already queued or running; retry later.')
        container = inspect_container(self.config['container'])
        verify_container(container, self.config)
        writers = data_writers(self.config['data'])
        require(len(writers) == 1 and writers[0]['Id'] == container['Id'], 'Unexpected database writer.')
        tasks = self.tasks()
        require(any(t['uuid'] == self.config['delivery_task_uuid'] for t in tasks), 'Delivery task missing.')
        require(all(isinstance(t.get('enabled'), bool) for t in tasks), 'Unexpected task enabled value.')
        require(all(60 <= int(t.get('timeout') or 300) <= 1800 for t in tasks),
                'Task timeout must fit the CD service budget (60–1800 seconds).')
        command('docker', 'exec', self.config['container'], 'node',
                'scripts/validate-production-environment.mjs', '--context=web')
        return app, container, tasks

    def candidate(self):
        channel = self.config['image'] + ':cd'
        command('docker', 'pull', channel, timeout=600)
        image = json.loads(command('docker', 'image', 'inspect', channel))[0]
        labels = image['Config'].get('Labels') or {}
        revision = labels.get('org.opencontainers.image.revision', '')
        require(re.fullmatch(r'[0-9a-f]{40}', revision), 'Candidate has no valid revision label.')
        require(labels.get('org.opencontainers.image.source') == 'https://github.com/poppyseedcake/daily',
                'Unexpected candidate source.')
        digests = [d for d in image.get('RepoDigests', []) if d.startswith(self.config['image'] + '@sha256:')]
        require(len(digests) == 1, 'Candidate digest is ambiguous.')
        require(re.fullmatch(r'.+@sha256:[0-9a-f]{64}', digests[0]), 'Invalid candidate digest.')
        return image['Id'], digests[0], revision

    def main_revision(self):
        request = urllib.request.Request(
            'https://api.github.com/repos/poppyseedcake/daily/git/ref/heads/main',
            headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'daily-cd',
                     'Cache-Control': 'no-cache'},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                revision = json.load(response)['object']['sha']
        except (OSError, ValueError, KeyError, TypeError):
            raise DeploymentError('Cannot verify current main revision; refusing deployment.') from None
        require(isinstance(revision, str) and re.fullmatch(r'[0-9a-f]{40}', revision),
                'GitHub returned an invalid main revision.')
        return revision

    def drain(self, tasks):
        # Keep serving the old web app while draining. A scheduler tick already in
        # flight can enqueue a job after disable; require a full quiet minute too.
        deadline = time.monotonic() + max([int(t.get('timeout') or 300) for t in tasks] + [300]) + 120
        quiet_since = None
        while time.monotonic() < deadline:
            running = False
            for task in tasks:
                executions = self.api.call(self.app_path + '/scheduled-tasks/' + task['uuid'] + '/executions')
                require(isinstance(executions, list), 'Unexpected task execution response.')
                require(all(e.get('status') in ('success', 'failed', 'running') for e in executions),
                        'Unknown execution status; refusing to stop an active worker.')
                running |= any(e['status'] == 'running' for e in executions)
            # Docker uses PID to select the container's rows from host ps output.
            processes = command('docker', 'top', self.config['container'], '-eo', 'pid,args')
            running |= 'runScheduledDailySummaryWorkerCommand' in processes
            if running:
                quiet_since = None
            elif quiet_since is None:
                quiet_since = time.monotonic()
            elif time.monotonic() - quiet_since >= 65:
                return
            time.sleep(5)
        raise DeploymentError('Tasks did not drain; old web remains running and tasks remain disabled.')

    def offline(self, image, script, *args):
        require(not data_writers(self.config['data']), 'A container still writes to the database.')
        # Do not copy runtime env: offline commands need no provider credentials.
        return command('docker', 'run', '--rm', '--name', self.config['container'] + '-cd-operation',
                       '--network', 'none',
                       '--mount', f"type=bind,src={self.config['data']},dst=/var/lib/daily",
                       '--mount', f"type=bind,src={self.config['backups']},dst=/var/backups/daily",
                       '-e', 'DATABASE_URL=/var/lib/daily/daily.db',
                       '-e', 'BACKUP_DIRECTORY=/var/backups/daily',
                       '-e', 'BACKUP_RETENTION_DAYS=30',
                       '-e', 'MIGRATIONS_DIRECTORY=/app/drizzle',
                       '-e', 'SCHEDULED_DELIVERY_ENABLED=false',
                       image, 'node', 'build/worker/' + script, *args, timeout=600)

    def backup_points(self):
        return {str(p) for p in Path(self.config['backups']).glob('pre-migration-*')
                if (p / 'backup.sqlite3').is_file() and (p / 'metadata.json').is_file()}

    def wait_deployment(self, uuid):
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            status = self.api.call('/deployments/' + uuid).get('status')
            if status == 'finished':
                return
            require(status in ('queued', 'in_progress'), 'Coolify deployment failed or has unknown status.')
            time.sleep(5)
        raise DeploymentError('Coolify deployment timed out; inspect its queue before recovery.')

    def acceptance(self, image_id):
        deadline = time.monotonic() + 180
        public_failure = None
        public_request = urllib.request.Request(
            self.config['health_url'], headers={'User-Agent': 'daily-cd', 'Accept': 'application/json'},
        )
        while time.monotonic() < deadline:
            container = inspect_container(self.config['container'])
            if container['State'].get('Health', {}).get('Status') == 'healthy':
                verify_container(container, self.config, image_id)
                command('docker', 'exec', self.config['container'], 'node', 'scripts/container-healthcheck.mjs')
                command('docker', 'exec', self.config['container'], 'node',
                        'scripts/validate-production-environment.mjs', '--context=web')
                try:
                    with urllib.request.urlopen(public_request, timeout=15) as response:
                        if response.status == 200:
                            if json.load(response) == {'status': 'ok'}:
                                return
                            public_failure = 'unexpected response'
                        else:
                            public_failure = f'HTTP {response.status}'
                except urllib.error.HTTPError as error:
                    public_failure = f'HTTP {error.code}'
                except OSError:
                    # The proxy can briefly return 502 or refuse connections while
                    # routing switches to the healthy replacement container.
                    public_failure = 'connection error'
                except ValueError:
                    public_failure = 'invalid JSON'
            time.sleep(5)
        if public_failure:
            raise DeploymentError(f'Public readiness check failed within 180 seconds ({public_failure}).')
        raise DeploymentError('Candidate did not become Docker-healthy within 180 seconds.')

    def run(self, resume_delivery=False):
        self.preflight()
        image_id, digest, revision = self.candidate()
        # Pulling can take several minutes. Re-read task/configuration state before
        # deciding which schedules to restore or which image to back up.
        app, current, tasks = self.preflight()
        if current['Image'] == image_id:
            print('Daily CD: current image is already deployed.')
            return
        if self.main_revision() != revision:
            print('Daily CD: channel revision is behind main; waiting for its tested image.')
            return
        # Pull and validate the image before beginning maintenance.
        require(Path(self.config['data'], 'daily.db').is_file(), 'Existing database is required.')
        self.record = {'previous_image_id': current['Image'], 'previous_tag': app['docker_registry_image_tag'],
                       'candidate_digest': digest, 'revision': revision,
                       'enabled_tasks': [t['uuid'] for t in tasks if t['enabled']],
                       'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        self.mark('disable-tasks')
        # No automatic rollback: once migration starts the old schema is not assumed compatible.
        for task in tasks:
            self.set_task(task['uuid'], False)
        self.mark('drain-tasks')
        self.drain(tasks)
        # Freeze release selection immediately before stopping web. Later pushes are
        # handled on the next run; never abandon a migration already in progress.
        if self.main_revision() != revision:
            self.mark('superseded-before-stop')
            for uuid in self.record['enabled_tasks']:
                self.set_task(uuid, True)
            self.journal.replace(self.state_dir / 'last-skipped.json')
            print('Daily CD: main advanced during drain; old web and schedules retained.')
            return
        self.mark('stop-web')
        # Synchronous Docker stop avoids an asynchronous Coolify stop racing a later deploy.
        command('docker', 'stop', '--time', '60', self.config['container'])
        require(not data_writers(self.config['data']), 'Database writers remain after stopping web.')
        self.mark('backup')
        before = self.backup_points()
        self.offline(current['Image'], 'runSqliteBackupCommand.js', 'pre-migration')
        created = self.backup_points() - before
        require(len(created) == 1, 'Backup did not create exactly one finalized recovery point.')
        self.mark('migrate', recovery_point=created.pop())
        self.offline(digest, 'runSqliteMigrateCommand.js')
        self.mark('configure-image')
        # Coolify 4.3.23 interprets sha256-<digest> as image@sha256:<digest>.
        tag = 'sha256-' + digest.split('@sha256:')[1]
        self.api.call(self.app_path, 'PATCH', {'docker_registry_image_tag': tag})
        require(self.api.call(self.app_path).get('docker_registry_image_tag') == tag,
                'Coolify did not retain the candidate digest.')
        self.mark('deploy')
        result = self.api.call('/deploy', 'POST', {'uuid': self.config['application_uuid']})
        deployments = result.get('deployments', [])
        require(len(deployments) == 1, 'Unexpected deployment response; inspect Coolify queue.')
        uuid = deployments[0]['deployment_uuid']
        self.mark('wait-deployment', deployment_uuid=uuid)
        self.wait_deployment(uuid)
        self.mark('acceptance')
        self.acceptance(image_id)
        if resume_delivery:
            self.mark('resume-tasks')
            if self.config['delivery_task_uuid'] in self.record['enabled_tasks']:
                command('docker', 'exec', self.config['container'], 'node',
                        'scripts/validate-production-environment.mjs', '--context=worker')
            for uuid in self.record['enabled_tasks']:
                self.set_task(uuid, True)
        self.mark('complete', delivery_resumed=resume_delivery)
        self.journal.replace(self.state_dir / 'last-success.json')
        print(f'Daily CD: deployed {revision} ({digest}).')
        if not resume_delivery:
            print('Daily CD: scheduled tasks remain disabled pending operator acceptance.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/daily-cd/config.json')
    checks = parser.add_mutually_exclusive_group()
    checks.add_argument('--check', action='store_true', help='Read-only configuration preflight; do not pull/deploy.')
    checks.add_argument('--check-registry', action='store_true',
                        help='Preflight and pull/validate the cd image; do not change the application.')
    parser.add_argument('--resume-delivery', action='store_true',
                        help='Restore previously enabled tasks after automated acceptance (operator opt-in).')
    args = parser.parse_args()
    os.umask(0o077)
    os.environ.setdefault('DOCKER_CONFIG', '/etc/daily-cd/docker')
    config = json.loads(Path(args.config).read_text())
    state = Path(config.get('state_directory', '/var/lib/daily-cd'))
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Daily CD: another local deployment is running.')
            return
        token = Path(config['token_file']).read_text().strip()
        require(bool(token), 'Coolify API token is empty.')
        deployment = Deployment(config, Coolify(config['coolify_url'], token), state)
        if args.check or args.check_registry:
            deployment.preflight()
            if args.check_registry:
                deployment.candidate()
                print('Daily CD: registry pull and image identity checks passed.')
            print('Daily CD: preflight passed; no application changes made.')
        else:
            try:
                deployment.run(args.resume_delivery)
            except Exception:
                # This also covers failure while restoring several task schedules.
                # Keep the journal as a persistent latch; a timer must not retry a migration.
                if deployment.journal.exists():
                    for uuid in deployment.record.get('enabled_tasks', []):
                        try:
                            deployment.set_task(uuid, False)
                        except Exception:
                            print('Daily CD: could not disable a task; inspect Coolify immediately.', file=sys.stderr)
                raise


if __name__ == '__main__':
    try:
        main()
    except (DeploymentError, OSError, ValueError, KeyError, TypeError):
        # Do not include arbitrary API/provider response content in journal logs.
        error = sys.exc_info()[1]
        print('Daily CD: ' + (str(error) if isinstance(error, DeploymentError)
                              else 'Unexpected response or host error; inspect maintenance.json.'), file=sys.stderr)
        sys.exit(1)
