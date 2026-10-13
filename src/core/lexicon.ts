import type { KnowledgeBase } from './kb/schema';
import { PROTEIN_KEYS } from './preferences';
import type { ItemTags, ScoreKey, Scores } from './types';

export interface TagResult {
  scores: Scores;
  tags: ItemTags;
  confidence: number;
  hits: string[];
}

export const LEXICON_CONFIDENT = 0.6;

const regexCache = new Map<string, RegExp>();
function regex(pattern: string, flags = 'i'): RegExp {
  const key = `${flags}/${pattern}`;
  let re = regexCache.get(key);
  if (!re) {
    re = new RegExp(pattern, flags);
    regexCache.set(key, re);
  }
  return re;
}

/** Proteins that contradict a vegetarian tag: every protein key except vegetarian itself. */
const MEAT_PROTEINS: readonly string[] = PROTEIN_KEYS.filter((p) => p !== 'vegetarian');

/** Words that declare the dish they modify meat-free, unlike ingredient words such as "tofu" or "vegetables". */
const DIET_MARKER = /\b(?:vegetarian|vegan|veggie|plant[- ]?based)\b/g;

/** Where a marker's reach ends: a conjunction or punctuation that starts another component of the dish. */
const PHRASE_BREAK = /\b(?:and|with|or|plus)\b|[,;:&+/()|.!]/;

/**
 * Spans of `text` a diet marker modifies, from just after each marker to the next phrase break or the
 * end of its field. "veggie burger" covers "burger"; "beef and veggie stir fry" covers only "stir fry".
 */
function markerSpans(fields: readonly { text: string; start: number }[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const { text, start } of fields) {
    for (const m of text.matchAll(DIET_MARKER)) {
      const from = m.index + m[0].length;
      const rest = text.slice(from);
      const brk = rest.search(PHRASE_BREAK);
      spans.push([start + from, start + from + (brk === -1 ? rest.length : brk)]);
    }
  }
  return spans;
}

/** True when every occurrence of the pattern sits inside a marker's span, so the marker overrides it. */
function onlyUnderMarker(pattern: string, text: string, spans: readonly [number, number][]): boolean {
  if (spans.length === 0) return false;
  let seen = false;
  for (const m of text.matchAll(regex(pattern, 'gi'))) {
    seen = true;
    const end = m.index + m[0].length;
    if (!spans.some(([from, to]) => m.index >= from && end <= to)) return false;
  }
  return seen;
}

export function tagItem(kb: KnowledgeBase, item: { name: string; description?: string }): TagResult {
  const name = item.name.toLowerCase();
  const text = `${name} ${(item.description ?? '').toLowerCase()}`;
  const spans = markerSpans([
    { text: name, start: 0 },
    { text: text.slice(name.length + 1), start: name.length + 1 },
  ]);
  const scores: Scores = {};
  const proteins = new Set<string>();
  const carbs = new Set<string>();
  const formats = new Set<string>();
  let cuisine: string | undefined;
  let archetypeId: string | undefined;
  const hits: string[] = [];
  /** Meat proteins named somewhere a diet marker does not reach. */
  const assertedMeat = new Set<string>();

  for (const entry of kb.lexicon) {
    if (!regex(entry.pattern).test(text)) continue;
    hits.push(entry.pattern);
    for (const [key, value] of Object.entries(entry.scores) as [ScoreKey, number][]) {
      const current = scores[key];
      // Specific entries (those naming an archetype) win over generic ones; otherwise take the max.
      scores[key] = entry.archetypeId && current !== undefined ? value : Math.max(current ?? 0, value);
    }
    for (const p of entry.proteins) proteins.add(p);
    const meat = entry.proteins.filter((p) => MEAT_PROTEINS.includes(p));
    if (meat.length > 0 && !onlyUnderMarker(entry.pattern, text, spans)) for (const p of meat) assertedMeat.add(p);
    for (const c of entry.carbs) carbs.add(c);
    for (const f of entry.formats) formats.add(f);
    cuisine ??= entry.cuisine;
    archetypeId ??= entry.archetypeId;
  }

  // Meat named only under a diet marker ("veggie burger", "vegan fish tacos") is the dish's style, not
  // its contents. Any other meat word wins over a vegetarian tag, whether that came from an ingredient
  // ("mapo tofu with minced pork") or from a marker on another component ("beef and veggie stir fry").
  for (const p of MEAT_PROTEINS) if (proteins.has(p) && !assertedMeat.has(p)) proteins.delete(p);
  if (MEAT_PROTEINS.some((p) => proteins.has(p))) proteins.delete('vegetarian');

  if (carbs.size > 0 && scores.carbHeavy === undefined) scores.carbHeavy = 0.6;
  if (carbs.size === 0 && scores.carbHeavy === undefined && hits.length > 0) scores.carbHeavy = 0.2;

  const breadth = Object.keys(scores).length;
  const confidence = hits.length === 0 ? 0 : Math.min(1, hits.length / 3) * (breadth >= 4 ? 1 : 0.6);

  return {
    scores,
    tags: { proteins: [...proteins], carbs: [...carbs], formats: [...formats], cuisine, archetypeId },
    confidence,
    hits,
  };
}
