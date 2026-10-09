import { describe, expect, it } from 'vitest';
import { applyFeedback, FEEDBACK_REASONS } from '../../src/core/feedback';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const shown = { cuisine: 'thai', archetypeId: 'green_curry', totalPriceCents: 3000 };

describe('applyFeedback', () => {
  it('too_heavy lowers richness and sets not-heavy', () => {
    const p = applyFeedback(emptyPreferences(), 'too_heavy', shown);
    expect(p.heaviness).toBe(-0.5);
    expect(p.desiredQualities.rich).toBe(-0.5);
  });
  it('too_light raises richness', () => {
    expect(applyFeedback(emptyPreferences(), 'too_light', shown).heaviness).toBe(0.5);
  });
  it('too_boring and too_weird move novelty', () => {
    expect(applyFeedback(emptyPreferences(), 'too_boring', shown).novelty).toBe(0.5);
    expect(applyFeedback(emptyPreferences(), 'too_weird', shown).novelty).toBe(-0.5);
  });
  it('too_spicy lowers spice below zero', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.spicy', value: 0.7 }]);
    expect(applyFeedback(p, 'too_spicy', shown).desiredQualities.spicy).toBe(-0.5);
  });
  it('too_expensive tightens the budget to 80% of what was shown and drops flexibility', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'budget.flexible', value: 1 }]);
    const next = applyFeedback(p, 'too_expensive', shown);
    expect(next.budget.max).toBe(24);
    expect(next.budget.flexible).toBeUndefined();
  });
  it('too_much_starch sets starchAsMain to -1', () => {
    expect(applyFeedback(emptyPreferences(), 'too_much_starch', shown).carbs.starchAsMain).toBe(-1);
  });
  it('had_recently records the cuisine and archetype', () => {
    expect(applyFeedback(emptyPreferences(), 'had_recently', shown).recentMeals).toEqual(['green_curry', 'thai']);
  });
  it('not_that_cuisine marks the cuisine down', () => {
    expect(applyFeedback(emptyPreferences(), 'not_that_cuisine', shown).cuisines.thai).toBe(-1);
  });
  it('another changes nothing and never mutates input', () => {
    const base = emptyPreferences();
    expect(applyFeedback(base, 'another', shown)).toEqual(base);
    for (const reason of FEEDBACK_REASONS) applyFeedback(base, reason, shown);
    expect(base).toEqual(emptyPreferences());
  });
});
