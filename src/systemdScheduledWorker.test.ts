import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const servicePath = 'deploy/systemd/daily-scheduled-worker.service';
const timerPath = 'deploy/systemd/daily-scheduled-worker.timer';
const operatorGuidePath = 'docs/systemd-web-service.md';

const read = (path: string) => readFileSync(path, 'utf8');

describe('systemd scheduled worker contract', () => {
  test('runs the worker as an isolated oneshot with the production configuration', () => {
    const service = read(servicePath);

    expect(service).toContain('Type=oneshot');
    expect(service).toContain('User=daily');
    expect(service).toContain('Group=daily');
    expect(service).toContain('WorkingDirectory=/srv/daily/current');
    expect(service).toContain('Environment=NODE_ENV=production');
    expect(service).toContain('EnvironmentFile=/etc/daily/daily.env');
    expect(service).toContain('ExecStartPre=/usr/bin/node scripts/validate-production-environment.mjs');
    expect(service).toContain(
      'ExecStart=/usr/bin/node build/worker/runScheduledDailySummaryWorkerCommand.js'
    );
    expect(service).not.toContain('vite-node');
    expect(service).not.toContain('daily-web.service');
  });

  test('invokes the same service once per minute and catches up after downtime', () => {
    const timer = read(timerPath);

    expect(timer).toContain('OnCalendar=*-*-* *:*:00');
    expect(timer).toContain('Persistent=true');
    expect(timer).toContain('Unit=daily-scheduled-worker.service');
    expect(timer).toContain('WantedBy=timers.target');
  });

  test('relies on systemd service activation to prevent normal overlapping runs', () => {
    const service = read(servicePath);
    const timer = read(timerPath);

    expect(service).toContain('Type=oneshot');
    expect(service).not.toContain('RemainAfterExit=true');
    expect(timer).toContain('Unit=daily-scheduled-worker.service');
  });

  test('sends aggregate output and failures to an independent journal unit', () => {
    const service = read(servicePath);

    expect(service).toContain('StandardOutput=journal');
    expect(service).toContain('StandardError=journal');
    expect(service).toContain('SyslogIdentifier=daily-scheduled-worker');
    expect(service).not.toMatch(/^Restart=/m);
  });

  test('documents installation, enablement, cadence, logs, and manual invocation safety', () => {
    const guide = read(operatorGuidePath);

    expect(guide).toContain('daily-scheduled-worker.service');
    expect(guide).toContain('daily-scheduled-worker.timer');
    expect(guide).toContain('systemctl enable --now daily-scheduled-worker.timer');
    expect(guide).toContain('journalctl -u daily-scheduled-worker.service');
    expect(guide).toContain('once per minute');
    expect(guide).toContain('Delivery Record');
  });

  test.runIf(existsSync('/usr/bin/systemd-analyze'))(
    'passes systemd unit verification when systemd tooling is available',
    () => {
      const verificationDirectory = mkdtempSync(join(tmpdir(), 'daily-systemd-worker-'));
      const verificationServicePath = join(
        verificationDirectory,
        'daily-scheduled-worker.service'
      );
      const verificationTimerPath = join(verificationDirectory, 'daily-scheduled-worker.timer');

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
