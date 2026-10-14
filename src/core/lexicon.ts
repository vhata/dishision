import type { KnowledgeBase, LexiconEntry } from './kb/schema';
import type { ProteinKey } from './preferences';
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

/** The one protein tag that is not meat; every other protein tag contradicts it. */
const VEGETARIAN: ProteinKey = 'vegetarian';

interface Span {
  start: number;
  end: number;
}

function spansOf(pattern: string, text: string): Span[] {
  return [...text.matchAll(regex(pattern, 'gi'))].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

/**
 * Diet-marker entries are the vegetarian entries whose pattern recognises the word "vegetarian" itself;
 * their other words ("vegan", "veggie", "plant-based") live only in the knowledge base. Ingredient
 * entries ("tofu", "vegetables") tag vegetarian too but are not markers.
 */
function isMarkerEntry(entry: LexiconEntry): boolean {
  return entry.proteins.includes(VEGETARIAN) && regex(entry.pattern).test(VEGETARIAN);
}

/**
 * A negation just before a marker ("non-vegetarian", "not so vegan", "anti veggie", "ex-vegan"), or any
 * word joined to the marker by a hyphen or dash ("half-vegan"). \p{Pd} covers the Unicode dashes too.
 */
const NEGATED_BEFORE = /(?:\b(?:non|not|no|so|anti|ex)[\s\p{Pd}]*|\p{L}\p{Pd})$/u;
/** A hedge just after a marker: "vegan-friendly", "veggie-style", "vegan option", "vegetarian available". */
const HEDGED_AFTER = /^(?:\p{Pd}|\s+(?:options?|optional|available|friendly|style|version|request|upon|possible|adaptable|alternative)\b)/u;
function isClaim(text: string, marker: Span): boolean {
  return !NEGATED_BEFORE.test(text.slice(0, marker.start)) && !HEDGED_AFTER.test(text.slice(marker.end));
}

/**
 * True when a marker in the name makes the meat the name implies a style, not an ingredient: "veggie
 * burger", "vegan fish tacos". Every meat word in the name and description must form one phrase in the
 * name, and a claiming marker must immediately precede it, separated by one plain space. Any word between
 * ("vegan cheese chicken pizza", even "vegan fried chicken") keeps the meat, since no list of harmless
 * words in between could be trusted.
 */
function markerOverridesMeat(nameLength: number, text: string, markers: Span[], meat: Span[]): boolean {
  const sorted = [...meat].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  if (!first) return false;
  const phrase = { ...first };
  for (const s of sorted.slice(1)) {
    if (s.start >= phrase.end) return false;
    phrase.end = Math.max(phrase.end, s.end);
  }
  // The phrase must sit in the name, so only a marker in the name can sit right before it.
  if (phrase.end > nameLength) return false;
  return markers.some((m) => m.end + 1 === phrase.start && text[m.end] === ' ');
}

export function tagItem(kb: KnowledgeBase, item: { name: string; description?: string }): TagResult {
  const name = item.name.toLowerCase();
  const text = `${name} ${(item.description ?? '').toLowerCase()}`;
  const scores: Scores = {};
  const proteins = new Set<string>();
  const carbs = new Set<string>();
  const formats = new Set<string>();
  let cuisine: string | undefined;
  let archetypeId: string | undefined;
  const hits: string[] = [];
  /** Claiming diet markers, in the name or the description. */
  const markers: Span[] = [];
  /** Every occurrence of a word that tags a meat protein, in the name or the description. */
  const meat: Span[] = [];

  for (const entry of kb.lexicon) {
    if (!regex(entry.pattern).test(text)) continue;
    hits.push(entry.pattern);
    for (const [key, value] of Object.entries(entry.scores) as [ScoreKey, number][]) {
      const current = scores[key];
      // Specific entries (those naming an archetype) win over generic ones; otherwise take the max.
      scores[key] = entry.archetypeId && current !== undefined ? value : Math.max(current ?? 0, value);
    }
    const found = spansOf(entry.pattern, text);
    if (isMarkerEntry(entry)) {
      // A negated or hedged marker ("non-vegetarian", "vegan option") says nothing about the dish.
      const claims = found.filter((s) => isClaim(text, s));
      markers.push(...claims);
      if (claims.length > 0) for (const p of entry.proteins) proteins.add(p);
    } else {
      for (const p of entry.proteins) proteins.add(p);
    }
    if (entry.proteins.some((p) => p !== VEGETARIAN)) meat.push(...found);
    for (const c of entry.carbs) carbs.add(c);
    for (const f of entry.formats) formats.add(f);
    cuisine ??= entry.cuisine;
    archetypeId ??= entry.archetypeId;
  }

  // Meat wins over a vegetarian tag unless a name marker unambiguously makes it a style.
  if (proteins.has(VEGETARIAN) && [...proteins].some((p) => p !== VEGETARIAN)) {
    if (markerOverridesMeat(name.length, text, markers, meat)) {
      for (const p of [...proteins]) if (p !== VEGETARIAN) proteins.delete(p);
    } else {
      proteins.delete(VEGETARIAN);
    }
  }

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
