import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { testEnv } from './env';

describe('worker scaffold', () => {
  it('serves /api/health', async () => {
    const res = await SELF.fetch('http://example.com/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('has the sessions table after migrations', async () => {
    const row = await testEnv.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").first<{ name: string }>();
    expect(row?.name).toBe('sessions');
  });
});
