import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineProject } from 'vitest/config';

export default defineProject(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      name: 'worker',
      include: ['test/worker/**/*.test.ts'],
      setupFiles: ['./test/worker/apply-migrations.ts'],
      // Vitest 5 caches transformed modules on disk and hands the runner a
      // file path; workerd cannot read the host filesystem, so every worker
      // suite fails with "readAll: no such file or directory". Remove once
      // @cloudflare/vitest-plugin reads the cache in the Node pool
      // (cloudflare/workers-sdk#16163). See docs/DECISIONS.md.
      fsModuleCache: false,
    },
  };
});
