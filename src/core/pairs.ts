import { alignQualities } from './alignment';
import { desiredVector } from './planner';
import type { DinnerPreferences, Hunger } from './preferences';
import { scoreItem, WEIGHTS, type ScoredItem, type ScoreTrace, type ScoringContext } from './scoring';
import type { MenuItem, RestaurantSummary, ScoreKey, Scores } from './types';

/** Items with a smaller portion than this are sides: they may partner a main but never stand alone. */
export const SIDE_PORTION = 0.35;

export const PAIR = {
  topPerRestaurant: 4,
  margin: 0.05,
  bothHeavy: 0.2,
  bothStarchy: 0.2,
  sameDominant: 0.1,
  tooMuch: 0.2,
  portionCap: { light: 0.8, normal: 1.3, very_hungry: 1.8 } as Record<Hunger, number>,
} as const;

export interface Recommendation {
  kind: 'single' | 'pair';
  restaurant: RestaurantSummary;
  items: MenuItem[];
  score: number;
  trace: ScoreTrace;
  menuless: boolean;
}

export interface RestaurantCandidatesInput {
  restaurant: RestaurantSummary;
  items: MenuItem[];
}

const FLAVOR_KEYS: ScoreKey[] = ['brothy', 'spicy', 'rich', 'fresh', 'brightAcidic', 'crispy', 'savory', 'comforting'];

export function combineScores(a: Scores, b: Scores): Scores {
  const out: Scores = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<ScoreKey>) {
    const av = a[key];
    const bv = b[key];
    out[key] = av === undefined ? bv : bv === undefined ? av : Math.max(av, bv);
  }
  return out;
}

function dominant(scores: Scores): { key: ScoreKey; value: number } | null {
  let best: { key: ScoreKey; value: number } | null = null;
  for (const key of FLAVOR_KEYS) {
    const v = scores[key];
    if (v !== undefined && (!best || v > best.value)) best = { key, value: v };
  }
  return best;
}

function single(s: ScoredItem): Recommendation {
  return { kind: 'single', restaurant: s.restaurant, items: [s.item], score: s.score, trace: s.trace, menuless: !!s.item.menuless };
}

export function composePair(a: ScoredItem, b: ScoredItem, prefs: DinnerPreferences, _ctx: ScoringContext): Recommendation | null {
  if (a.restaurant.placeId !== b.restaurant.placeId) return null;
  if (a.item.menuless || b.item.menuless) return null;
  const total = (a.item.priceCents ?? 0) + (b.item.priceCents ?? 0);
  if (prefs.budget.max !== undefined && !prefs.budget.flexible && total > prefs.budget.max * 100) return null;

  const desired = desiredVector(prefs);
  const coverage = alignQualities(desired, combineScores(a.item.scores, b.item.scores));
  // Coverage rewards complementary dishes; averaging in each dish's own alignment stops a weak partner riding along for free.
  const ownA = (a.trace.components.qualities ?? 0) / WEIGHTS.qualities;
  const ownB = (b.trace.components.qualities ?? 0) / WEIGHTS.qualities;
  const quality = 0.5 * coverage.score + 0.25 * ownA + 0.25 * ownB;
  const components: Record<string, number> = { qualities: WEIGHTS.qualities * quality };
  for (const key of Object.keys(a.trace.components)) {
    if (key === 'qualities') continue;
    components[key] = ((a.trace.components[key] ?? 0) + (b.trace.components[key] ?? 0)) / 2;
  }
  if (a.trace.positiveSignals.protein || b.trace.positiveSignals.protein) {
    components.protein = WEIGHTS.protein * Math.max(a.trace.positiveSignals.protein ?? 0, b.trace.positiveSignals.protein ?? 0);
  }

  const penalties: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.trace.penalties)) penalties[k] = v;
  for (const [k, v] of Object.entries(b.trace.penalties)) penalties[k] = Math.max(penalties[k] ?? 0, v);
  if ((a.item.scores.rich ?? 0) >= 0.6 && (b.item.scores.rich ?? 0) >= 0.6) penalties.bothHeavy = PAIR.bothHeavy;
  if ((a.item.scores.carbHeavy ?? 0) >= 0.6 && (b.item.scores.carbHeavy ?? 0) >= 0.6) penalties.bothStarchy = PAIR.bothStarchy;
  const da = dominant(a.item.scores);
  const db = dominant(b.item.scores);
  if (da && db && da.key === db.key && da.value > 0.7 && db.value > 0.7) penalties.sameDominant = PAIR.sameDominant;
  const portion = (a.item.scores.portion ?? 0.6) + (b.item.scores.portion ?? 0.6);
  if (portion > PAIR.portionCap[prefs.hunger ?? 'normal']) penalties.tooMuch = PAIR.tooMuch;

  const positiveSignals: Record<string, number> = {};
  for (const [key, met] of Object.entries(coverage.signals)) if (met >= 0.6 && (desired[key] ?? 0) > 0) positiveSignals[key] = met;
  const protein = Math.max(a.trace.positiveSignals.protein ?? 0, b.trace.positiveSignals.protein ?? 0);
  if (protein > 0) positiveSignals.protein = protein;

  const score = Object.values(components).reduce((s, v) => s + v, 0) - Object.values(penalties).reduce((s, v) => s + v, 0);
  return {
    kind: 'pair',
    restaurant: a.restaurant,
    items: [a.item, b.item],
    score,
    trace: { total: score, components, positiveSignals, penalties },
    menuless: false,
  };
}

export function rankCandidates(candidates: RestaurantCandidatesInput[], prefs: DinnerPreferences, ctx: ScoringContext): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const { restaurant, items } of candidates) {
    const scored = items
      .map((item) => scoreItem(item, restaurant, prefs, ctx))
      .filter((s): s is ScoredItem => s !== null)
      .sort((x, y) => y.score - x.score);
    for (const s of scored) if ((s.item.scores.portion ?? 0.6) >= SIDE_PORTION) recs.push(single(s));
    const top = scored.filter((s) => !s.item.menuless).slice(0, PAIR.topPerRestaurant);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const pair = composePair(top[i]!, top[j]!, prefs, ctx);
        if (pair && pair.score > Math.max(top[i]!.score, top[j]!.score) + PAIR.margin) recs.push(pair);
      }
    }
  }
  return recs.sort((x, y) => y.score - x.score);
}

export interface RecommendResult {
  primary: Recommendation | null;
  runnerUp: Recommendation | null;
  ranked: Recommendation[];
}

function sharesItems(a: Recommendation, b: Recommendation): boolean {
  const ids = new Set(a.items.map((i) => i.id));
  return b.items.some((i) => ids.has(i.id));
}

export function recommend(candidates: RestaurantCandidatesInput[], prefs: DinnerPreferences, ctx: ScoringContext): RecommendResult {
  const ranked = rankCandidates(candidates, prefs, ctx);
  const primary = ranked[0] ?? null;
  if (!primary) return { primary: null, runnerUp: null, ranked };
  const runnerUp =
    ranked.find((r) => r.restaurant.placeId !== primary.restaurant.placeId && !sharesItems(r, primary)) ??
    ranked.find((r) => r !== primary && !sharesItems(r, primary)) ??
    null;
  return { primary, runnerUp, ranked };
}
