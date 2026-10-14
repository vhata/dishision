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

/** A diet marker found in the text. A weak one ("veggie") can also mean "with vegetables". */
interface Marker extends Span {
  weak: boolean;
}

/** A meat word found in the text; `implied` when it comes from a dish entry ("burger"), not a meat word. */
interface MeatSpan extends Span {
  implied: boolean;
}

/** Probe words that identify the marker entries; the marker vocabulary itself lives in the knowledge base. */
const STRONG_MARKER_PROBE = VEGETARIAN;
const WEAK_MARKER_PROBE = 'veggie';

/**
 * Diet-marker entries are vegetarian entries identified by a probe word. The strong entry recognises
 * "vegetarian" itself (with "vegan" and "plant-based"); the weak entry recognises "veggie" (with "veg"
 * and "veggies"), which menus also use for "with vegetables". Ingredient entries ("tofu", "vegetables")
 * tag vegetarian too but match neither probe, so they are not markers.
 */
function markerStrength(entry: LexiconEntry): 'strong' | 'weak' | undefined {
  if (!entry.proteins.includes(VEGETARIAN)) return undefined;
  if (regex(entry.pattern).test(STRONG_MARKER_PROBE)) return 'strong';
  if (regex(entry.pattern).test(WEAK_MARKER_PROBE)) return 'weak';
  return undefined;
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
 * words in between could be trusted. A weak marker overrides only meat that dish entries imply ("veggie
 * burger"), never a meat word ("veggie chicken pizza" is a chicken pizza with vegetables).
 */
function markerOverridesMeat(nameLength: number, text: string, markers: Marker[], meat: MeatSpan[]): boolean {
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
  const onlyImplied = sorted.every((s) => s.implied);
  return markers.some((m) => m.end + 1 === phrase.start && text[m.end] === ' ' && (!m.weak || onlyImplied));
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
  const markers: Marker[] = [];
  /** Every occurrence of a word that tags a meat protein, in the name or the description. */
  const meat: MeatSpan[] = [];

  for (const entry of kb.lexicon) {
    if (!regex(entry.pattern).test(text)) continue;
    hits.push(entry.pattern);
    for (const [key, value] of Object.entries(entry.scores) as [ScoreKey, number][]) {
      const current = scores[key];
      // Specific entries (those naming an archetype) win over generic ones; otherwise take the max.
      scores[key] = entry.archetypeId && current !== undefined ? value : Math.max(current ?? 0, value);
    }
    const found = spansOf(entry.pattern, text);
    const strength = markerStrength(entry);
    if (strength) {
      // A negated or hedged marker ("non-vegetarian", "vegan option") says nothing about the dish.
      const claims = found.filter((s) => isClaim(text, s));
      markers.push(...claims.map((s) => ({ ...s, weak: strength === 'weak' })));
      if (claims.length > 0) for (const p of entry.proteins) proteins.add(p);
    } else {
      for (const p of entry.proteins) proteins.add(p);
    }
    if (entry.proteins.some((p) => p !== VEGETARIAN)) meat.push(...found.map((s) => ({ ...s, implied: !!entry.archetypeId })));
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
