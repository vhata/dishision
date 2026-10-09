import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RecommendResponse, SessionDto } from '../../src/shared/api';
import { testEnv } from './env';

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await SELF.fetch(`http://example.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
}

async function readySession(extraAvoid: string[] = []): Promise<string> {
  const created = await post<SessionDto>('/api/session', { zip: '94110' });
  const id = created.body.id;
  let cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'single', nodeId: 'hunger', optionId: 'normal' })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'comforting', intensity: 1 }] })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'scale', nodeId: 'novelty', stop: 2 })).body;
  cur = (await post<SessionDto>(`/api/session/${id}/answer`, { kind: 'multi', nodeId: 'avoid', selections: extraAvoid.map((optionId) => ({ optionId, intensity: 1 as const })) })).body;
  while (cur.question) {
    const q = cur.question;
    const answer = q.nodeId === 'brothy' ? { kind: 'yesno', nodeId: q.nodeId, value: 'yes' } : q.nodeId === 'heaviness' ? { kind: 'scale', nodeId: q.nodeId, stop: 1 } : { kind: q.kind, nodeId: q.nodeId, ...(q.kind === 'multi' ? { selections: [] } : {}) };
    cur = (await post<SessionDto>(`/api/session/${id}/answer`, answer)).body;
  }
  expect(cur.status).toBe('ready');
  return id;
}

describe('POST /api/session/:id/recommend', () => {
  it('refuses while still asking unless forced', async () => {
    const created = await post<SessionDto>('/api/session', { zip: '94110' });
    expect((await post(`/api/session/${created.body.id}/recommend`, {})).status).toBe(409);
    const forced = await post<RecommendResponse>(`/api/session/${created.body.id}/recommend`, { force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.primary).not.toBeNull();
  });

  it('returns a grounded primary and a runner-up from another restaurant', async () => {
    const id = await readySession();
    const { status, body } = await post<RecommendResponse>(`/api/session/${id}/recommend?debug=1`, {});
    expect(status).toBe(200);
    expect(body.primary).not.toBeNull();
    expect(body.primary!.explanation).toContain(body.primary!.items[0]!.name);
    expect(body.primary!.links.doordash).toContain('doordash.com');
    expect(body.primary!.trace).toBeDefined();
    expect(body.runnerUp?.restaurant.placeId).not.toBe(body.primary!.restaurant.placeId);
    expect(body.debug?.ranked.length).toBeGreaterThan(0);
    const row = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM recommendations WHERE session_id = ?1').bind(id).first<{ n: number }>();
    expect(row?.n).toBe(1);
    const session = (await SELF.fetch(`http://example.com/api/session/${id}`).then((r) => r.json())) as SessionDto;
    expect(session.status).toBe('recommended');
  });

  it('answers with a message, not an error, when everything is excluded', async () => {
    const id = await readySession(['japanese', 'chinese', 'thai', 'vietnamese', 'korean', 'indian', 'mexican', 'italian', 'american', 'middle_eastern']);
    const { status, body } = await post<RecommendResponse>(`/api/session/${id}/recommend`, {});
    expect(status).toBe(200);
    expect(body.primary).toBeNull();
    expect(body.message).toMatch(/Loosen a restriction/);
  });
});

describe('POST /api/session/:id/feedback', () => {
  it('reranks with the reason applied and never repeats shown items', async () => {
    const id = await readySession();
    const first = (await post<RecommendResponse>(`/api/session/${id}/recommend`, {})).body;
    const seen = new Set(first.primary!.items.map((i) => i.id));
    let last = first;
    for (const reason of ['too_heavy', 'another', 'another', 'another', 'another', 'another'] as const) {
      const res = await post<RecommendResponse>(`/api/session/${id}/feedback`, { reason });
      expect(res.status).toBe(200);
      last = res.body;
      if (!last.primary) break;
      for (const item of last.primary.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
    }
    const row = await testEnv.DB.prepare('SELECT feedback_reason FROM recommendations WHERE session_id = ?1 ORDER BY created_at ASC LIMIT 1').bind(id).first<{ feedback_reason: string }>();
    expect(row?.feedback_reason).toBe('too_heavy');
  });

  it('rejects unknown reasons and sessions without a recommendation', async () => {
    const id = await readySession();
    expect((await post(`/api/session/${id}/feedback`, { reason: 'too_purple' })).status).toBe(400);
    expect((await post(`/api/session/${id}/feedback`, { reason: 'another' })).status).toBe(409);
  });
});

describe('feedback details', () => {
  it('carries the shown dish archetype and cuisine into had_recently', async () => {
    const id = await readySession();
    const first = (await post<RecommendResponse>(`/api/session/${id}/recommend`, {})).body;
    const shown = first.primary!.items[0]!;
    expect(shown.archetypeId).toBeTruthy();
    const res = await post<RecommendResponse>(`/api/session/${id}/feedback?debug=1`, { reason: 'had_recently' });
    expect(res.status).toBe(200);
    const session = (await SELF.fetch(`http://example.com/api/session/${id}?debug=1`).then((r) => r.json())) as SessionDto;
    expect(session.debug?.prefs.recentMeals).toContain(shown.archetypeId);
    expect(session.debug?.prefs.recentMeals).toContain(first.primary!.restaurant.cuisine);
  });

  it('refuses further feedback once candidates are exhausted instead of mutating preferences again', async () => {
    const id = await readySession(['japanese', 'chinese', 'thai', 'vietnamese', 'korean', 'indian', 'mexican', 'italian', 'middle_eastern']);
    let res = await post<RecommendResponse>(`/api/session/${id}/recommend`, {});
    expect(res.body.primary).not.toBeNull();
    let rounds = 0;
    while (res.body.primary && rounds < 20) {
      res = await post<RecommendResponse>(`/api/session/${id}/feedback`, { reason: 'another' });
      rounds++;
    }
    expect(res.status).toBe(200);
    expect(res.body.primary).toBeNull();
    const again = await post<RecommendResponse>(`/api/session/${id}/feedback`, { reason: 'too_heavy' });
    expect(again.status).toBe(409);
  });
});
