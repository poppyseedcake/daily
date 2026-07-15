import { execFile as executeFileWithCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { executeSqliteRestoreCommand } from './sqliteRestoreCommand';

const executeFile = promisify(executeFileWithCallback);

type RestoreEnvironment = {
  DATABASE_URL?: string;
  DAILY_SERVICE_NAME?: string;
  READINESS_URL?: string;
};

type ProductionOperations = Pick<
  Parameters<typeof executeSqliteRestoreCommand>[0],
  | 'isDestinationOffline'
  | 'migrate'
  | 'startService'
  | 'verifyServiceActive'
  | 'verifyReadiness'
>;

const createProductionOperations = ({
  serviceName,
  readinessUrl
}: {
  serviceName: string;
  readinessUrl: string;
}): ProductionOperations => ({
  isDestinationOffline: async () => {
    const { stdout } = await executeFile('systemctl', [
      'show',
      '--property=ActiveState',
      '--value',
      serviceName
    ]);
    return stdout.trim() === 'inactive';
  },
  migrate: async () => {
    await executeFile('npm', ['run', 'db:migrate']);
  },
  startService: async () => {
    await executeFile('systemctl', ['start', serviceName]);
  },
  verifyServiceActive: async () => {
    await executeFile('systemctl', ['is-active', '--quiet', serviceName]);
  },
  verifyReadiness: async () => {
    const response = await fetch(readinessUrl);
    if (!response.ok || JSON.stringify(await response.json()) !== '{"status":"ok"}') {
      throw new Error('Readiness verification failed.');
    }
  }
});

export const runSqliteRestoreProductionCommand = async ({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  createOperations = createProductionOperations,
  execute = executeSqliteRestoreCommand,
  writeLine = (line: string) => console.log(line),
  setExitCode = (exitCode: number) => {
    process.exitCode = exitCode;
  }
}: {
  arguments_?: string[];
  environment?: RestoreEnvironment;
  createOperations?: typeof createProductionOperations;
  execute?: typeof executeSqliteRestoreCommand;
  writeLine?: (line: string) => void;
  setExitCode?: (exitCode: number) => void;
} = {}) => {
  const [recoveryPointDirectory, ...extraArguments] = arguments_;
  if (
    !recoveryPointDirectory?.trim() ||
    extraArguments.length > 0 ||
    !environment.DATABASE_URL?.trim() ||
    !environment.DAILY_SERVICE_NAME?.trim() ||
    !environment.READINESS_URL?.trim()
  ) {
    const result = { exitCode: 1 as const, failureClassification: 'invalid-configuration' as const };
    writeLine('SQLite restore rejected: invalid configuration.');
    setExitCode(1);
    return result;
  }

  const operations = createOperations({
    serviceName: environment.DAILY_SERVICE_NAME,
    readinessUrl: environment.READINESS_URL
  });
  const result = await execute({
    recoveryPointDirectory,
    activeDatabasePath: environment.DATABASE_URL,
    ...operations
  });
  if (result.exitCode === 0) {
    writeLine(`SQLite restore succeeded; replaced database preserved at ${result.replacedDatabasePath}`);
  } else {
    writeLine(`SQLite restore failed: ${result.failureClassification}.`);
  }
  setExitCode(result.exitCode);
  return result;
};
