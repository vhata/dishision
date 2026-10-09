import { explain } from '../core/explain';
import { withMenulessFallback } from '../core/fallback';
import { recommend, type Recommendation } from '../core/pairs';
import type { RecommendResponse, RecommendationDto } from '../shared/api';
import { insertRecommendation } from './db/recommendations';
import type { SessionRecord } from './db/sessions';
import type { Deps } from './deps';
import { orderLinks } from './links';

export const NO_MATCH_MESSAGE = 'Nothing nearby fits everything you ruled out. Loosen a restriction and try again.';

function toDto(rec: Recommendation, explanation: string, debug: boolean): RecommendationDto {
  return {
    kind: rec.kind,
    restaurant: rec.restaurant,
    items: rec.items.map((i) => ({ id: i.id, name: i.name, description: i.description, priceCents: i.priceCents, menuless: i.menuless, archetypeId: i.tags.archetypeId, cuisine: i.tags.cuisine })),
    score: rec.score,
    explanation,
    menuless: rec.menuless,
    links: orderLinks(rec.restaurant),
    trace: debug ? rec.trace : undefined,
  };
}

export async function produceRecommendation(deps: Deps, db: D1Database, rec: SessionRecord, debug: boolean): Promise<RecommendResponse> {
  const { kb, candidates } = deps;
  const prefs = rec.state.prefs;
  const raw = await candidates.candidates({ prefs, lat: rec.lat, lng: rec.lng, kb });
  const filled = withMenulessFallback(kb, raw, prefs);
  const result = recommend(filled, prefs, { kb, rejectedItemIds: new Set(rec.state.rejectedItemIds) });

  const debugInfo = debug
    ? {
        candidateRestaurants: filled.length,
        candidateItems: filled.reduce((n, c) => n + c.items.length, 0),
        rejectedItemIds: rec.state.rejectedItemIds,
        ranked: result.ranked.slice(0, 12).map((r) => ({ label: r.items.map((i) => i.name).join(' + '), restaurant: r.restaurant.name, score: Number(r.score.toFixed(3)) })),
      }
    : undefined;

  if (!result.primary) {
    return { recommendationId: null, primary: null, runnerUp: null, message: NO_MATCH_MESSAGE, debug: debugInfo };
  }

  const primary = toDto(result.primary, explain(result.primary, prefs, result.runnerUp), debug);
  const runnerUp = result.runnerUp ? toDto(result.runnerUp, explain(result.runnerUp, prefs), debug) : null;
  const id = crypto.randomUUID();
  await insertRecommendation(db, {
    id,
    sessionId: rec.id,
    payload: { primary: { ...primary, trace: undefined }, runnerUp: runnerUp ? { ...runnerUp, trace: undefined } : null },
    trace: { primary: result.primary.trace, runnerUp: result.runnerUp?.trace ?? null },
  });
  return { recommendationId: id, primary, runnerUp, debug: debugInfo };
}
