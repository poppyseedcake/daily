#!/usr/bin/env python3
"""Host deployment safety tests. No Docker, network, or production credentials."""
import json
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import coolify_cd as cd


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.tag = 'old'

    def call(self, path, method='GET', payload=None):
        self.calls.append((path, method, payload))
        if '/scheduled-tasks/' in path and method == 'PATCH':
            return payload
        if path == '/applications/app' and method == 'PATCH':
            self.tag = payload['docker_registry_image_tag']
            return {'uuid': 'app'}
        if path == '/applications/app':
            return {'docker_registry_image_tag': self.tag}
        if path == '/deploy':
            return {'deployments': [{'deployment_uuid': 'deployment'}]}
        if path == '/deployments/deployment':
            return {'status': 'finished'}
        raise AssertionError((path, method))


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / 'daily.db').touch()
        self.config = {'application_uuid': 'app', 'delivery_task_uuid': 'delivery',
                       'container': 'app', 'data': str(root), 'backups': str(root),
                       'image': 'ghcr.io/poppyseedcake/daily'}
        self.api = FakeAPI()
        self.job = cd.Deployment(self.config, self.api, root)
        self.tasks = [{'uuid': 'delivery', 'enabled': True, 'timeout': 900},
                      {'uuid': 'backup', 'enabled': False, 'timeout': 300}]
        self.preflight = patch.object(self.job, 'preflight', return_value=(
            {'docker_registry_image_tag': 'old'}, {'Image': 'old-image'}, self.tasks)).start()
        self.addCleanup(patch.stopall)
        patch.object(self.job, 'candidate', return_value=(
            'new-image', 'ghcr.io/poppyseedcake/daily@sha256:' + 'a' * 64, 'b' * 40)).start()
        self.main_revision = patch.object(self.job, 'main_revision', create=True, return_value='b' * 40).start()
        self.drain = patch.object(self.job, 'drain').start()
        self.offline = patch.object(self.job, 'offline').start()
        self.acceptance = patch.object(self.job, 'acceptance').start()
        self.command = patch.object(cd, 'command', return_value='').start()
        patch.object(cd, 'data_writers', return_value=[]).start()
        patch.object(self.job, 'backup_points', side_effect=[set(), {'recovery-point'}]).start()

    def test_success_pins_digest_and_only_restores_previously_enabled_tasks(self):
        self.job.run(resume_delivery=True)
        self.assertEqual(self.api.tag, 'sha256-' + 'a' * 64)
        self.assertEqual([c[0][1] for c in self.offline.call_args_list],
                         ['runSqliteBackupCommand.js', 'runSqliteMigrateCommand.js'])
        self.assertEqual(self.offline.call_args_list[0].args[0], 'old-image')
        self.assertTrue(self.offline.call_args_list[1].args[0].endswith('@sha256:' + 'a' * 64))
        enables = [(path, body) for path, method, body in self.api.calls
                   if method == 'PATCH' and body.get('enabled') is True]
        self.assertEqual(enables, [('/applications/app/scheduled-tasks/delivery', {'enabled': True})])
        self.assertFalse(self.job.journal.exists())
        result = json.loads((self.job.state_dir / 'last-success.json').read_text())
        self.assertEqual(result['recovery_point'], 'recovery-point')
        self.assertEqual(result['phase'], 'complete')

    def test_default_leaves_delivery_for_operator_acceptance(self):
        self.job.run()
        self.assertFalse(any(body and body.get('enabled') is True for _, _, body in self.api.calls))

    def test_unchanged_image_does_not_pause_or_deploy(self):
        self.job.candidate.return_value = ('old-image', 'unused', 'unused')
        self.job.run(True)
        self.assertFalse(self.job.journal.exists())
        self.assertEqual(self.api.calls, [])
        self.command.assert_not_called()

    def test_stale_channel_never_pauses_the_application(self):
        self.main_revision.return_value = 'c' * 40
        self.job.run(True)
        self.assertEqual(self.api.calls, [])
        self.command.assert_not_called()
        self.offline.assert_not_called()
        self.assertFalse(self.job.journal.exists())

    def test_main_advancing_during_drain_restores_tasks_without_stopping_web(self):
        self.main_revision.side_effect = ['b' * 40, 'c' * 40]
        self.job.run()
        self.command.assert_not_called()
        self.offline.assert_not_called()
        self.assertIn(('/applications/app/scheduled-tasks/delivery', 'PATCH', {'enabled': True}), self.api.calls)
        self.assertNotIn(('/applications/app/scheduled-tasks/backup', 'PATCH', {'enabled': True}), self.api.calls)
        self.assertFalse(self.job.journal.exists())

    def test_unavailable_main_does_not_start_maintenance(self):
        self.main_revision.side_effect = cd.DeploymentError('GitHub unavailable')
        with self.assertRaises(cd.DeploymentError):
            self.job.run(True)
        self.assertEqual(self.api.calls, [])
        self.assertFalse(self.job.journal.exists())

    def test_backup_failure_never_migrates_or_deploys(self):
        self.offline.side_effect = cd.DeploymentError('backup failed')
        with self.assertRaisesRegex(cd.DeploymentError, 'backup failed'):
            self.job.run(True)
        self.assertEqual(self.offline.call_count, 1)
        self.assertFalse(any(path == '/deploy' for path, _, _ in self.api.calls))
        self.assertEqual(json.loads(self.job.journal.read_text())['phase'], 'backup')

    def test_migration_failure_preserves_recovery_point_and_never_deploys(self):
        self.offline.side_effect = [None, cd.DeploymentError('migration failed')]
        with self.assertRaises(cd.DeploymentError):
            self.job.run(True)
        record = json.loads(self.job.journal.read_text())
        self.assertEqual(record['recovery_point'], 'recovery-point')
        self.assertEqual(record['previous_image_id'], 'old-image')
        self.assertFalse(any(path == '/deploy' for path, _, _ in self.api.calls))

    def test_old_backup_does_not_count_as_new_recovery_point(self):
        self.job.backup_points.side_effect = [{'old-point'}, {'old-point'}]
        with self.assertRaisesRegex(cd.DeploymentError, 'exactly one'):
            self.job.run(True)
        self.assertEqual(self.offline.call_count, 1)

    def test_unhealthy_candidate_does_not_resume_delivery(self):
        self.acceptance.side_effect = cd.DeploymentError('unhealthy')
        with self.assertRaises(cd.DeploymentError):
            self.job.run(True)
        self.assertTrue(self.job.journal.exists())
        self.assertFalse(any(body and body.get('enabled') is True for _, _, body in self.api.calls))

    def test_drain_failure_keeps_old_web_running(self):
        self.drain.side_effect = cd.DeploymentError('worker still active')
        with self.assertRaises(cd.DeploymentError):
            self.job.run(True)
        self.command.assert_not_called()
        self.offline.assert_not_called()

    def test_persistent_journal_blocks_automatic_retry_before_any_api_call(self):
        self.job.journal.write_text('{}')
        with self.assertRaisesRegex(cd.DeploymentError, 'Unfinished deployment'):
            cd.Deployment.preflight(self.job)
        self.assertEqual(self.api.calls, [])

    def test_unexpected_writer_blocks_backup_and_migration(self):
        with patch.object(cd, 'data_writers', return_value=[{'Id': 'unexpected'}]):
            with self.assertRaisesRegex(cd.DeploymentError, 'writers remain'):
                self.job.run(True)
        self.offline.assert_not_called()

    def test_failed_coolify_deployment_is_not_accepted(self):
        self.api.call = lambda *args, **kwargs: {'status': 'failed'}
        with self.assertRaisesRegex(cd.DeploymentError, 'deployment failed'):
            self.job.wait_deployment('deployment')

    def test_candidate_requires_expected_source_and_valid_digest(self):
        for source, digests in [('https://github.com/other/project', ['repo@sha256:' + 'a' * 64]),
                                ('https://github.com/poppyseedcake/daily', [])]:
            image = {'Id': 'image', 'Config': {'Labels': {
                'org.opencontainers.image.source': source,
                'org.opencontainers.image.revision': 'b' * 40}}, 'RepoDigests': digests}
            with patch.object(cd, 'command', side_effect=['', json.dumps([image])]):
                with self.assertRaises(cd.DeploymentError):
                    cd.Deployment.candidate(self.job)


class DrainTests(unittest.TestCase):
    def test_docker_top_includes_pid_and_args_and_waits_for_worker_then_quiet_period(self):
        with tempfile.TemporaryDirectory() as directory:
            job = cd.Deployment({'application_uuid': 'app', 'container': 'app'}, FakeAPI(), directory)
            clock = [0]
            calls = []

            def docker_top(*args):
                calls.append(args)
                # Docker needs PID to map host ps rows to container processes.
                if 'pid' not in args[-1].split(','):
                    raise cd.DeploymentError("Couldn't find PID field in ps output")
                self.assertIn('args', args[-1].split(','),
                              'Worker detection requires the command arguments column')
                if clock[0] < 10:
                    return 'PID COMMAND\n123 node build/worker/runScheduledDailySummaryWorkerCommand.js\n'
                return 'PID COMMAND\n122 node build\n'

            def sleep(seconds):
                clock[0] += seconds

            with patch.object(cd, 'command', side_effect=docker_top), \
                    patch.object(cd.time, 'monotonic', side_effect=lambda: clock[0]), \
                    patch.object(cd.time, 'sleep', side_effect=sleep):
                job.drain([])
            self.assertEqual(clock[0], 75)
            self.assertTrue(all(args[:4] == ('docker', 'top', 'app', '-eo') for args in calls))


class ReleaseIdentityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = {'application_uuid': 'app', 'container': 'app',
                       'image': 'ghcr.io/poppyseedcake/daily', 'data': '/srv/daily/data',
                       'backups': '/srv/daily/backups', 'health_url': 'https://dailykickoff.eu/health'}
        self.job = cd.Deployment(self.config, FakeAPI(), self.directory.name)
        self.digest = self.config['image'] + '@sha256:' + 'a' * 64
        self.image_id = 'sha256:' + 'd' * 64  # Config ID is different from registry manifest digest.
        self.image = {'Id': self.image_id, 'RepoDigests': [self.digest], 'Config': {'Labels': {
            'org.opencontainers.image.source': 'https://github.com/poppyseedcake/daily',
            'org.opencontainers.image.revision': 'b' * 40}}}
        self.container = {'Id': 'container-id', 'Name': '/app', 'Image': self.image_id,
                          'State': {'Running': True, 'Health': {'Status': 'healthy'}},
                          'Config': {'User': '10001:10001'}, 'HostConfig': {'PortBindings': {}},
                          'Mounts': [{'Source': '/srv/daily/data', 'Destination': '/var/lib/daily', 'RW': True},
                                     {'Source': '/srv/daily/backups', 'Destination': '/var/backups/daily', 'RW': True}]}

    def test_successful_candidate_is_accepted_using_config_id_not_manifest_digest(self):
        response = io.BytesIO(b'{"status":"ok"}')
        response.status = 200
        with patch.object(cd, 'command', side_effect=['', json.dumps([self.image]),
                                                    json.dumps([self.container]), '', '']) as docker:
            with patch.object(cd.urllib.request, 'urlopen', return_value=response):
                image_id, digest, revision = self.job.candidate()
                self.assertEqual((image_id, digest, revision), (self.image_id, self.digest, 'b' * 40))
                self.job.acceptance(image_id)
        self.assertEqual(docker.call_args_list[0].args, ('docker', 'pull', self.config['image'] + ':cd'))

    def test_healthy_wrong_image_is_rejected_before_public_health_check(self):
        self.container['Image'] = 'sha256:' + 'e' * 64
        with patch.object(cd, 'command', return_value=json.dumps([self.container])):
            with patch.object(cd.urllib.request, 'urlopen') as http:
                with self.assertRaisesRegex(cd.DeploymentError, 'Running image differs'):
                    self.job.acceptance(self.image_id)
                http.assert_not_called()

    def test_transient_public_proxy_error_is_retried_before_acceptance(self):
        response = io.BytesIO(b'{"status":"ok"}')
        response.status = 200
        clock = [0]
        with patch.object(cd, 'command', side_effect=lambda *args: json.dumps([self.container])
                          if args[:2] == ('docker', 'inspect') else ''), \
                patch.object(cd.urllib.request, 'urlopen', side_effect=[
                    cd.urllib.error.HTTPError(self.config['health_url'], 502, 'Bad Gateway', None, None),
                    response]) as http, \
                patch.object(cd.time, 'monotonic', side_effect=lambda: clock[0]), \
                patch.object(cd.time, 'sleep', side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)):
            self.job.acceptance(self.image_id)
        self.assertEqual(http.call_count, 2)
        self.assertEqual(clock[0], 5)

    def test_persistent_public_failure_never_accepts_candidate(self):
        clock = [0]
        with patch.object(cd, 'command', side_effect=lambda *args: json.dumps([self.container])
                          if args[:2] == ('docker', 'inspect') else ''), \
                patch.object(cd.urllib.request, 'urlopen', side_effect=OSError('proxy unavailable')) as http, \
                patch.object(cd.time, 'monotonic', side_effect=lambda: clock[0]), \
                patch.object(cd.time, 'sleep', side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)):
            with self.assertRaisesRegex(cd.DeploymentError, 'within 180 seconds'):
                self.job.acceptance(self.image_id)
        self.assertEqual(clock[0], 180)
        self.assertEqual(http.call_count, 36)


class ServiceConfigurationTests(unittest.TestCase):
    def test_private_registry_config_is_accessible_outside_protected_home(self):
        root = Path(__file__).resolve().parent.parent
        unit = (root / 'deploy/coolify/daily-cd.service').read_text()
        installer = (root / 'scripts/setup-daily-cd.sh').read_text()
        self.assertIn('ProtectHome=true', unit)
        self.assertIn('Environment=DOCKER_CONFIG=/etc/daily-cd/docker', unit)
        self.assertIn('export DOCKER_CONFIG=/etc/daily-cd/docker', installer)
        self.assertIn('install -d -m 0700 "$DOCKER_CONFIG"', installer)
        self.assertIn('docker --config /etc/daily-cd/docker login ghcr.io', installer)
        self.assertIn('--check-registry', installer)


if __name__ == '__main__':
    unittest.main()
