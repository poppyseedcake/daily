import Database from 'better-sqlite3';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseURL = process.env.DATABASE_URL;
const testDatabasePrefix = join(tmpdir(), 'daily-playwright-');

if (!databaseURL?.startsWith(testDatabasePrefix)) {
  throw new Error('Playwright database setup requires an isolated Daily test database.');
}

rmSync(databaseURL, { force: true });

const database = new Database(databaseURL);

try {
  database.pragma('foreign_keys = ON');

  for (const migrationFile of readdirSync('drizzle').filter((file) => file.endsWith('.sql')).sort()) {
    const migration = readFileSync(join('drizzle', migrationFile), 'utf8').replaceAll(
      '--> statement-breakpoint',
      ''
    );
    database.exec(migration);
  }
} finally {
  database.close();
}
