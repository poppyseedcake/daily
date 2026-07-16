import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const servicePath = 'deploy/systemd/daily-backup.service';
const timerPath = 'deploy/systemd/daily-backup.timer';
const operatorGuidePath = 'docs/systemd-web-service.md';
const workerBuildConfigPath = 'vite.worker.build.config.ts';

const read = (path: string) => readFileSync(path, 'utf8');

describe('systemd daily backup contract', () => {
  test('runs the verified daily backup command as an isolated oneshot', () => {
    const service = read(servicePath);

    expect(service).toContain('Type=oneshot');
    expect(service).toContain('User=daily');
    expect(service).toContain('Group=daily');
    expect(service).toContain('WorkingDirectory=/srv/daily/current');
    expect(service).toContain('Environment=NODE_ENV=production');
    expect(service).toContain('EnvironmentFile=/etc/daily/daily.env');
    expect(service).toContain('Environment=DAILY_SYSTEMD_BACKUP_UNIT=true');
    expect(service).toContain('ExecStartPre=/usr/bin/node scripts/validate-production-environment.mjs');
    expect(service).toContain(
      'ExecStart=/usr/bin/node build/worker/runSqliteBackupCommand.js daily'
    );
    expect(service).not.toContain('vite-node');

    const workerBuildConfig = read(workerBuildConfigPath);
    expect(workerBuildConfig).toContain(
      "runSqliteBackupCommand: 'src/lib/server/db/runSqliteBackupCommand.ts'"
    );
  });

  test('allows backup storage but keeps replaceable release contents read-only', () => {
    const service = read(servicePath);

    expect(service).toContain('ProtectSystem=strict');
    expect(service).toContain('ReadWritePaths=/var/lib/daily /var/backups/daily');
    expect(service).not.toMatch(/^ReadWritePaths=.*\/srv\/daily/m);
    expect(service).toContain('UMask=0027');
  });

  test('runs daily, catches up after downtime, and targets only the serialized command', () => {
    const timer = read(timerPath);

    expect(timer).toContain('OnCalendar=daily');
    expect(timer).toContain('Persistent=true');
    expect(timer).toContain('Unit=daily-backup.service');
    expect(timer).toContain('WantedBy=timers.target');
    expect(timer).not.toContain('ExecStart');
  });

  test('leaves command failures visible in the unit result and privacy-safe journal', () => {
    const service = read(servicePath);

    expect(service).toContain('StandardOutput=journal');
    expect(service).toContain('StandardError=journal');
    expect(service).toContain('SyslogIdentifier=daily-backup');
    expect(service).not.toMatch(/^SuccessExitStatus=/m);
    expect(service).not.toMatch(/^ExecStart=-/m);
  });

  test('documents installation, enablement, status, and failure events', () => {
    const guide = read(operatorGuidePath);

    expect(guide).toContain('daily-backup.service');
    expect(guide).toContain('daily-backup.timer');
    expect(guide).toContain('systemctl enable --now daily-backup.timer');
    expect(guide).toContain('journalctl -u daily-backup.service');
    expect(guide).toContain('sqlite-backup-failed');
  });

  test.runIf(existsSync('/usr/bin/systemd-analyze'))(
    'passes systemd unit verification when systemd tooling is available',
    () => {
      const verificationDirectory = mkdtempSync(join(tmpdir(), 'daily-systemd-backup-'));
      const verificationServicePath = join(verificationDirectory, 'daily-backup.service');
      const verificationTimerPath = join(verificationDirectory, 'daily-backup.timer');

      try {
        const portableService = read(servicePath)
          .replace(/^ExecStartPre=.*$/m, 'ExecStartPre=/bin/true')
          .replace(/^ExecStart=.*$/m, 'ExecStart=/bin/true');
        writeFileSync(verificationServicePath, portableService);
        writeFileSync(verificationTimerPath, read(timerPath));

        const verification = spawnSync(
          '/usr/bin/systemd-analyze',
          ['verify', verificationServicePath, verificationTimerPath],
          { encoding: 'utf8' }
        );
        const diagnostics = `${verification.stdout}${verification.stderr}`
          .split('\n')
          .filter(Boolean);

        expect(verification.error).toBeUndefined();
        expect(verification.status).toBe(0);
        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(verificationDirectory, { recursive: true, force: true });
      }
    }
  );
});
