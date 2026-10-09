import { Hono } from 'hono';
import type { ZodError } from 'zod';
import type { KnowledgeBase } from '../../core/kb';
import { applyAnswer, deriveContext, initialState, nextQuestion } from '../../core/questions';
import type { QuestionDto, SessionDebug, SessionDto } from '../../shared/api';
import { getSession, insertSession, saveSession, type SessionRecord } from '../db/sessions';
import { countSuggestions, insertSuggestion } from '../db/suggestions';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { applyOther, parseOther } from '../other';
import { AnswerSchema, CreateSessionSchema, SuggestSchema } from '../validation';

export type AppContext = { Bindings: Env; Variables: { deps: Deps } };

export const MAX_SUGGESTIONS_PER_SESSION = 10;

export function toSessionDto(kb: KnowledgeBase, rec: SessionRecord, debug: boolean, extra?: Partial<SessionDebug>): SessionDto {
  const derived = deriveContext(kb, rec.state.prefs);
  const next = rec.status === 'asking' ? nextQuestion(kb, rec.state, derived) : null;
  const question: QuestionDto | null = next
    ? {
        nodeId: next.node.id,
        kind: next.node.kind,
        prompt: next.node.prompt,
        help: next.node.help,
        options: next.options.map((o) => ({ id: o.id, label: o.label })),
        stops: next.node.stops,
        allowMissingOption: next.node.allowMissingOption,
        round: next.node.round,
      }
    : null;
  const dto: SessionDto = { id: rec.id, zipLabel: rec.zipLabel, status: rec.status, question };
  if (debug) dto.debug = { prefs: rec.state.prefs, asked: rec.state.asked, round2Asked: rec.state.round2Asked, rejectedItemIds: rec.state.rejectedItemIds, ...extra };
  return dto;
}

const invalid = (issues: ZodError['issues']) => ({ error: 'invalid_request', issues });

export const sessionRoutes = new Hono<AppContext>();

sessionRoutes.post('/', async (c) => {
  const parsed = CreateSessionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { geocoder, kb } = c.get('deps');
  let point: { lat: number; lng: number; label: string } | null;
  if ('zip' in parsed.data) {
    point = await geocoder.geocodeZip(parsed.data.zip);
    if (!point) return c.json({ error: 'unknown_zip', message: 'Could not place that ZIP code.' }, 400);
  } else {
    point = { lat: parsed.data.lat, lng: parsed.data.lng, label: 'near you' };
  }
  const rec: SessionRecord = { id: crypto.randomUUID(), ownerId: null, zipLabel: point.label, lat: point.lat, lng: point.lng, status: 'asking', state: initialState() };
  await insertSession(c.env.DB, rec);
  return c.json(toSessionDto(kb, rec, c.req.query('debug') === '1'), 201);
});

sessionRoutes.get('/:id', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  return c.json(toSessionDto(c.get('deps').kb, rec, c.req.query('debug') === '1'));
});

sessionRoutes.post('/:id/answer', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  if (rec.status !== 'asking') return c.json({ error: 'not_asking', message: 'This session already has enough answers.' }, 409);
  const parsed = AnswerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  const { kb, llm } = c.get('deps');
  const answer = parsed.data;
  const node = kb.questions.find((n) => n.id === answer.nodeId);

  let state;
  try {
    state = applyAnswer(kb, rec.state, answer, deriveContext(kb, rec.state.prefs));
  } catch (err) {
    return c.json({ error: 'bad_answer', message: (err as Error).message }, 400);
  }

  let lastOtherParse: SessionDebug['lastOtherParse'];
  if (answer.otherText && answer.otherText.trim()) {
    const parse = await parseOther(llm, answer.otherText, node?.prompt ?? '');
    state = { ...state, prefs: applyOther(state.prefs, answer.otherText, parse) };
    lastOtherParse = { source: parse.source, patch: parse.patch };
  }

  const next = nextQuestion(kb, state, deriveContext(kb, state.prefs));
  const updated: SessionRecord = { ...rec, state, status: next ? 'asking' : 'ready' };
  await saveSession(c.env.DB, updated);
  return c.json(toSessionDto(kb, updated, c.req.query('debug') === '1', lastOtherParse ? { lastOtherParse } : undefined));
});

sessionRoutes.post('/:id/suggest', async (c) => {
  const rec = await getSession(c.env.DB, c.req.param('id'));
  if (!rec) return c.json({ error: 'not_found' }, 404);
  const parsed = SuggestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(invalid(parsed.error.issues), 400);
  if ((await countSuggestions(c.env.DB, rec.id)) >= MAX_SUGGESTIONS_PER_SESSION) {
    return c.json({ error: 'too_many_suggestions' }, 429);
  }
  await insertSuggestion(c.env.DB, { id: crypto.randomUUID(), sessionId: rec.id, nodeId: parsed.data.nodeId, text: parsed.data.text, prefs: rec.state.prefs });
  return c.json({ ok: true }, 202);
});
