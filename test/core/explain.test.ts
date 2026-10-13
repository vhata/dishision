import { describe, expect, it } from 'vitest';
import { explain, joinNatural } from '../../src/core/explain';
import type { Recommendation } from '../../src/core/pairs';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import type { MenuItem } from '../../src/core/types';

const siam = { placeId: 'siam', name: 'Siam Kitchen', cuisine: 'thai' };
const pair: Recommendation = {
  kind: 'pair',
  restaurant: siam,
  items: [
    {
      id: 'a',
      placeId: 'siam',
      name: 'Tom Yum Shrimp',
      description: 'Hot and sour soup with lemongrass',
      priceCents: 1400,
      scores: { brothy: 0.95, rich: 0.2, carbHeavy: 0.1 },
      tags: { proteins: ['seafood'], carbs: [], formats: [], cuisine: 'thai' },
    },
    {
      id: 'b',
      placeId: 'siam',
      name: 'Grilled Beef Salad',
      priceCents: 1700,
      scores: { brightAcidic: 0.9, rich: 0.2, carbHeavy: 0.1 },
      tags: { proteins: ['beef'], carbs: [], formats: [], cuisine: 'thai' },
    },
  ],
  score: 0.8,
  trace: { total: 0.8, components: {}, positiveSignals: { brothy: 0.95, brightAcidic: 0.9, protein: 1, spicy: 0.6 }, penalties: {} },
  menuless: false,
};
const runnerUp: Recommendation = {
  kind: 'single',
  restaurant: { placeId: 'pho', name: 'Pho House', cuisine: 'vietnamese' },
  items: [
    {
      id: 'c',
      placeId: 'pho',
      name: 'Pho Tai',
      priceCents: 1600,
      scores: { brothy: 0.95, rich: 0.3 },
      tags: { proteins: ['beef'], carbs: ['noodles'], formats: [], cuisine: 'vietnamese' },
    },
  ],
  score: 0.7,
  trace: { total: 0.7, components: {}, positiveSignals: { brothy: 0.95 }, penalties: { repeatedCuisine: 0.2 } },
  menuless: false,
};
const prefs = applyEffects(emptyPreferences(), [
  { path: 'heaviness', value: -0.5 },
  { path: 'carbs.starchAsMain', value: -0.5 },
]);

describe('explain', () => {
  it('names the dishes and restaurant, cites top signals, and notes what was avoided', () => {
    const text = explain(pair, prefs);
    expect(text).toMatch(/^Tom Yum Shrimp plus Grilled Beef Salad at Siam Kitchen\./);
    expect(text).toMatch(/broth/);
    expect(text).toMatch(/bright/);
    expect(text).toMatch(/protein/);
    expect(text).toMatch(/without getting heavy/);
    expect(text).toMatch(/without a big rice or noodle base/);
  });

  it('quotes the menu description verbatim and nothing else about ingredients', () => {
    const text = explain(pair, prefs);
    expect(text).toContain('"Hot and sour soup with lemongrass"');
    expect(text).not.toMatch(/shrimp paste|galangal|coconut/i);
  });

  it('explains the runner-up with its biggest penalty', () => {
    const text = explain(pair, prefs, runnerUp);
    expect(text).toMatch(/Runner-up: Pho Tai at Pho House, too close to something you had or have planned\./);
  });

  it('is honest about menu-less placeholders', () => {
    const placeholder: Recommendation = { ...runnerUp, menuless: true, items: [{ ...runnerUp.items[0]!, name: 'Pho', menuless: true }] };
    const text = explain(placeholder, prefs);
    expect(text).toMatch(/could not read this menu yet/);
    expect(text).toMatch(/Check the menu before ordering/);
  });
});

describe('joinNatural', () => {
  it('joins with commas and "and"', () => {
    expect(joinNatural(['a'])).toBe('a');
    expect(joinNatural(['a', 'b'])).toBe('a and b');
    expect(joinNatural(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

function dish(
  id: string,
  name: string,
  scores: MenuItem['scores'],
  proteins: string[] = ['beef'],
  extra: Partial<MenuItem> = {},
): MenuItem {
  return { id, placeId: 'p', name, priceCents: 1500, scores, tags: { proteins, carbs: [], formats: [] }, ...extra };
}

function single(
  item: MenuItem,
  restaurant: string,
  score: number,
  positiveSignals: Record<string, number> = {},
  penalties: Record<string, number> = {},
): Recommendation {
  return {
    kind: 'single',
    restaurant: { placeId: restaurant.toLowerCase(), name: restaurant },
    items: [item],
    score,
    trace: { total: score, components: {}, positiveSignals, penalties },
    menuless: false,
  };
}

describe('explanations stay grounded', () => {
  const noPrefs = emptyPreferences();

  it('names the acidity without inventing an ingredient', () => {
    const herring = single(
      dish('h', 'Pickled Herring', { brightAcidic: 0.9 }, ['seafood'], { description: 'Cured in vinegar' }),
      'Nordic',
      0.7,
      {
        brightAcidic: 0.9,
      },
    );
    const text = explain(herring, noPrefs);
    expect(text).toMatch(/You get bright acidity\./);
    expect(text).not.toMatch(/lime/i);
  });

  it('claims an avoided quality only when the score is known', () => {
    const avoidAll = applyEffects(emptyPreferences(), [
      { path: 'heaviness', value: -0.5 },
      { path: 'carbs.starchAsMain', value: -0.5 },
      { path: 'desiredQualities.spicy', value: -1 },
    ]);
    const unknown = single(dish('u', 'House Special', { brothy: 0.9 }), 'Mystery', 0.6, { brothy: 0.9 });
    expect(explain(unknown, avoidAll)).not.toMatch(/without/);

    const known = single(dish('k', 'Clear Broth', { brothy: 0.9, rich: 0.1, carbHeavy: 0.1, spicy: 0.1 }), 'Mystery', 0.6, { brothy: 0.9 });
    const text = explain(known, avoidAll);
    expect(text).toMatch(/without getting heavy/);
    expect(text).toMatch(/without a big rice or noodle base/);
    expect(text).toMatch(/without much heat/);
  });

  it('claims an avoided quality for a pair only when every dish has the score', () => {
    const light = applyEffects(emptyPreferences(), [{ path: 'heaviness', value: -0.5 }]);
    const half: Recommendation = {
      ...pair,
      items: [
        { ...pair.items[0]!, scores: { brothy: 0.95, rich: 0.2 } },
        { ...pair.items[1]!, scores: { brightAcidic: 0.9 } },
      ],
    };
    expect(explain(half, light)).not.toMatch(/without getting heavy/);
  });
});

describe('runner-up comparisons', () => {
  const primary = single(dish('p', 'Ceviche', { brightAcidic: 0.9, fresh: 0.95 }, ['seafood']), 'Mariscos', 0.8, {
    brightAcidic: 0.9,
    fresh: 0.95,
  });

  it('never says the runner-up has less of something it has more of', () => {
    const sharper = single(dish('r', 'Aguachile', { brightAcidic: 0.99, fresh: 0.95 }, ['seafood']), 'Cevicheria', 0.78, {
      brightAcidic: 0.99,
      fresh: 0.95,
    });
    const text = explain(primary, emptyPreferences(), sharper);
    expect(text).not.toMatch(/less|not as/);
    expect(text).toMatch(/Runner-up: Aguachile at Cevicheria, a close second\./);
  });

  it('names a shortfall the runner-up measurably has', () => {
    const duller = single(dish('r', 'Fish Soup', { brightAcidic: 0.5, fresh: 0.95 }, ['seafood']), 'Cevicheria', 0.7, { fresh: 0.95 });
    expect(explain(primary, emptyPreferences(), duller)).toMatch(/Runner-up: Fish Soup at Cevicheria, not as bright\./);
  });

  it('makes no comparison on a quality the runner-up has no score for', () => {
    const unscored = single(dish('r', 'Fish Plate', { fresh: 0.95 }, ['seafood']), 'Cevicheria', 0.6, { fresh: 0.95 });
    const text = explain(primary, emptyPreferences(), unscored);
    expect(text).not.toMatch(/not as bright/);
    expect(text).toMatch(/Runner-up: Fish Plate at Cevicheria, the next best fit\./);
  });

  it('names a runner-up penalty for a carb the diner wanted less of', () => {
    const rice = single(dish('r', 'Bulgogi', { savory: 0.9 }), 'Seoul Garden', 0.6, {}, { avoid_rice: 0.075 });
    expect(explain(primary, emptyPreferences(), rice)).toMatch(
      /Runner-up: Bulgogi at Seoul Garden, comes with rice, which you wanted less of\./,
    );
  });
});

describe('runner-up protein comparison', () => {
  const beefFirst = applyEffects(emptyPreferences(), [
    { path: 'proteins.beef', value: 1 },
    { path: 'proteins.chicken', value: 0.5 },
  ]);
  const primary = single(dish('p', 'Pho Tai', { brothy: 0.95 }, ['beef']), 'Lotus Pho', 0.8, { brothy: 0.95, protein: 1 });

  it('says a weaker protein match is not the first choice', () => {
    const chicken = single(dish('r', 'Pho Ga', { brothy: 0.95 }, ['chicken']), 'Pho House', 0.7, { brothy: 0.95, protein: 0.5 });
    const text = explain(primary, beefFirst, chicken);
    expect(text).toMatch(/Runner-up: Pho Ga at Pho House, not your first-choice protein\./);
    expect(text).not.toMatch(/less the protein/);
  });

  it('says a runner-up with none of the asked-for proteins is not one of them', () => {
    const tofu = single(dish('r', 'Tofu Pho', { brothy: 0.95 }, ['vegetarian']), 'Pho House', 0.6, { brothy: 0.95 });
    expect(explain(primary, beefFirst, tofu)).toMatch(/Runner-up: Tofu Pho at Pho House, not a protein you asked for\./);
  });

  it('makes no protein comparison when both match equally', () => {
    const beef = single(dish('r', 'Bun Bo Hue', { brothy: 0.95 }, ['beef']), 'Pho House', 0.79, { brothy: 0.95, protein: 1 });
    expect(explain(primary, beefFirst, beef)).toMatch(/Runner-up: Bun Bo Hue at Pho House, a close second\./);
  });
});

describe('skipped candidate', () => {
  const light = applyEffects(emptyPreferences(), [{ path: 'heaviness', value: -0.5 }]);
  const primary = single(dish('p', 'Tom Yum', { brothy: 0.95, rich: 0.2 }), 'Siam Kitchen', 0.7, { brothy: 0.95 });
  const second = single(dish('r', 'Pho Tai', { brothy: 0.95, rich: 0.3 }), 'Pho House', 0.65, { brothy: 0.95 });
  const curry = single(
    dish('c', 'Massaman Curry', { rich: 0.9, comforting: 0.9 }),
    'Siam Kitchen',
    0.6,
    { comforting: 0.9 },
    { tooRich: 0.25 },
  );

  it('names the dish a penalty kept from winning, and why', () => {
    const text = explain(primary, light, second, [primary, second, curry]);
    expect(text).toMatch(/Skipped Massaman Curry at Siam Kitchen: heavier than you wanted\./);
    expect(text.indexOf('Skipped')).toBeLessThan(text.indexOf('Runner-up'));
  });

  it('says nothing when no penalty changed the outcome', () => {
    const weak = { ...curry, score: 0.4, trace: { ...curry.trace, total: 0.4 } };
    expect(explain(primary, light, second, [primary, second, weak])).not.toMatch(/Skipped/);
  });

  it('never names the pick, the runner-up, a dish they share, or a placeholder', () => {
    const penalisedSecond = { ...second, trace: { ...second.trace, penalties: { tooRich: 0.25 } } };
    const sharing: Recommendation = { ...curry, kind: 'pair', items: [curry.items[0]!, primary.items[0]!] };
    const placeholder: Recommendation = { ...curry, menuless: true };
    const text = explain(primary, light, penalisedSecond, [primary, penalisedSecond, sharing, placeholder]);
    expect(text).not.toMatch(/Skipped/);
  });

  it('picks the candidate that would have won by the most', () => {
    const spicy = single(dish('s', 'Jungle Curry', { spicy: 0.95 }), 'Siam Kitchen', 0.55, {}, { tooSpicy: 0.2 });
    const fiery = single(dish('f', 'Vindaloo', { spicy: 0.95 }), 'Bombay', 0.45, {}, { tooSpicy: 0.2 });
    expect(explain(primary, light, second, [primary, second, fiery, curry, spicy])).toMatch(/Skipped Massaman Curry/);
  });
});
