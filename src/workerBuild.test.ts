import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

test('starts a built worker when its lazy production module shares telemetry with the entry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-worker-build-'));
  const outputDirectory = join(directory, 'build');

  try {
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    symlinkSync(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    await build({
      configFile: 'vite.worker.build.config.ts',
      logLevel: 'silent',
      build: { outDir: outputDirectory }
    });

    const environment = {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      DATABASE_URL: join(directory, 'daily.db'),
      MIGRATIONS_DIRECTORY: resolve('drizzle'),
      SCHEDULED_DELIVERY_ENABLED: 'true'
    };
    const migration = spawnSync(
      process.execPath,
      [join(outputDirectory, 'runSqliteMigrateCommand.js')],
      { encoding: 'utf8', timeout: 5_000, env: environment }
    );
    expect(migration.error).toBeUndefined();
    expect(migration.status, migration.stderr).toBe(0);

    const result = spawnSync(
      process.execPath,
      [join(outputDirectory, 'runScheduledDailySummaryWorkerCommand.js')],
      { encoding: 'utf8', timeout: 5_000, env: environment }
    );

    expect(result.error).toBeUndefined();
    expect(result.stderr).not.toContain('Detected unsettled top-level await');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('scheduled-daily-summary-worker-completed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
