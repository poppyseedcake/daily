import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

const validationScript = 'scripts/validate-production-environment.mjs';
const validEnvironment = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_MAPS_ATTRIBUTION_SECRET: 'b'.repeat(32),
  DATABASE_URL: '/var/lib/daily/daily.db',
  ORIGIN: 'https://dailykickoff.eu',
  BETTER_AUTH_URL: 'https://dailykickoff.eu',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_ROUTES_GLOBAL_DAILY_CAP: '100',
  GOOGLE_ROUTES_GLOBAL_MONTHLY_CAP: '1000',
  GOOGLE_ROUTES_PER_PERSON_DAILY_LIMIT: '50',
  GOOGLE_PLACES_GLOBAL_MONTHLY_CAP: '10000',
  GOOGLE_PLACES_PER_PERSON_DAILY_LIMIT: '500'
};

const validate = (environment: NodeJS.ProcessEnv, context?: string) =>
  spawnSync(process.execPath, [validationScript, ...(context ? [context] : [])], {
    encoding: 'utf8',
    env: environment
  });

describe('production environment validation', () => {
  test.each([
    undefined,
    '',
    'replace-me',
    'replace-with-a-long-random-secret',
    'short-secret'
  ])(
    'rejects an unsafe Better Auth signing secret: %s',
    (secret) => {
      const result = validate({ ...validEnvironment, BETTER_AUTH_SECRET: secret });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('BETTER_AUTH_SECRET');
      expect(result.stderr).not.toContain(secret || 'value-not-present');
    }
  );

  test('accepts independently configured production secrets', () => {
    const result = validate(validEnvironment);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('validates each command context without requiring unrelated secrets', () => {
    const base = {
      DATABASE_URL: '/var/lib/daily/daily.db',
      MIGRATIONS_DIRECTORY: '/app/drizzle',
      BACKUP_DIRECTORY: '/var/backups/daily',
      BACKUP_RETENTION_DAYS: '30'
    };

    expect(validate({ ...base, NODE_ENV: 'production' }, '--context=migrate').status).toBe(0);
    expect(validate({ ...base }, '--context=backup').status).toBe(0);
    expect(
      validate({ ...base, DAILY_RESTORE_OFFLINE: 'true', SCHEDULED_DELIVERY_ENABLED: 'false' }, '--context=restore').status
    ).toBe(0);
    expect(
      validate(
        {
          ...base,
          GOOGLE_CLIENT_ID: 'client-id',
          GOOGLE_CLIENT_SECRET: 'client-secret',
          RESEND_API_KEY: 'resend-key',
          RESEND_FROM_EMAIL: 'daily@example.com',
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          GOOGLE_MAPS_ATTRIBUTION_SECRET: 'b'.repeat(32),
          SCHEDULED_DELIVERY_ENABLED: 'true'
        },
        '--context=worker'
      ).status
    ).toBe(0);
  });

  test('rejects unsafe worker health and migration delivery settings', () => {
    expect(
      validate(
        { ...validEnvironment, SCHEDULED_WORKER_OVERDUE_MINUTES: '1' },
        '--context=web'
      ).status
    ).not.toBe(0);
    expect(
      validate(
        {
          DATABASE_URL: '/var/lib/daily/daily.db',
          MIGRATIONS_DIRECTORY: '/app/drizzle',
          SCHEDULED_DELIVERY_ENABLED: 'true'
        },
        '--context=migrate'
      ).status
    ).not.toBe(0);
  });

  test.each([undefined, '', '   '])('rejects a missing production database URL: %s', (databaseUrl) => {
    const result = validate({ ...validEnvironment, DATABASE_URL: databaseUrl });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DATABASE_URL');
    expect(result.stderr).not.toContain('/var/lib/daily/daily.db');
  });

  test.each([undefined, '', 'replace-me', 'short-secret'])(
    'rejects an unsafe Google Maps attribution secret: %s',
    (secret) => {
      const result = validate({
        ...validEnvironment,
        GOOGLE_MAPS_ATTRIBUTION_SECRET: secret
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('GOOGLE_MAPS_ATTRIBUTION_SECRET');
      expect(result.stderr).not.toContain(secret || 'value-not-present');
    }
  );

  test.each([
    ['DATABASE_URL', '/srv/daily/shared/daily.db'],
    ['BACKUP_DIRECTORY', '/srv/daily/backups'],
    ['DATABASE_URL', '/var/lib/daily/daily.db '],
    ['BACKUP_DIRECTORY', '/var/backups/daily ']
  ])('rejects %s outside the systemd backup unit write paths', (name, value) => {
    const result = validate({
      ...validEnvironment,
      BACKUP_DIRECTORY: '/var/backups/daily',
      DAILY_SYSTEMD_BACKUP_UNIT: 'true',
      [name]: value
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(name);
    expect(result.stderr).not.toContain(value);
  });
});
