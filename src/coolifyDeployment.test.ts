import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Coolify container deployment contract', () => {
  test('builds a production image without secrets and runs as the fixed unprivileged user', () => {
    const dockerfile = read('Dockerfile');
    const dockerignore = read('.dockerignore');

    expect(dockerfile).toContain('FROM node:${NODE_VERSION}-bookworm-slim AS build');
    expect(dockerfile).toContain('FROM node:${NODE_VERSION}-bookworm-slim AS runtime');
    expect(dockerfile).toContain('RUN npm ci');
    expect(dockerfile).toContain('RUN npm prune --omit=dev');
    expect(dockerfile).toContain('USER ${DAILY_UID}:${DAILY_GID}');
    expect(dockerfile).toContain('ARG DAILY_UID=10001');
    expect(dockerfile).toContain('ARG DAILY_GID=10001');
    expect(dockerfile).toContain('CMD ["node", "build"]');
    expect(dockerfile).toContain('STOPSIGNAL SIGTERM');
    expect(dockerfile).toContain('container-healthcheck.mjs');
    expect(dockerfile).not.toMatch(/BETTER_AUTH_SECRET\s*=/);
    expect(dockerfile).not.toMatch(/RESEND_API_KEY\s*=/);

    expect(dockerignore).toContain('.git');
    expect(dockerignore).toContain('node_modules');
    expect(dockerignore).toContain('*.db');
    expect(dockerignore).toContain('*.db-*');
    expect(dockerignore).toContain('.env.*');
    expect(dockerignore).toContain('!.env.example');
    expect(dockerignore).not.toContain('drizzle');
  });

  test('builds all production administration commands into the same image', () => {
    const buildConfig = read('vite.worker.build.config.ts');

    for (const command of [
      'runScheduledDailySummaryWorkerCommand',
      'runSqliteBackupCommand',
      'runSqliteMigrateCommand',
      'runSqliteRestoreCommand',
      'runSqliteRestoreContainerCommand'
    ]) {
      expect(buildConfig).toContain(command);
    }
  });

  test('uses the local readiness endpoint for the container health check', () => {
    const healthcheck = read('scripts/container-healthcheck.mjs');

    expect(healthcheck).toContain('127.0.0.1');
    expect(healthcheck).toContain('/health');
    expect(healthcheck).not.toMatch(/api\.resend|openai\.com|googleapis\.com/);
  });
});
