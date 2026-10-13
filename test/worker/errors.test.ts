import { SELF } from 'cloudflare:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from '../../src/worker/index';
import { testEnv } from './env';

afterEach(() => {
  vi.restoreAllMocks();
});

function appThrowing(err: unknown): Hono {
  const app = new Hono();
  app.get('/boom', () => {
    throw err;
  });
  app.onError(handleError);
  return app;
}

describe('unexpected errors', () => {
  it('return a generic body and log the detail', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await testEnv.DB.prepare(
      `INSERT INTO sessions (id, zip_label, lat, lng, prefs, asked, created_at, updated_at)
       VALUES (?, '94110', 37.76, -122.41, 'not json', '[]', ?, ?)`,
    )
      .bind(id, now, now)
      .run();

    const res = await SELF.fetch(`http://example.com/api/session/${id}`);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal', message: 'Something went wrong. Try again.' });
    expect(logged).toHaveBeenCalled();
    expect(String(logged.mock.calls.flat().find((a) => a instanceof Error))).toMatch(/JSON/);
  });

  it('do not echo the thrown message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await appThrowing(new Error('D1_ERROR: no such column: secret_column')).request('/boom');

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret_column');
    expect(JSON.parse(text)).toEqual({ error: 'internal', message: 'Something went wrong. Try again.' });
  });
});

describe('deliberate HTTP errors', () => {
  it('keep their status and message in the API error shape, unlogged', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await appThrowing(new HTTPException(413, { message: 'That request is too large.' })).request('/boom');

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'http_error', message: 'That request is too large.' });
    expect(logged).not.toHaveBeenCalled();
  });

  it('return their own response when they carry one', async () => {
    const custom = Response.json({ error: 'too_large', message: 'Trim it down.' });
    const res = await appThrowing(new HTTPException(413, { res: custom })).request('/boom');

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large', message: 'Trim it down.' });
  });

  it('use the generic message when they have none', async () => {
    const res = await appThrowing(new HTTPException(400)).request('/boom');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'http_error', message: 'Something went wrong. Try again.' });
  });
});

describe('server-side HTTP errors', () => {
  it('keep their status but log the message instead of returning it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new HTTPException(503, { message: 'Cannot clone request: body was already consumed' });
    const res = await appThrowing(err).request('/boom');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'internal', message: 'Something went wrong. Try again.' });
    expect(logged).toHaveBeenCalledWith(err);
  });
});
