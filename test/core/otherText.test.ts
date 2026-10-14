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

  it('reads multi-word dishes as dishes before reading their words', () => {
    const p = keywordParse('hot pot sounds perfect');
    expect(p.desiredQualities?.spicy).toBeUndefined();
    expect(p.cuisines?.chinese).toBeGreaterThan(0);
    const q = keywordParse('maybe a hot dog');
    expect(q.desiredQualities?.spicy).toBeUndefined();
    expect(q.cuisines?.american).toBeGreaterThan(0);
    expect(keywordParse('something hot').desiredQualities?.spicy).toBeGreaterThan(0);
  });

  it('does not read a hand- compound as wanting something handheld', () => {
    const p = keywordParse('hand-pulled noodles would be great');
    expect(p.handheld).toBeUndefined();
    expect(p.carbs?.noodles).toBeGreaterThan(0);
    expect(keywordParse('something hand-held').handheld).toBeGreaterThan(0);
    expect(keywordParse('something I can eat with my hands').handheld).toBeGreaterThan(0);
  });

  it('skips articles when recording meals', () => {
    const p = keywordParse('had a burger last night');
    expect(p.recentMeals).toEqual(['burger']);
    expect(p.handheld).toBeUndefined();
    const q = keywordParse('we are having the pizza tomorrow');
    expect(q.futureMeals).toEqual(['italian']);
    expect(q.cuisines).toBeUndefined();
  });

  it('records multi-word meals whole', () => {
    const p = keywordParse('I had hot pot on Saturday');
    expect(p.recentMeals).toEqual(['hot pot', 'chinese']);
    expect(p.desiredQualities?.spicy).toBeUndefined();
    const q = keywordParse('getting banh mi tomorrow');
    expect(q.futureMeals).toEqual(['vietnamese']);
  });

  it('reads today as tonight, not as a planned meal', () => {
    const p = keywordParse('eating light today');
    expect(p.futureMeals).toBeUndefined();
    expect(p.heaviness).toBeLessThan(0);
    expect(keywordParse('having sushi on Friday').futureMeals).toEqual(['japanese']);
    expect(keywordParse('having sushi friday').futureMeals).toEqual(['japanese']);
  });

  it('records a plural dish as the dish and its cuisine', () => {
    expect(keywordParse('had burritos').recentMeals).toEqual(['burrito', 'mexican']);
    expect(keywordParse('had pizzas last night').recentMeals).toEqual(['pizza', 'italian']);
    expect(keywordParse('had kebabs').recentMeals).toEqual(['kebab', 'middle_eastern']);
    expect(keywordParse('having burritos tomorrow').futureMeals).toEqual(['mexican']);
  });

  it('does not read a longer word that starts with a dish as that dish', () => {
    expect(keywordParse('had pokemon').recentMeals).toEqual(['pokemon']);
    expect(keywordParse('had currywurst').recentMeals).toEqual(['currywurst']);
  });

  it('reads only a known dish phrase as a two-word planned meal', () => {
    const p = keywordParse('eating something light later');
    expect(p.futureMeals).toBeUndefined();
    expect(p.heaviness).toBe(-0.5);
    const q = keywordParse('having something spicy tomorrow');
    expect(q.futureMeals).toBeUndefined();
    expect(q.desiredQualities?.spicy).toBe(0.7);
    expect(keywordParse('having a big dinner later')).toEqual({});
  });

  it('prefers the longer of two overlapping dish phrases', () => {
    expect(keywordParse('thai curry sounds good').cuisines).toEqual({ thai: 0.5 });
    expect(keywordParse('had thai curry').recentMeals).toEqual(['thai curry', 'thai']);
  });

  it('does not read a vague or past day as a planned meal', () => {
    expect(keywordParse('having pizza someday').futureMeals).toBeUndefined();
    expect(keywordParse('having pizza yesterday').futureMeals).toBeUndefined();
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
