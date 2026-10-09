import { alignQualities, type DesireVector } from './alignment';
import type { Archetype, KnowledgeBase } from './kb/schema';
import type { DinnerPreferences } from './preferences';

export function desiredVector(prefs: DinnerPreferences): DesireVector {
  const d: DesireVector = { ...prefs.desiredQualities };
  if (d.rich === undefined && prefs.heaviness !== undefined) d.rich = prefs.heaviness;
  if (prefs.handheld !== undefined) d.handheld = prefs.handheld;
  if (prefs.novelty !== undefined) d.adventurous = prefs.novelty;
  if (prefs.carbs.starchAsMain !== undefined) d.carbHeavy = prefs.carbs.starchAsMain;
  return d;
}

/** 0..1 match against positive protein preferences, or null when the user has none. */
export function proteinMatch(prefs: DinnerPreferences, proteins: readonly string[]): number | null {
  const wanted = Object.entries(prefs.proteins).filter(([, w]) => (w ?? 0) > 0);
  if (wanted.length === 0) return null;
  let best = 0;
  for (const p of proteins) {
    const w = prefs.proteins[p as keyof typeof prefs.proteins] ?? 0;
    if (w > best) best = w;
  }
  return best;
}

export function cuisineAffinity(prefs: DinnerPreferences, cuisine: string | undefined): number {
  if (!cuisine) return 0;
  return prefs.cuisines[cuisine] ?? 0;
}

export function isExcluded(prefs: DinnerPreferences, words: readonly (string | undefined)[]): boolean {
  if (prefs.exclusions.length === 0) return false;
  const lowered = words.filter((w): w is string => !!w).map((w) => w.toLowerCase());
  return prefs.exclusions.some((ex) => lowered.some((w) => w === ex || w.includes(ex)));
}

export interface RankedArchetype {
  archetype: Archetype;
  score: number;
  signals: Record<string, number>;
}

export const ARCHETYPE_WEIGHTS = { align: 0.6, protein: 0.25, cuisine: 0.15, liked: 0.3, carbAvoid: 0.2 } as const;

export function scoreArchetype(a: Archetype, prefs: DinnerPreferences): RankedArchetype | null {
  if (isExcluded(prefs, [a.cuisine, a.id, a.label, ...a.proteins, ...a.formats])) return null;
  const align = alignQualities(desiredVector(prefs), a.scores);
  const protein = proteinMatch(prefs, a.proteins);
  const cuisine = (cuisineAffinity(prefs, a.cuisine) + 1) / 2;
  const liked = prefs.archetypes[a.id] ?? 0;
  let score =
    ARCHETYPE_WEIGHTS.align * align.score +
    ARCHETYPE_WEIGHTS.protein * (protein ?? 0.5) +
    ARCHETYPE_WEIGHTS.cuisine * cuisine +
    ARCHETYPE_WEIGHTS.liked * liked;
  for (const carb of a.carbs) {
    const w = prefs.carbs[carb as keyof typeof prefs.carbs];
    if (w !== undefined && w < 0) score += ARCHETYPE_WEIGHTS.carbAvoid * w;
  }
  return { archetype: a, score, signals: align.signals };
}

export function rankArchetypes(kb: KnowledgeBase, prefs: DinnerPreferences): RankedArchetype[] {
  return kb.archetypes
    .map((a) => scoreArchetype(a, prefs))
    .filter((r): r is RankedArchetype => r !== null)
    .sort((x, y) => y.score - x.score);
}

export const PLAUSIBLE_THRESHOLD = 0.55;

export function plausibleArchetypes(kb: KnowledgeBase, prefs: DinnerPreferences): Archetype[] {
  return rankArchetypes(kb, prefs)
    .filter((r) => r.score >= PLAUSIBLE_THRESHOLD)
    .map((r) => r.archetype);
}

export function planQueries(kb: KnowledgeBase, prefs: DinnerPreferences, max = 5): string[] {
  const out: string[] = [];
  for (const r of rankArchetypes(kb, prefs)) {
    const term = r.archetype.searchTerms[0];
    if (term && !out.includes(term)) out.push(term);
    if (out.length >= max) break;
  }
  return out;
}
