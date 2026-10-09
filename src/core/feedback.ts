import { clamp1, type DinnerPreferences } from './preferences';

export const FEEDBACK_REASONS = [
  'too_heavy', 'too_light', 'too_boring', 'too_weird', 'too_spicy', 'too_expensive', 'too_much_starch', 'had_recently', 'not_that_cuisine', 'another',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_LABELS: Record<FeedbackReason, string> = {
  too_heavy: 'Too heavy',
  too_light: 'Too light',
  too_boring: 'Too boring',
  too_weird: 'Too weird',
  too_spicy: 'Too spicy',
  too_expensive: 'Too expensive',
  too_much_starch: 'Too much starch',
  had_recently: 'Had that recently',
  not_that_cuisine: 'Not feeling that cuisine',
  another: 'Just show me another',
};

export interface ShownSummary {
  cuisine?: string;
  archetypeId?: string;
  totalPriceCents?: number;
}

function pushUnique(list: string[], v: string | undefined) {
  if (v && !list.includes(v)) list.push(v);
}

export function applyFeedback(prefs: DinnerPreferences, reason: FeedbackReason, shown: ShownSummary): DinnerPreferences {
  const p = structuredClone(prefs);
  const q = p.desiredQualities;
  switch (reason) {
    case 'too_heavy':
      p.heaviness = Math.min(p.heaviness ?? 0, -0.5);
      q.rich = clamp1((q.rich ?? 0) - 0.5);
      break;
    case 'too_light':
      p.heaviness = Math.max(p.heaviness ?? 0, 0.5);
      q.rich = clamp1((q.rich ?? 0) + 0.5);
      break;
    case 'too_boring':
      p.novelty = clamp1((p.novelty ?? 0) + 0.5);
      break;
    case 'too_weird':
      p.novelty = clamp1((p.novelty ?? 0) - 0.5);
      break;
    case 'too_spicy':
      q.spicy = clamp1(Math.min(q.spicy ?? 0, 0) - 0.5);
      break;
    case 'too_expensive':
      if (shown.totalPriceCents) p.budget.max = Math.floor((shown.totalPriceCents * 0.8) / 100);
      delete p.budget.flexible;
      break;
    case 'too_much_starch':
      p.carbs.starchAsMain = -1;
      break;
    case 'had_recently':
      pushUnique(p.recentMeals, shown.archetypeId);
      pushUnique(p.recentMeals, shown.cuisine);
      break;
    case 'not_that_cuisine':
      if (shown.cuisine) p.cuisines[shown.cuisine] = -1;
      break;
    case 'another':
      break;
  }
  return p;
}
