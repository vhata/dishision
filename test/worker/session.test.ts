import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { SessionDto } from '../../src/shared/api';
import { testEnv } from './env';

async function post(path: string, body: unknown): Promise<Response> {
  return SELF.fetch(`http://example.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
async function create(): Promise<SessionDto> {
  const res = await post('/api/session?debug=1', { zip: '94110' });
  expect(res.status).toBe(201);
  return res.json();
}
async function answer(id: string, body: unknown): Promise<SessionDto> {
  const res = await post(`/api/session/${id}/answer?debug=1`, body);
  expect(res.status).toBe(200);
  return res.json();
}

describe('POST /api/session', () => {
  it('creates a session from a ZIP and returns the first question', async () => {
    const s = await create();
    expect(s.zipLabel).toBe('94110');
    expect(s.status).toBe('asking');
    expect(s.question?.nodeId).toBe('hunger');
    expect(s.question?.options.map((o) => o.id)).toEqual(['light', 'normal', 'very_hungry']);
  });

  it('accepts coordinates', async () => {
    const res = await post('/api/session', { lat: 37.76, lng: -122.41 });
    expect(res.status).toBe(201);
  });

  it('rejects malformed input', async () => {
    expect((await post('/api/session', { zip: '9411' })).status).toBe(400);
    expect((await post('/api/session', { lat: 100, lng: 0 })).status).toBe(400);
    expect((await post('/api/session', {})).status).toBe(400);
  });
});

describe('answers', () => {
  it('walks round one, applies effects and reaches ready', async () => {
    const s = await create();
    let cur = await answer(s.id, { kind: 'single', nodeId: 'hunger', optionId: 'normal' });
    expect(cur.question?.nodeId).toBe('feel');
    cur = await answer(s.id, { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'comforting', intensity: 1 }] });
    cur = await answer(s.id, { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] });
    cur = await answer(s.id, { kind: 'scale', nodeId: 'novelty', stop: 2 });
    cur = await answer(s.id, { kind: 'multi', nodeId: 'avoid', selections: [] });
    expect(cur.question?.nodeId).toBe('brothy');
    expect(cur.debug?.prefs.proteins.beef).toBe(1);
    for (let i = 0; i < 3 && cur.question; i++) {
      cur = await answer(s.id, { kind: cur.question.kind, nodeId: cur.question.nodeId });
    }
    expect(cur.status).toBe('ready');
    expect(cur.question).toBeNull();
  });

  it('merges Other text through the keyword fallback and records a note', async () => {
    const s = await create();
    const cur = await answer(s.id, { kind: 'single', nodeId: 'hunger', optionId: 'light', otherText: 'no pork, had pho on Sunday' });
    expect(cur.debug?.prefs.exclusions).toContain('pork');
    expect(cur.debug?.prefs.recentMeals).toContain('vietnamese');
    expect(cur.debug?.prefs.notes).toEqual(['no pork, had pho on sunday']);
    expect(cur.debug?.lastOtherParse?.source).toBe('keywords');
  });

  it('rejects answers for the wrong node or unknown options with 400', async () => {
    const s = await create();
    expect((await post(`/api/session/${s.id}/answer`, { kind: 'single', nodeId: 'hunger', optionId: 'ravenous' })).status).toBe(400);
    expect((await post(`/api/session/${s.id}/answer`, { kind: 'single', nodeId: 'nope', optionId: 'x' })).status).toBe(400);
    expect((await post(`/api/session/${s.id}/answer`, { kind: 'multi', nodeId: 'hunger', selections: [] })).status).toBe(400);
  });

  it('returns 404 for unknown sessions', async () => {
    expect((await SELF.fetch('http://example.com/api/session/does-not-exist')).status).toBe(404);
  });
});

describe('suggestions', () => {
  it('stores a suggestion and rate-limits after ten', async () => {
    const s = await create();
    for (let i = 0; i < 10; i++) {
      const res = await post(`/api/session/${s.id}/suggest`, { nodeId: 'avoid', text: `option ${i}` });
      expect(res.status).toBe(202);
    }
    expect((await post(`/api/session/${s.id}/suggest`, { nodeId: 'avoid', text: 'one too many' })).status).toBe(429);
    const row = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE session_id = ?1').bind(s.id).first<{ n: number }>();
    expect(row?.n).toBe(10);
  });

  it('rejects empty or very long suggestions', async () => {
    const s = await create();
    expect((await post(`/api/session/${s.id}/suggest`, { nodeId: 'avoid', text: 'x' })).status).toBe(400);
  });
});
