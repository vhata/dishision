import type { KnowledgeBase } from './kb/schema';
import type { RestaurantCandidatesInput } from './pairs';
import { rankArchetypes } from './planner';
import type { DinnerPreferences } from './preferences';
import type { MenuItem, RestaurantSummary } from './types';

/** A placeholder "dish" for a restaurant whose menu has not been read: its cuisine's best-matching archetype. */
export function menulessItems(kb: KnowledgeBase, restaurant: RestaurantSummary, prefs: DinnerPreferences): MenuItem[] {
  if (!restaurant.cuisine) return [];
  const best = rankArchetypes(kb, prefs).find((r) => r.archetype.cuisine === restaurant.cuisine);
  if (!best) return [];
  const a = best.archetype;
  return [
    {
      id: `menuless:${restaurant.placeId}:${a.id}`,
      placeId: restaurant.placeId,
      name: a.label,
      scores: a.scores,
      tags: { proteins: a.proteins, carbs: a.carbs, formats: a.formats, cuisine: a.cuisine, archetypeId: a.id },
      menuless: true,
    },
  ];
}

export function withMenulessFallback(kb: KnowledgeBase, candidates: RestaurantCandidatesInput[], prefs: DinnerPreferences): RestaurantCandidatesInput[] {
  return candidates.map((c) => (c.items.length > 0 ? c : { ...c, items: menulessItems(kb, c.restaurant, prefs) }));
}
