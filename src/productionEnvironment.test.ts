import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

const validationScript = 'scripts/validate-production-environment.mjs';
const validEnvironment = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GOOGLE_MAPS_ATTRIBUTION_SECRET: 'b'.repeat(32),
  DATABASE_URL: '/var/lib/daily/daily.db'
};

const validate = (environment: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, [validationScript], {
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
});
