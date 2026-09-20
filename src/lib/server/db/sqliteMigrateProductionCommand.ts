import { resolve } from 'node:path';
import { executeSqliteMigrateCommand } from './sqliteMigrateCommand';

type MigrationEnvironment = {
  DATABASE_URL?: string;
  MIGRATIONS_DIRECTORY?: string;
};

const parseConfiguration = (
  arguments_: string[],
  environment: MigrationEnvironment
): { databasePath: string; migrationsDirectory: string } | null => {
  if (arguments_.length > 0 || !environment.DATABASE_URL?.trim()) return null;

  return {
    databasePath: environment.DATABASE_URL,
    migrationsDirectory: resolve(
      environment.MIGRATIONS_DIRECTORY?.trim() || resolve(process.cwd(), 'drizzle')
    )
  };
};

export const runSqliteMigrateProductionCommand = ({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  execute = executeSqliteMigrateCommand,
  writeLine = (line: string) => console.log(line),
  setExitCode = (exitCode: number) => {
    process.exitCode = exitCode;
  }
}: {
  arguments_?: string[];
  environment?: MigrationEnvironment;
  execute?: typeof executeSqliteMigrateCommand;
  writeLine?: (line: string) => void;
  setExitCode?: (exitCode: number) => void;
} = {}) => {
  const configuration = parseConfiguration(arguments_, environment);
  if (!configuration) {
    writeLine('SQLite migration rejected: invalid configuration.');
    setExitCode(1);
    return { exitCode: 1 as const };
  }

  const result = execute(configuration);
  if (result.exitCode === 0) {
    writeLine('SQLite migration completed.');
  } else {
    writeLine('SQLite migration failed.');
  }
  setExitCode(result.exitCode);
  return result;
};
