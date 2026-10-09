import { describe, expect, it } from 'vitest';
import { applyPatch, keywordParse, PreferencePatchSchema } from '../../src/core/otherText';
import { emptyPreferences } from '../../src/core/preferences';

describe('keywordParse', () => {
  it('reads a comfort-but-not-heavy sentence', () => {
    const p = keywordParse('Comforting but not too heavy, broth sounds great');
    expect(p.desiredQualities?.comforting).toBeGreaterThan(0);
    expect(p.heaviness).toBeLessThan(0);
    expect(p.desiredQualities?.brothy).toBe(1);
  });

  it('treats negations as exclusions, never as positive preferences', () => {
    const p = keywordParse('no pork, nothing fried');
    expect(p.exclusions).toEqual(expect.arrayContaining(['pork', 'fried']));
    expect(p.proteins?.pork).toBeUndefined();
    expect(p.desiredQualities?.crispy ?? 0).toBeLessThanOrEqual(0);
  });

  it('records recent and future meals with their cuisine', () => {
    const p = keywordParse('I had pho on Sunday and we are having Korean later this week');
    expect(p.recentMeals).toEqual(expect.arrayContaining(['pho', 'vietnamese']));
    expect(p.futureMeals).toEqual(expect.arrayContaining(['korean']));
    expect(p.cuisines?.korean).toBeUndefined();
  });

  it('picks up proteins, cuisines, carbs, hunger, novelty and budget', () => {
    const p = keywordParse("Salmon sounds especially good, maybe Thai. Rice is fine but no noodles. I'm starving. Surprise me. Under $25");
    expect(p.proteins?.seafood).toBeGreaterThan(0);
    expect(p.seafood?.salmon).toBe(1);
    expect(p.cuisines?.thai).toBeGreaterThan(0);
    expect(p.carbs?.rice).toBeGreaterThan(0);
    expect(p.carbs?.noodles).toBe(-1);
    expect(p.hunger).toBe('very_hungry');
    expect(p.novelty).toBeGreaterThan(0);
    expect(p.budgetMax).toBe(25);
  });

  it('always produces a schema-valid patch', () => {
    for (const text of ['', 'asdf', 'no', 'thai thai thai', '$$$ not hungry']) {
      expect(PreferencePatchSchema.safeParse(keywordParse(text)).success).toBe(true);
    }
  });
});

describe('applyPatch', () => {
  it('merges records, appends lists and sets scalars', () => {
    const prefs = applyPatch(emptyPreferences(), {
      desiredQualities: { brothy: 1 },
      proteins: { beef: 0.7 },
      exclusions: ['Pork'],
      recentMeals: ['pho'],
      heaviness: -0.5,
      budgetMax: 25,
    });
    expect(prefs.desiredQualities.brothy).toBe(1);
    expect(prefs.proteins.beef).toBe(0.7);
    expect(prefs.exclusions).toEqual(['pork']);
    expect(prefs.recentMeals).toEqual(['pho']);
    expect(prefs.heaviness).toBe(-0.5);
    expect(prefs.budget.max).toBe(25);
  });
});

describe('keywordParse on the avoid question', () => {
  it('reads bare cuisines and proteins as exclusions', () => {
    const p = keywordParse('sushi, and chinese', { intent: 'avoid' });
    expect(p.exclusions).toEqual(expect.arrayContaining(['japanese', 'chinese']));
    expect(p.cuisines).toBeUndefined();
    const q = keywordParse('pork', { intent: 'avoid' });
    expect(q.exclusions).toContain('pork');
    expect(q.proteins).toBeUndefined();
  });
});
