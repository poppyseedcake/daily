import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const servicePath = 'deploy/systemd/daily-web.service';
const environmentExamplePath = 'deploy/systemd/daily.env.example';
const operatorGuidePath = 'docs/systemd-web-service.md';

const read = (path: string) => readFileSync(path, 'utf8');

describe('systemd web service contract', () => {
  test('runs the built Node server as the dedicated Daily identity', () => {
    const service = read(servicePath);

    expect(service).toContain('User=daily');
    expect(service).toContain('Group=daily');
    expect(service).toContain('WorkingDirectory=/srv/daily/current');
    expect(service).toContain('EnvironmentFile=/etc/daily/daily.env');
    expect(service).toContain('ExecStartPre=/usr/bin/node scripts/validate-production-environment.mjs');
    expect(service).toContain('ExecStart=/usr/bin/node build');
  });

  test('starts after networking and bounds crash recovery and graceful shutdown', () => {
    const service = read(servicePath);

    expect(service).toContain('After=network-online.target');
    expect(service).toContain('Wants=network-online.target');
    expect(service).toContain('Restart=on-failure');
    expect(service).toMatch(/RestartSec=\d+s/);
    expect(service).toMatch(/StartLimitIntervalSec=\d+s/);
    expect(service).toMatch(/StartLimitBurst=\d+/);
    expect(service).toContain('KillSignal=SIGTERM');
    expect(service).toMatch(/TimeoutStopSec=\d+s/);
    expect(service).toContain('WantedBy=multi-user.target');
  });

  test('limits privileges and writes to persistent application data only', () => {
    const service = read(servicePath);

    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('PrivateTmp=true');
    expect(service).toContain('ProtectSystem=strict');
    expect(service).toContain('ProtectHome=true');
    expect(service).toContain('PrivateDevices=true');
    expect(service).toContain('RestrictSUIDSGID=true');
    expect(service).toContain('RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6');
    expect(service).toContain('ReadWritePaths=/var/lib/daily');
    expect(service).not.toContain('ReadWritePaths=/srv/daily');
    expect(service).not.toContain('ReadWritePaths=/etc/daily');
    expect(service).not.toContain('ReadWritePaths=/var/backups/daily');
  });

  test('keeps release, data, configuration, and backup locations separate', () => {
    const environment = read(environmentExamplePath);
    const guide = read(operatorGuidePath);

    expect(environment).toContain('DATABASE_URL=/var/lib/daily/daily.db');
    expect(environment).toContain('BACKUP_DIRECTORY=/var/backups/daily');
    expect(guide).toContain('/srv/daily/current');
    expect(guide).toContain('/var/lib/daily');
    expect(guide).toContain('/etc/daily/daily.env');
    expect(guide).toContain('/var/backups/daily');
  });

  test('documents installation, enablement, status, and readiness verification', () => {
    const guide = read(operatorGuidePath);

    expect(guide).toContain('systemctl enable --now daily-web.service');
    expect(guide).toContain('systemctl status daily-web.service');
    expect(guide).toContain('journalctl -u daily-web.service');
    expect(guide).toContain("curl --fail --silent http://127.0.0.1:5174/health");
    expect(guide).toContain('{"status":"ok"}');
    expect(guide).toContain('SQLite WAL');
    expect(guide).toContain('private temporary directory');
    expect(guide).toContain('outbound DNS and HTTPS');
  });

  test.runIf(existsSync('/usr/bin/systemd-analyze'))(
    'passes systemd unit verification when systemd tooling is available',
    () => {
      const verification = spawnSync('/usr/bin/systemd-analyze', ['verify', servicePath], {
        encoding: 'utf8'
      });
      const diagnostics = `${verification.stdout}${verification.stderr}`
        .split('\n')
        .filter(Boolean);
      const unexpectedDiagnostics = diagnostics.filter(
        (line) =>
          line !==
          'daily-web.service: Command /usr/bin/node is not executable: No such file or directory'
      );

      expect(verification.error).toBeUndefined();
      expect(unexpectedDiagnostics).toEqual([]);
    }
  );
});
