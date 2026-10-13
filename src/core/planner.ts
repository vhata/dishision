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

const cuisineCache = new WeakMap<KnowledgeBase, ReadonlySet<string>>();

/** Every cuisine an archetype or lexicon entry is tagged with; an exclusion in this set is a cuisine exclusion. */
export function knownCuisines(kb: KnowledgeBase): ReadonlySet<string> {
  let set = cuisineCache.get(kb);
  if (!set) {
    set = new Set([...kb.archetypes.map((a) => a.cuisine), ...kb.lexicon.flatMap((e) => (e.cuisine ? [e.cuisine] : []))]);
    cuisineCache.set(kb, set);
  }
  return set;
}

export interface ExclusionTarget {
  /** The dish's and restaurant's cuisine tags. */
  cuisines: readonly (string | undefined)[];
  /** Words and other tags that non-cuisine exclusions are matched against. */
  text: readonly (string | undefined)[];
}

/**
 * A cuisine exclusion (one in `cuisines`) matches a cuisine tag exactly, so "chinese" does not drop
 * a dish described with Chinese broccoli. Any other exclusion is a substring match over the tags and
 * text, so "fish" also drops shellfish, catfish and swordfish: over-excluding costs one dish, while
 * missing a ruled-out ingredient can serve an allergen.
 */
export function isExcluded(prefs: DinnerPreferences, target: ExclusionTarget, cuisines: ReadonlySet<string>): boolean {
  if (prefs.exclusions.length === 0) return false;
  const lower = (ws: readonly (string | undefined)[]) => ws.filter((w): w is string => !!w).map((w) => w.toLowerCase());
  const tags = lower(target.cuisines);
  const words = [...tags, ...lower(target.text)];
  return prefs.exclusions.some((ex) => (cuisines.has(ex) ? tags.includes(ex) : words.some((w) => w.includes(ex))));
}

export interface RankedArchetype {
  archetype: Archetype;
  score: number;
  signals: Record<string, number>;
}

export const ARCHETYPE_WEIGHTS = { align: 0.6, protein: 0.25, cuisine: 0.15, liked: 0.3, carbAvoid: 0.2 } as const;

export function scoreArchetype(a: Archetype, prefs: DinnerPreferences, cuisines: ReadonlySet<string>): RankedArchetype | null {
  if (isExcluded(prefs, { cuisines: [a.cuisine], text: [a.id, a.label, ...a.proteins, ...a.formats] }, cuisines)) return null;
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
  const cuisines = knownCuisines(kb);
  return kb.archetypes
    .map((a) => scoreArchetype(a, prefs, cuisines))
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
