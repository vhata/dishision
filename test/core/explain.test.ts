import { describe, expect, it } from 'vitest';
import { explain, joinNatural } from '../../src/core/explain';
import type { Recommendation } from '../../src/core/pairs';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const siam = { placeId: 'siam', name: 'Siam Kitchen', cuisine: 'thai' };
const pair: Recommendation = {
  kind: 'pair',
  restaurant: siam,
  items: [
    { id: 'a', placeId: 'siam', name: 'Tom Yum Shrimp', description: 'Hot and sour soup with lemongrass', priceCents: 1400, scores: { brothy: 0.95, rich: 0.2, carbHeavy: 0.1 }, tags: { proteins: ['seafood'], carbs: [], formats: [], cuisine: 'thai' } },
    { id: 'b', placeId: 'siam', name: 'Grilled Beef Salad', priceCents: 1700, scores: { brightAcidic: 0.9, rich: 0.2, carbHeavy: 0.1 }, tags: { proteins: ['beef'], carbs: [], formats: [], cuisine: 'thai' } },
  ],
  score: 0.8,
  trace: { total: 0.8, components: {}, positiveSignals: { brothy: 0.95, brightAcidic: 0.9, protein: 1, spicy: 0.6 }, penalties: {} },
  menuless: false,
};
const runnerUp: Recommendation = {
  kind: 'single',
  restaurant: { placeId: 'pho', name: 'Pho House', cuisine: 'vietnamese' },
  items: [{ id: 'c', placeId: 'pho', name: 'Pho Tai', priceCents: 1600, scores: { brothy: 0.95, rich: 0.3 }, tags: { proteins: ['beef'], carbs: ['noodles'], formats: [], cuisine: 'vietnamese' } }],
  score: 0.7,
  trace: { total: 0.7, components: {}, positiveSignals: { brothy: 0.95 }, penalties: { repeatedCuisine: 0.2 } },
  menuless: false,
};
const prefs = applyEffects(emptyPreferences(), [{ path: 'heaviness', value: -0.5 }, { path: 'carbs.starchAsMain', value: -0.5 }]);

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
