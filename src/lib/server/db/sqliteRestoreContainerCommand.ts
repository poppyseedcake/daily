import { executeSqliteMigrateCommand } from './sqliteMigrateCommand';
import { executeSqliteRestoreCommand } from './sqliteRestoreCommand';

type RestoreEnvironment = {
  DATABASE_URL?: string;
  DAILY_RESTORE_OFFLINE?: string;
  MIGRATIONS_DIRECTORY?: string;
  SCHEDULED_DELIVERY_ENABLED?: string;
};

const isTrue = (value: string | undefined) =>
  ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');

export const runSqliteRestoreContainerCommand = async ({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  execute = executeSqliteRestoreCommand,
  migrate = executeSqliteMigrateCommand,
  writeLine = (line: string) => console.log(line),
  setExitCode = (exitCode: number) => {
    process.exitCode = exitCode;
  }
}: {
  arguments_?: string[];
  environment?: RestoreEnvironment;
  execute?: typeof executeSqliteRestoreCommand;
  migrate?: typeof executeSqliteMigrateCommand;
  writeLine?: (line: string) => void;
  setExitCode?: (exitCode: number) => void;
} = {}) => {
  const [recoveryPointDirectory, ...extraArguments] = arguments_;
  if (
    !recoveryPointDirectory?.trim() ||
    extraArguments.length > 0 ||
    !environment.DATABASE_URL?.trim() ||
    !isTrue(environment.DAILY_RESTORE_OFFLINE) ||
    isTrue(environment.SCHEDULED_DELIVERY_ENABLED)
  ) {
    writeLine('SQLite container restore rejected: invalid offline configuration.');
    setExitCode(1);
    return { exitCode: 1 as const, failureClassification: 'invalid-configuration' as const };
  }

  const result = await execute({
    recoveryPointDirectory,
    activeDatabasePath: environment.DATABASE_URL,
    isDestinationOffline: async () => true,
    migrate: async () => {
      const migration = migrate({
        databasePath: environment.DATABASE_URL!,
        migrationsDirectory: environment.MIGRATIONS_DIRECTORY?.trim() || '/app/drizzle'
      });
      if (migration.exitCode !== 0) throw new Error('SQLite migration failed.');
    }
  });

  if (result.exitCode === 0) {
    writeLine(
      `SQLite container restore succeeded; keep Scheduled Delivery disabled and verify /health before accepting traffic.${
        result.replacedDatabasePath ? ` Replaced database preserved at ${result.replacedDatabasePath}.` : ''
      }`
    );
  } else {
    const recoveryLocation = result.replacedDatabasePath
      ? ` Replaced database preserved at ${result.replacedDatabasePath}.`
      : '';
    writeLine(`SQLite container restore failed: ${result.failureClassification}.${recoveryLocation}`);
  }
  setExitCode(result.exitCode);
  return result;
};
