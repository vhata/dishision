import { env } from 'cloudflare:workers';
import type { D1Migration } from 'cloudflare:test';
import type { Env } from '../../src/worker/env';

export const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
