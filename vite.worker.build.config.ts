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
    ssr: 'src/lib/server/runScheduledDailySummaryWorkerCommand.ts',
    outDir: 'build/worker',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'runScheduledDailySummaryWorkerCommand.js'
      }
    }
  }
});
