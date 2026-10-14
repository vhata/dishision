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

/** A negation just before a marker: "non-vegetarian", "not vegan", "no veggie". */
const NEGATED_BEFORE = /\b(?:non|not|no)[\s-]*$/;
/** A hedge just after a marker: "vegan-friendly", "veggie-style", "vegan option", "vegetarian available". */
const HEDGED_AFTER = /^(?:-|\s+(?:options?|optional|available|friendly|style|version|request|upon|possible|adaptable|alternative)\b)/;
/** Words that end a marker's reach because another component, an option or a negation follows. */
const BREAK_WORDS = new Set([
  'and',
  'with',
  'w',
  'or',
  'plus',
  'add',
  'adds',
  'added',
  'extra',
  'half',
  'side',
  'topped',
  'top',
  'served',
  'over',
  'on',
  'no',
  'not',
  'without',
  'sub',
  'swap',
  'choice',
]);
/** Words separated by single plain spaces; any other character ends a marker's reach. */
const PLAIN_GAP = /^(?: \p{L}+)* $/u;
const WORD = /\p{L}+/gu;

function isClaim(text: string, marker: Span): boolean {
  return !NEGATED_BEFORE.test(text.slice(0, marker.start)) && !HEDGED_AFTER.test(text.slice(marker.end));
}

/**
 * True when a marker in the name makes the meat the name implies a style, not an ingredient: "veggie
 * burger", "vegan fish tacos", "vegan fried chicken". Every meat word in the name and description must
 * form one phrase in the name, and a claiming marker must reach it over plain words that are all known
 * modifiers ("fried", "crispy", "double") and none of them a break word. A dish word between ("veggie
 * ramen chashu" is ramen with chashu) or an unknown one ("veggie supreme chicken pizza") keeps the meat.
 */
function markerOverridesMeat(nameLength: number, text: string, markers: Span[], meat: Span[], modifiers: Span[]): boolean {
  const sorted = [...meat].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  if (!first) return false;
  const phrase = { ...first };
  for (const s of sorted.slice(1)) {
    if (s.start >= phrase.end) return false;
    phrase.end = Math.max(phrase.end, s.end);
  }
  // The phrase must sit in the name. A marker after it, or in the description, leaves no gap of plain
  // words before it, so only a name marker can pass the gap test.
  if (phrase.end > nameLength) return false;
  return markers.some((m) => {
    const gap = text.slice(m.end, phrase.start);
    if (!PLAIN_GAP.test(gap)) return false;
    return [...gap.matchAll(WORD)].every((w) => {
      const start = m.end + w.index;
      const end = start + w[0].length;
      return !BREAK_WORDS.has(w[0]) && modifiers.some((d) => d.start <= start && d.end >= end);
    });
  });
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
  /** Occurrences of words that only adjust scores ("fried", "double"), with no protein, dish, cuisine or carb. */
  const modifiers: Span[] = [];

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
    else if (entry.proteins.length === 0 && !entry.archetypeId && !entry.cuisine && entry.carbs.length === 0) {
      modifiers.push(...found);
    }
    for (const c of entry.carbs) carbs.add(c);
    for (const f of entry.formats) formats.add(f);
    cuisine ??= entry.cuisine;
    archetypeId ??= entry.archetypeId;
  }

  // Meat wins over a vegetarian tag unless a name marker unambiguously makes it a style.
  if (proteins.has(VEGETARIAN) && [...proteins].some((p) => p !== VEGETARIAN)) {
    if (markerOverridesMeat(name.length, text, markers, meat, modifiers)) {
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
