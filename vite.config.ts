import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    external: ['@opentelemetry/api']
  },
  test: {
    include: ['src/**/*.test.ts']
  }
});
