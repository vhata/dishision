import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.core.config.ts', './vitest.worker.config.ts', './vitest.client.config.ts'],
  },
});
