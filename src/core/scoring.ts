import { alignQualities } from './alignment';
import type { KnowledgeBase } from './kb/schema';
import { cuisineAffinity, desiredVector, isExcluded, proteinMatch } from './planner';
import type { DinnerPreferences, Hunger } from './preferences';
import type { MenuItem, RestaurantSummary, Scores } from './types';

export const WEIGHTS = { qualities: 0.45, protein: 0.2, cuisine: 0.1, restaurant: 0.1, portion: 0.05, archetype: 0.1 } as const;
export const PENALTIES = { tooRich: 0.25, tooStarchy: 0.25, tooSpicy: 0.2, repeatedCuisine: 0.2, carbAvoid: 0.15, menuless: 0.2 } as const;

const HUNGER_PORTION: Record<Hunger, number> = { light: 0.35, normal: 0.6, very_hungry: 0.85 };

export interface ScoreTrace {
  total: number;
  components: Record<string, number>;
  positiveSignals: Record<string, number>;
  penalties: Record<string, number>;
}

export interface ScoredItem {
  item: MenuItem;
  restaurant: RestaurantSummary;
  score: number;
  trace: ScoreTrace;
}

export interface ScoringContext {
  kb: KnowledgeBase;
  rejectedItemIds?: ReadonlySet<string>;
}

export type FilterReason = 'rejected' | 'excluded' | 'over_budget';

export function hardFilterReason(item: MenuItem, restaurant: RestaurantSummary, prefs: DinnerPreferences, ctx: ScoringContext): FilterReason | null {
  if (ctx.rejectedItemIds?.has(item.id)) return 'rejected';
  const words = [
    ...item.name.toLowerCase().split(/[^a-z]+/),
    ...(item.description ?? '').toLowerCase().split(/[^a-z]+/),
    item.tags.cuisine,
    restaurant.cuisine,
    item.tags.archetypeId,
    ...item.tags.proteins,
    ...item.tags.formats,
    ...item.tags.carbs,
  ];
  if (isExcluded(prefs, words)) return 'excluded';
  if (prefs.budget.max !== undefined && !prefs.budget.flexible && item.priceCents !== undefined && item.priceCents > prefs.budget.max * 100) {
    return 'over_budget';
  }
  return null;
}

export function restaurantQuality(r: RestaurantSummary): number {
  let q = 0.5;
  if (r.rating !== undefined) {
    const confidence = Math.min(1, (r.userRatingCount ?? 0) / 200);
    const normalized = Math.max(0, Math.min(1, (r.rating - 3) / 2));
    q = 0.5 + (normalized - 0.5) * confidence;
  }
  if (r.openNow === false) q -= 0.3;
  return Math.max(0, Math.min(1, q));
}

/** Mean closeness over keys both vectors define; 0.5 when they share none. */
export function similarity(a: Scores, b: Scores): number {
  let sum = 0;
  let n = 0;
  for (const [key, av] of Object.entries(a) as [keyof Scores, number][]) {
    const bv = b[key];
    if (bv === undefined) continue;
    sum += 1 - Math.abs(av - bv);
    n++;
  }
  return n === 0 ? 0.5 : sum / n;
}

function archetypeAffinity(kb: KnowledgeBase, prefs: DinnerPreferences, item: MenuItem): number {
  const liked = Object.entries(prefs.archetypes).filter(([, w]) => w > 0);
  if (liked.length === 0) return 0.5;
  let best = 0;
  for (const [id, w] of liked) {
    if (item.tags.archetypeId === id) return w;
    const a = kb.archetypes.find((x) => x.id === id);
    if (a && item.tags.cuisine === a.cuisine) best = Math.max(best, w * similarity(a.scores, item.scores));
  }
  return best;
}

export function scoreItem(item: MenuItem, restaurant: RestaurantSummary, prefs: DinnerPreferences, ctx: ScoringContext): ScoredItem | null {
  if (hardFilterReason(item, restaurant, prefs, ctx)) return null;

  const desired = desiredVector(prefs);
  const align = alignQualities(desired, item.scores);
  const components: Record<string, number> = {};
  const positiveSignals: Record<string, number> = {};
  const penalties: Record<string, number> = {};

  components.qualities = WEIGHTS.qualities * align.score;
  for (const [key, met] of Object.entries(align.signals)) if (met >= 0.6) positiveSignals[key] = met;

  const protein = proteinMatch(prefs, item.tags.proteins);
  components.protein = WEIGHTS.protein * (protein ?? 0.5);
  if (protein && protein > 0) positiveSignals.protein = protein;

  const cuisine = item.tags.cuisine ?? restaurant.cuisine;
  components.cuisine = WEIGHTS.cuisine * ((cuisineAffinity(prefs, cuisine) + 1) / 2);
  components.restaurant = WEIGHTS.restaurant * restaurantQuality(restaurant);

  const target = HUNGER_PORTION[prefs.hunger ?? 'normal'];
  const portion = item.scores.portion ?? 0.6;
  components.portion = WEIGHTS.portion * (1 - Math.min(1, Math.abs(portion - target) * 2));

  components.archetype = WEIGHTS.archetype * archetypeAffinity(ctx.kb, prefs, item);

  if ((prefs.heaviness ?? 0) <= -0.5 && (item.scores.rich ?? 0) >= 0.7) penalties.tooRich = PENALTIES.tooRich;
  if ((prefs.carbs.starchAsMain ?? 0) <= -0.5 && (item.scores.carbHeavy ?? 0) >= 0.7) penalties.tooStarchy = PENALTIES.tooStarchy;
  if ((desired.spicy ?? 0) <= -0.5 && (item.scores.spicy ?? 0) >= 0.7) penalties.tooSpicy = PENALTIES.tooSpicy;
  for (const carb of item.tags.carbs) {
    const w = prefs.carbs[carb as keyof typeof prefs.carbs];
    if (w !== undefined && w < 0) penalties[`avoid_${carb}`] = PENALTIES.carbAvoid * -w;
  }
  const repeats = [...prefs.recentMeals, ...prefs.futureMeals];
  if ((cuisine && repeats.includes(cuisine)) || (item.tags.archetypeId && repeats.includes(item.tags.archetypeId))) {
    penalties.repeatedCuisine = PENALTIES.repeatedCuisine;
  }
  if (item.menuless) penalties.menuless = PENALTIES.menuless;

  const positive = Object.values(components).reduce((s, v) => s + v, 0);
  const negative = Object.values(penalties).reduce((s, v) => s + v, 0);
  const total = positive - negative;
  return { item, restaurant, score: total, trace: { total, components, positiveSignals, penalties } };
}
