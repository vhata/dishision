import type { KnowledgeBase } from './kb/schema';
import type { ItemTags, ScoreKey, Scores } from './types';

export interface TagResult {
  scores: Scores;
  tags: ItemTags;
  confidence: number;
  hits: string[];
}

export const LEXICON_CONFIDENT = 0.6;

const regexCache = new Map<string, RegExp>();
function regex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'i');
    regexCache.set(pattern, re);
  }
  return re;
}

export function tagItem(kb: KnowledgeBase, item: { name: string; description?: string }): TagResult {
  const text = `${item.name} ${item.description ?? ''}`.toLowerCase();
  const scores: Scores = {};
  const proteins = new Set<string>();
  const carbs = new Set<string>();
  const formats = new Set<string>();
  let cuisine: string | undefined;
  let archetypeId: string | undefined;
  const hits: string[] = [];

  for (const entry of kb.lexicon) {
    if (!regex(entry.pattern).test(text)) continue;
    hits.push(entry.pattern);
    for (const [key, value] of Object.entries(entry.scores) as [ScoreKey, number][]) {
      const current = scores[key];
      // Specific entries (those naming an archetype) win over generic ones; otherwise take the max.
      scores[key] = entry.archetypeId && current !== undefined ? value : Math.max(current ?? 0, value);
    }
    for (const p of entry.proteins) proteins.add(p);
    for (const c of entry.carbs) carbs.add(c);
    for (const f of entry.formats) formats.add(f);
    cuisine ??= entry.cuisine;
    archetypeId ??= entry.archetypeId;
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
