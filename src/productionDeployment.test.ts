import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const deploymentScript = join(process.cwd(), 'scripts/deploy-production.sh');
const temporaryDirectories: string[] = [];

const executable = (path: string, contents: string) => {
  writeFileSync(path, `#!/bin/sh\nset -eu\n${contents}\n`);
  chmodSync(path, 0o755);
};

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'daily-deployment-'));
  temporaryDirectories.push(root);
  const source = join(root, 'source');
  const releases = join(root, 'releases');
  const bin = join(root, 'bin');
  const state = join(root, 'state');
  mkdirSync(source);
  mkdirSync(releases);
  mkdirSync(bin);
  mkdirSync(state);
  mkdirSync(join(source, 'deploy', 'systemd'), { recursive: true });
  mkdirSync(join(source, 'scripts'));
  writeFileSync(join(source, 'package.json'), '{}');
  writeFileSync(join(source, 'package-lock.json'), '{}');
  writeFileSync(join(source, 'release-marker'), 'candidate');
  for (const unit of [
    'daily-web.service',
    'daily-scheduled-worker.service',
    'daily-scheduled-worker.timer',
    'daily-backup.service',
    'daily-backup.timer'
  ]) {
    writeFileSync(join(source, 'deploy', 'systemd', unit), unit);
  }

  const previousRelease = join(releases, 'previous');
  mkdirSync(previousRelease);
  mkdirSync(join(previousRelease, 'deploy', 'systemd'), { recursive: true });
  for (const unit of [
    'daily-web.service',
    'daily-scheduled-worker.service',
    'daily-scheduled-worker.timer',
    'daily-backup.service',
    'daily-backup.timer'
  ]) {
    writeFileSync(join(previousRelease, 'deploy', 'systemd', unit), `previous ${unit}`);
  }
  symlinkSync(previousRelease, join(root, 'current'));
  const database = join(root, 'daily.db');
  writeFileSync(database, 'sqlite fixture');
  const log = join(state, 'operations.log');

  executable(
    join(bin, 'npm'),
    'printf "npm %s\\n" "$*" >> "$DAILY_TEST_LOG"\n' +
      'if [ "$*" = "run db:backup -- pre-migration" ]; then\n' +
      '  [ "${DAILY_TEST_BACKUP_FAIL:-false}" != true ] || exit 23\n' +
      '  cp "$DATABASE_URL" "$DAILY_TEST_BACKUP_COPY"\n' +
      'fi\n' +
      'if [ "$*" = "run build" ]; then [ "${DAILY_TEST_BUILD_FAIL:-false}" != true ] || exit 25; mkdir -p build build/worker; fi\n' +
      'if [ "$*" = "run db:migrate" ]; then [ "${DAILY_TEST_MIGRATION_FAIL:-false}" != true ] || exit 24; fi'
  );
  executable(
    join(bin, 'systemctl'),
    'printf "systemctl %s\\n" "$*" >> "$DAILY_TEST_LOG"\n' +
      'case "$1" in is-active) [ "${DAILY_TEST_SERVICE_FAIL:-false}" != true ];; esac'
  );
  executable(
    join(bin, 'curl'),
    'printf "curl %s\\n" "$*" >> "$DAILY_TEST_LOG"\n' +
      '[ "${DAILY_TEST_READINESS_FAIL:-false}" != true ] || exit 22\n' +
      'printf \'{"status":"ok"}\''
  );

  return { root, source, releases, bin, state, database, log };
};

const deploy = (
  fixture: ReturnType<typeof createFixture>,
  extraEnvironment: NodeJS.ProcessEnv = {}
) =>
  spawnSync('sh', [deploymentScript, fixture.source, 'release-148'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      DAILY_RELEASES_DIRECTORY: fixture.releases,
      DAILY_CURRENT_LINK: join(fixture.root, 'current'),
      DAILY_SYSTEMD_DIRECTORY: join(fixture.root, 'systemd'),
      DAILY_RELEASE_OWNER: String(process.getuid?.() ?? 0),
      DAILY_RELEASE_GROUP: String(process.getgid?.() ?? 0),
      DATABASE_URL: fixture.database,
      BACKUP_DIRECTORY: join(fixture.root, 'backups'),
      READINESS_URL: 'http://127.0.0.1:5174/health',
      DAILY_TEST_LOG: fixture.log,
      DAILY_TEST_BACKUP_COPY: join(fixture.state, 'pre-migration.sqlite3'),
      ...extraEnvironment
    }
  });

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('production deployment operator boundary', () => {
  test('builds, backs up, migrates, activates units, and verifies readiness in order', () => {
    const fixture = createFixture();

    const result = deploy(fixture);

    expect(result.status).toBe(0);
    expect(readFileSync(join(fixture.state, 'pre-migration.sqlite3'), 'utf8')).toBe(
      'sqlite fixture'
    );
    expect(readFileSync(join(fixture.root, 'current', 'release-marker'), 'utf8')).toBe(
      'candidate'
    );
    expect(readFileSync(fixture.log, 'utf8').trim().split('\n')).toEqual([
      'npm ci',
      'npm run build',
      'npm run db:backup -- pre-migration',
      'systemctl stop daily-scheduled-worker.timer daily-backup.timer daily-scheduled-worker.service daily-web.service',
      'npm run db:migrate',
      'systemctl daemon-reload',
      'systemctl enable daily-web.service daily-scheduled-worker.timer daily-backup.timer',
      'systemctl restart daily-web.service',
      'systemctl restart daily-scheduled-worker.timer daily-backup.timer',
      'systemctl is-active --quiet daily-web.service daily-scheduled-worker.timer daily-backup.timer',
      'curl --fail --silent --show-error http://127.0.0.1:5174/health'
    ]);
    expect(existsSync(join(fixture.root, 'systemd', 'daily-web.service'))).toBe(true);
  });

  test('does not migrate or switch releases when the verified backup command fails', () => {
    const fixture = createFixture();

    const result = deploy(fixture, { DAILY_TEST_BACKUP_FAIL: 'true' });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.log, 'utf8')).not.toContain('db:migrate');
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
  });

  test.each([
    ['build', { DAILY_TEST_BUILD_FAIL: 'true' }],
    ['migration', { DAILY_TEST_MIGRATION_FAIL: 'true' }],
    ['service state', { DAILY_TEST_SERVICE_FAIL: 'true' }],
    ['readiness', { DAILY_TEST_READINESS_FAIL: 'true' }]
  ])('returns failure when %s verification fails', (_name, environment) => {
    const fixture = createFixture();
    expect(deploy(fixture, environment).status).not.toBe(0);
    if ('DAILY_TEST_SERVICE_FAIL' in environment || 'DAILY_TEST_READINESS_FAIL' in environment) {
      expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
    }
  });

  test('documents prerequisites, failure semantics, rollback, and restoration', () => {
    const guide = readFileSync('docs/production-deployment.md', 'utf8');

    expect(guide).toContain('Node.js 22.15.0 and npm 10.9.2');
    expect(guide).toContain('/srv/daily/releases');
    expect(guide).toContain('/var/lib/daily/daily.db');
    expect(guide).toContain('/var/backups/daily');
    expect(guide).toContain('/etc/daily/daily.env');
    expect(guide).toContain('npm ci');
    expect(guide).toContain('pre-migration');
    expect(guide).toContain('exits non-zero');
    expect(guide).toContain('application rollback');
    expect(guide).toContain('docs/sqlite-backups.md');
  });
});
