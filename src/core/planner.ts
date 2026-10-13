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
  /** Cuisine tags, compared whole. */
  cuisines: readonly (string | undefined)[];
  /** Names, descriptions and non-cuisine tags, scanned for whole words and phrases. */
  text: readonly (string | undefined)[];
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True when `phrase` occurs as consecutive whole words in `ws`; the last word may take a plural s or es. */
function hasPhrase(ws: readonly string[], phrase: readonly string[]): boolean {
  const last = phrase.length - 1;
  for (let i = 0; i + last < ws.length; i++) {
    const hit = phrase.every((p, j) => {
      const w = ws[i + j];
      return w === p || (j === last && (w === `${p}s` || w === `${p}es`));
    });
    if (hit) return true;
  }
  return false;
}

/**
 * An exclusion that is a known cuisine matches cuisine tags only, so "chinese" does not drop a dish
 * described with Chinese broccoli. Any other exclusion matches a cuisine tag exactly or a whole word
 * or phrase in the text, so "fish" does not drop shellfish.
 */
export function isExcluded(prefs: DinnerPreferences, target: ExclusionTarget, cuisines: ReadonlySet<string>): boolean {
  if (prefs.exclusions.length === 0) return false;
  const tags = new Set(target.cuisines.filter((c): c is string => !!c).map((c) => c.toLowerCase()));
  let texts: string[][] | undefined;
  return prefs.exclusions.some((raw) => {
    const ex = raw.toLowerCase();
    if (tags.has(ex)) return true;
    if (cuisines.has(ex)) return false;
    const phrase = words(ex);
    if (phrase.length === 0) return false;
    texts ??= target.text.filter((t): t is string => !!t).map(words);
    return texts.some((ws) => hasPhrase(ws, phrase));
  });
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
