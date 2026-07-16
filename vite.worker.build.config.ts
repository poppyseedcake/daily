import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      '$env/dynamic/private': fileURLToPath(
        new URL('./src/lib/server/workerPrivateEnvironment.ts', import.meta.url)
      ),
      '$app/environment': fileURLToPath(
        new URL('./src/lib/server/workerAppEnvironment.ts', import.meta.url)
      )
    }
  },
  build: {
    target: 'node22',
    ssr: true,
    outDir: 'build/worker',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        runScheduledDailySummaryWorkerCommand:
          'src/lib/server/runScheduledDailySummaryWorkerCommand.ts',
        runSqliteBackupCommand: 'src/lib/server/db/runSqliteBackupCommand.ts'
      },
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
});
