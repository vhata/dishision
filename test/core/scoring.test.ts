import { describe, expect, it } from 'vitest';
import { fixtureCandidates } from '../../fixtures/sf';
import { loadBaseKb } from '../../src/core/kb';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { hardFilterReason, restaurantQuality, scoreItem, similarity } from '../../src/core/scoring';
import type { MenuItem, RestaurantSummary } from '../../src/core/types';

const kb = loadBaseKb();
const ctx = { kb };

const phoHouse: RestaurantSummary = {
  placeId: 'r1',
  name: 'Pho House',
  cuisine: 'vietnamese',
  rating: 4.5,
  userRatingCount: 800,
  openNow: true,
};
const burgerBarn: RestaurantSummary = {
  placeId: 'r2',
  name: 'Burger Barn',
  cuisine: 'american',
  rating: 4.5,
  userRatingCount: 800,
  openNow: true,
};

const pho: MenuItem = {
  id: 'pho',
  placeId: 'r1',
  name: 'Pho Tai',
  description: 'Rare beef noodle soup',
  priceCents: 1600,
  scores: {
    brothy: 0.95,
    comforting: 0.8,
    rich: 0.3,
    spicy: 0.3,
    brightAcidic: 0.5,
    savory: 0.8,
    proteinForward: 0.6,
    carbHeavy: 0.5,
    adventurous: 0.2,
    handheld: 0,
    portion: 0.6,
  },
  tags: { proteins: ['beef'], carbs: ['noodles'], cuisine: 'vietnamese', formats: ['bowl'], archetypeId: 'pho' },
};
const burger: MenuItem = {
  id: 'burger',
  placeId: 'r2',
  name: 'Double Cheeseburger',
  priceCents: 1500,
  scores: {
    rich: 0.9,
    comforting: 0.9,
    handheld: 1,
    savory: 0.9,
    proteinForward: 0.6,
    carbHeavy: 0.5,
    adventurous: 0.05,
    portion: 0.8,
    brothy: 0,
  },
  tags: { proteins: ['beef'], carbs: ['bread'], cuisine: 'american', formats: ['sandwich'], archetypeId: 'burger' },
};

const comfortBrothBeefNotHeavy = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.comforting', value: 0.8 },
  { path: 'desiredQualities.brothy', value: 1 },
  { path: 'heaviness', value: -0.5 },
  { path: 'proteins.beef', value: 1 },
]);

describe('scoreItem', () => {
  it('prefers pho to a burger for comfort, broth, beef, not heavy', () => {
    const a = scoreItem(pho, phoHouse, comfortBrothBeefNotHeavy, ctx)!;
    const b = scoreItem(burger, burgerBarn, comfortBrothBeefNotHeavy, ctx)!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.trace.positiveSignals.brothy).toBeGreaterThanOrEqual(0.9);
    expect(a.trace.positiveSignals.protein).toBe(1);
    expect(b.trace.penalties.tooRich).toBeGreaterThan(0);
    expect(a.trace.penalties.tooRich).toBeUndefined();
  });

  it('penalises starch-heavy dishes when starch should stay on the side', () => {
    const prefs = applyEffects(emptyPreferences(), [{ path: 'carbs.starchAsMain', value: -1 }]);
    const riceBowl: MenuItem = {
      ...burger,
      id: 'bowl',
      name: 'Rice bowl',
      scores: { ...burger.scores, carbHeavy: 0.85 },
      tags: { ...burger.tags, carbs: ['rice'] },
    };
    expect(scoreItem(riceBowl, burgerBarn, prefs, ctx)!.trace.penalties.tooStarchy).toBeGreaterThan(0);
  });

  it('penalises a specific carb the user turned down', () => {
    const prefs = applyEffects(emptyPreferences(), [{ path: 'carbs.noodles', value: -1 }]);
    expect(scoreItem(pho, phoHouse, prefs, ctx)!.trace.penalties.avoid_noodles).toBeGreaterThan(0);
  });

  it('penalises cuisines eaten recently or planned soon', () => {
    const recent = applyEffects(emptyPreferences(), [{ path: 'recentMeals', value: 'vietnamese' }]);
    const planned = applyEffects(emptyPreferences(), [{ path: 'futureMeals', value: 'pho' }]);
    expect(scoreItem(pho, phoHouse, recent, ctx)!.trace.penalties.repeatedCuisine).toBeGreaterThan(0);
    expect(scoreItem(pho, phoHouse, planned, ctx)!.trace.penalties.repeatedCuisine).toBeGreaterThan(0);
  });

  it('discounts menuless placeholders', () => {
    const placeholder: MenuItem = { ...pho, id: 'ph', menuless: true };
    expect(scoreItem(placeholder, phoHouse, comfortBrothBeefNotHeavy, ctx)!.score).toBeLessThan(
      scoreItem(pho, phoHouse, comfortBrothBeefNotHeavy, ctx)!.score,
    );
  });

  it('returns a result for empty preferences', () => {
    const r = scoreItem(pho, phoHouse, emptyPreferences(), ctx);
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThan(0);
  });
});

describe('hardFilterReason', () => {
  it('filters excluded cuisines, words and formats', () => {
    const noViet = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'vietnamese' }]);
    const noFried = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'fried' }]);
    expect(hardFilterReason(pho, phoHouse, noViet, ctx)).toBe('excluded');
    expect(hardFilterReason({ ...burger, name: 'Fried Chicken Sandwich' }, burgerBarn, noFried, ctx)).toBe('excluded');
    expect(hardFilterReason(burger, burgerBarn, noViet, ctx)).toBeNull();
  });

  it('keeps a dish whose description names an excluded cuisine', () => {
    const siam = fixtureCandidates(kb).find((c) => c.restaurant.placeId === 'siam_kitchen')!;
    const padSeeEw = siam.items.find((i) => i.id === 'siam_pad_see_ew')!;
    expect(padSeeEw.description).toMatch(/Chinese broccoli/);
    const noChinese = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'chinese' }]);
    expect(hardFilterReason(padSeeEw, siam.restaurant, noChinese, ctx)).toBeNull();

    const melt: MenuItem = {
      ...burger,
      id: 'melt',
      name: 'Bulgogi Melt',
      description: 'Bulgogi and American cheese',
      tags: { ...burger.tags, cuisine: 'korean' },
    };
    const seoul: RestaurantSummary = { ...burgerBarn, placeId: 'r3', name: 'Seoul Garden', cuisine: 'korean' };
    const noAmerican = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'american' }]);
    expect(hardFilterReason(melt, seoul, noAmerican, ctx)).toBeNull();
    expect(hardFilterReason(melt, burgerBarn, noAmerican, ctx)).toBe('excluded');
    expect(hardFilterReason({ ...melt, tags: { ...melt.tags, cuisine: 'american' } }, seoul, noAmerican, ctx)).toBe('excluded');
  });

  it('matches ingredient exclusions as substrings of words in the name and description', () => {
    const noFish = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'fish' }]);
    const dish = (name: string, description: string): MenuItem => ({
      ...pho,
      id: name,
      name,
      description,
      tags: { ...pho.tags, archetypeId: undefined },
    });
    expect(hardFilterReason(dish('Shellfish Platter', 'Shrimp, clams and mussels'), phoHouse, noFish, ctx)).toBe('excluded');
    expect(hardFilterReason(dish('Catfish Po Boy', 'Cornmeal-crusted on a roll'), phoHouse, noFish, ctx)).toBe('excluded');
    expect(hardFilterReason(dish('Grilled Swordfish', 'With salsa verde'), phoHouse, noFish, ctx)).toBe('excluded');
    expect(hardFilterReason(dish('Pho Tai', 'Rare beef noodle soup'), phoHouse, noFish, ctx)).toBeNull();
    const noNuts = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'nut' }]);
    expect(hardFilterReason(dish('Beet Salad', 'Goat cheese and candied walnuts'), phoHouse, noNuts, ctx)).toBe('excluded');
  });

  it('matches non-cuisine exclusions against the protein, format, carb and archetype tags', () => {
    const bunCha: MenuItem = {
      ...pho,
      id: 'bun_cha',
      name: 'Bun Cha',
      description: 'Grilled patties, herbs and dipping sauce',
      tags: { proteins: ['pork'], carbs: ['noodles'], cuisine: 'vietnamese', formats: ['bowl'], archetypeId: 'grilled_patties' },
    };
    const without = (value: string) =>
      hardFilterReason(bunCha, phoHouse, applyEffects(emptyPreferences(), [{ path: 'exclusions', value }]), ctx);
    expect(without('pork')).toBe('excluded');
    expect(without('noodles')).toBe('excluded');
    expect(without('bowl')).toBe('excluded');
    expect(
      hardFilterReason(
        { ...bunCha, tags: { ...bunCha.tags, archetypeId: 'bun_cha_hanoi' } },
        phoHouse,
        applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'hanoi' }]),
        ctx,
      ),
    ).toBe('excluded');
    expect(without('beef')).toBeNull();
  });

  it('filters over-budget items unless the budget is flexible', () => {
    const tight = applyEffects(emptyPreferences(), [{ path: 'budget.max', value: 12 }]);
    const flexible = applyEffects(tight, [{ path: 'budget.flexible', value: 1 }]);
    expect(hardFilterReason(pho, phoHouse, tight, ctx)).toBe('over_budget');
    expect(hardFilterReason(pho, phoHouse, flexible, ctx)).toBeNull();
  });

  it('filters rejected items', () => {
    expect(hardFilterReason(pho, phoHouse, emptyPreferences(), { kb, rejectedItemIds: new Set(['pho']) })).toBe('rejected');
  });
});

describe('restaurantQuality and similarity', () => {
  it('shrinks toward neutral with few ratings and drops when closed', () => {
    expect(restaurantQuality({ placeId: 'x', name: 'x' })).toBe(0.5);
    expect(restaurantQuality({ placeId: 'x', name: 'x', rating: 5, userRatingCount: 1000 })).toBeCloseTo(1);
    expect(restaurantQuality({ placeId: 'x', name: 'x', rating: 5, userRatingCount: 10 })).toBeLessThan(0.6);
    expect(restaurantQuality({ placeId: 'x', name: 'x', rating: 5, userRatingCount: 1000, openNow: false })).toBeLessThan(0.8);
  });

  it('measures score-vector similarity on shared keys', () => {
    expect(similarity({ brothy: 1, rich: 0.2 }, { brothy: 1, rich: 0.2 })).toBe(1);
    expect(similarity({ brothy: 1 }, { brothy: 0 })).toBe(0);
    expect(similarity({ brothy: 1 }, { rich: 1 })).toBe(0.5);
  });
});

describe('positive signals and avoided qualities', () => {
  it('never records an avoided quality as a positive signal', () => {
    const prefs = applyEffects(emptyPreferences(), [
      { path: 'novelty', value: -1 },
      { path: 'desiredQualities.spicy', value: -1 },
    ]);
    const r = scoreItem(burger, burgerBarn, prefs, ctx)!;
    expect(r.trace.positiveSignals.adventurous).toBeUndefined();
    expect(r.trace.positiveSignals.spicy).toBeUndefined();
  });
});
