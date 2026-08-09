import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
const sourceCommit = '0123456789abcdef0123456789abcdef01234567';

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
  const gitLog = join(state, 'git.log');

  executable(
    join(bin, 'git'),
    'printf "%s\\n" "$*" >> "$DAILY_TEST_GIT_LOG"\n' +
      '[ "${DAILY_TEST_GIT_FAIL:-false}" != true ] || { printf "%s\\n" "fatal: detected dubious ownership in repository" >&2; exit 128; }\n' +
      'if [ "$1" = "-c" ] && [ "$3" = "-C" ] && [ "$5" = "rev-parse" ]; then printf "%s\\n" "$DAILY_TEST_SOURCE_COMMIT"; exit 0; fi\n' +
      'if [ "$1" = "-c" ] && [ "$3" = "-C" ] && [ "$5" = "status" ]; then printf "%s\\n" "${DAILY_TEST_SOURCE_STATUS:-}"; exit 0; fi\n' +
      'exit 1'
  );
  executable(
    join(bin, 'npm'),
    'printf "npm %s\\n" "$*" >> "$DAILY_TEST_LOG"\n' +
      'if [ "$*" = "run db:backup -- pre-migration" ]; then\n' +
      '  [ "${DAILY_TEST_BACKUP_FAIL:-false}" != true ] || exit 23\n' +
      '  cp "$DATABASE_URL" "$DAILY_TEST_BACKUP_COPY"\n' +
      '  [ "${DAILY_TEST_BACKUP_ARTIFACT_MISSING:-false}" != true ] || exit 0\n' +
      '  mkdir -p "$BACKUP_DIRECTORY/pre-migration-20260809T000000000Z-test"\n' +
      '  cp "$DATABASE_URL" "$BACKUP_DIRECTORY/pre-migration-20260809T000000000Z-test/backup.sqlite3"\n' +
      '  printf "%s\\n" verified > "$BACKUP_DIRECTORY/pre-migration-20260809T000000000Z-test/metadata.json"\n' +
      'fi\n' +
      'if [ "$*" = "run build" ]; then [ "${DAILY_TEST_BUILD_FAIL:-false}" != true ] || exit 25; mkdir -p build build/worker; fi\n' +
      'if [ "$*" = "run db:migrate" ]; then [ "${DAILY_TEST_MIGRATION_FAIL:-false}" != true ] || exit 24; fi'
  );
  executable(
    join(bin, 'systemctl'),
      'printf "systemctl %s\\n" "$*" >> "$DAILY_TEST_LOG"\n' +
      'case "$1" in is-active) [ "${DAILY_TEST_SERVICE_FAIL:-false}" != true ];; is-inactive) [ "${DAILY_TEST_WORKER_ACTIVE:-false}" != true ];; esac'
  );
  executable(
    join(bin, 'curl'),
    'printf "curl %s\\n" "$*" >> "$DAILY_TEST_LOG"\n' +
      '[ "${DAILY_TEST_READINESS_FAIL:-false}" != true ] || exit 22\n' +
      'printf \'{"status":"ok"}\''
  );

  return {
    root,
    source,
    releases,
    bin,
    state,
    database,
    backups: join(root, 'backups'),
    log,
    gitLog,
    commit: sourceCommit
  };
};

const deploy = (
  fixture: ReturnType<typeof createFixture>,
  extraEnvironment: NodeJS.ProcessEnv = {}
) =>
  spawnSync('sh', [deploymentScript, fixture.source, fixture.commit], {
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
      DAILY_TEST_GIT_LOG: fixture.gitLog,
      DAILY_TEST_BACKUP_COPY: join(fixture.state, 'pre-migration.sqlite3'),
      DAILY_TEST_SOURCE_COMMIT: fixture.commit,
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
    expect(readFileSync(join(fixture.root, 'current', 'release-manifest.json'), 'utf8').trim()).toBe(
      `{"formatVersion":1,"releaseId":"${fixture.commit}","sourceCommit":"${fixture.commit}"}`
    );
    expect(readFileSync(fixture.log, 'utf8').trim().split('\n')).toEqual([
      'npm ci',
      'npm run build',
      'npm run db:backup -- pre-migration',
      'systemctl stop daily-scheduled-worker.timer daily-backup.timer daily-scheduled-worker.service daily-web.service',
      'systemctl disable --now daily-scheduled-worker.timer',
      'systemctl stop daily-scheduled-worker.service',
      'npm run db:migrate',
      'systemctl daemon-reload',
      'systemctl enable daily-web.service daily-backup.timer',
      'systemctl disable --now daily-scheduled-worker.timer',
      'systemctl stop daily-scheduled-worker.service',
      'systemctl restart daily-web.service',
      'systemctl restart daily-backup.timer',
      'systemctl is-active --quiet daily-web.service daily-backup.timer',
      'systemctl is-inactive --quiet daily-scheduled-worker.timer daily-scheduled-worker.service',
      'curl --fail --silent --show-error http://127.0.0.1:5174/health'
    ]);
    expect(existsSync(join(fixture.root, 'systemd', 'daily-web.service'))).toBe(true);
    expect(existsSync(join(fixture.releases, 'previous'))).toBe(true);
  });

  test('trusts the exact source checkout when Git runs as root', () => {
    const fixture = createFixture();

    expect(deploy(fixture).status).toBe(0);
    expect(readFileSync(fixture.gitLog, 'utf8').trim().split('\n')).toEqual([
      `-c safe.directory=${fixture.source} -C ${fixture.source} rev-parse --verify HEAD^{commit}`,
      `-c safe.directory=${fixture.source} -C ${fixture.source} status --porcelain --untracked-files=all`
    ]);
  });

  test('keeps Git ownership diagnostics visible', () => {
    const fixture = createFixture();

    const result = deploy(fixture, { DAILY_TEST_GIT_FAIL: 'true' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('detected dubious ownership');
    expect(result.stderr).toContain('source checkout has no readable commit.');
  });

  test('accepts a new recovery point when an existing point has a later name', () => {
    const fixture = createFixture();
    const existingRecoveryPoint = join(
      fixture.backups,
      'pre-migration-20990101T000000000Z-existing'
    );
    mkdirSync(existingRecoveryPoint, { recursive: true });
    writeFileSync(join(existingRecoveryPoint, 'backup.sqlite3'), 'older backup');
    writeFileSync(join(existingRecoveryPoint, 'metadata.json'), 'verified');

    const result = deploy(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('pre-migration-20260809T000000000Z-test');
  });

  test('does not migrate or switch releases when the verified backup command fails', () => {
    const fixture = createFixture();

    const result = deploy(fixture, { DAILY_TEST_BACKUP_FAIL: 'true' });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.log, 'utf8')).not.toContain('db:migrate');
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
  });

  test('rejects a release identifier that is not the source commit SHA', () => {
    const fixture = createFixture();

    const result = deploy(fixture, {
      DAILY_TEST_SOURCE_COMMIT: 'fedcba9876543210fedcba9876543210fedcba98'
    });

    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.log)).toBe(false);
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
  });

  test('rejects a dirty source checkout before building or stopping services', () => {
    const fixture = createFixture();

    const result = deploy(fixture, { DAILY_TEST_SOURCE_STATUS: ' M scripts/deploy-production.sh' });

    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.log)).toBe(false);
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
  });

  test('does not migrate or switch releases when no new finalized recovery point exists', () => {
    const fixture = createFixture();

    const result = deploy(fixture, { DAILY_TEST_BACKUP_ARTIFACT_MISSING: 'true' });

    expect(result.status).not.toBe(0);
    expect(readFileSync(fixture.log, 'utf8')).not.toContain('systemctl stop');
    expect(readFileSync(fixture.log, 'utf8')).not.toContain('db:migrate');
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
  });

  test.each([
    ['build', { DAILY_TEST_BUILD_FAIL: 'true' }],
    ['migration', { DAILY_TEST_MIGRATION_FAIL: 'true' }],
    ['service state', { DAILY_TEST_SERVICE_FAIL: 'true' }],
    ['scheduled worker state', { DAILY_TEST_WORKER_ACTIVE: 'true' }],
    ['readiness', { DAILY_TEST_READINESS_FAIL: 'true' }]
  ])('returns failure when %s verification fails', (_name, environment) => {
    const fixture = createFixture();
    expect(deploy(fixture, environment).status).not.toBe(0);
    if ('DAILY_TEST_MIGRATION_FAIL' in environment) {
      expect(readFileSync(fixture.log, 'utf8')).not.toContain('systemctl restart daily-web.service');
    }
  });

  test('keeps the candidate and stops all services when migration changed the schema without compatibility proof', () => {
    const fixture = createFixture();

    const result = deploy(fixture, { DAILY_TEST_READINESS_FAIL: 'true' });

    expect(result.status).not.toBe(0);
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(
      join(fixture.releases, fixture.commit)
    );
    expect(readFileSync(fixture.log, 'utf8')).toContain(
      'systemctl stop daily-scheduled-worker.timer daily-backup.timer daily-scheduled-worker.service daily-web.service'
    );
    expect(readFileSync(fixture.log, 'utf8')).not.toContain(
      'systemctl restart daily-scheduled-worker.timer'
    );
  });

  test('allows code-only rollback only with explicit schema compatibility and keeps Scheduled Delivery stopped', () => {
    const fixture = createFixture();

    const result = deploy(fixture, {
      DAILY_TEST_READINESS_FAIL: 'true',
      DAILY_PREVIOUS_RELEASE_SCHEMA_COMPATIBLE: 'true'
    });

    expect(result.status).not.toBe(0);
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, 'previous'));
    expect(readFileSync(fixture.log, 'utf8')).toContain(
      'systemctl restart daily-web.service\nsystemctl restart daily-backup.timer'
    );
    expect(readFileSync(fixture.log, 'utf8')).not.toContain(
      'systemctl restart daily-scheduled-worker.timer'
    );
  });

  test('retains a rejected first candidate for coordinated recovery', () => {
    const fixture = createFixture();
    rmSync(join(fixture.root, 'current'));

    const result = deploy(fixture, { DAILY_TEST_READINESS_FAIL: 'true' });

    expect(result.status).not.toBe(0);
    expect(readlinkSync(join(fixture.root, 'current'))).toBe(join(fixture.releases, fixture.commit));
    expect(existsSync(join(fixture.releases, fixture.commit))).toBe(true);
    expect(existsSync(join(fixture.root, 'systemd', 'daily-web.service'))).toBe(true);
  });

  test('restores units from a previous release addressed by a relative current link', () => {
    const fixture = createFixture();
    rmSync(join(fixture.root, 'current'));
    symlinkSync('releases/previous', join(fixture.root, 'current'));

    const result = deploy(fixture, {
      DAILY_TEST_READINESS_FAIL: 'true',
      DAILY_PREVIOUS_RELEASE_SCHEMA_COMPATIBLE: 'true'
    });

    expect(result.status).not.toBe(0);
    expect(readlinkSync(join(fixture.root, 'current'))).toBe('releases/previous');
    expect(readFileSync(join(fixture.root, 'systemd', 'daily-web.service'), 'utf8')).toBe(
      'previous daily-web.service'
    );
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
    expect(guide).toContain('Code-only rollback');
    expect(guide).toContain('docs/sqlite-backups.md');
    expect(guide).toContain('Scheduled Delivery remains stopped');
    expect(guide).toContain('duplicate or wrong-recipient delivery');
    expect(guide).toContain('lost HTML/plain-text meaning');
    expect(guide).toContain('DAILY_PREVIOUS_RELEASE_SCHEMA_COMPATIBLE=true');
    expect(guide).toContain('readlink -f /srv/daily/current');
    expect(guide).toContain('Use this sequence only when the migrated database is known');
  });
});
