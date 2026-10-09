import { describe, expect, it } from 'vitest';
import { withMenulessFallback } from '../../src/core/fallback';
import { loadBaseKb } from '../../src/core/kb';
import { composePair, recommend } from '../../src/core/pairs';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { scoreItem } from '../../src/core/scoring';
import type { MenuItem, RestaurantSummary } from '../../src/core/types';

const kb = loadBaseKb();
const ctx = { kb };

const siam: RestaurantSummary = { placeId: 'siam', name: 'Siam Kitchen', cuisine: 'thai', rating: 4.5, userRatingCount: 1000, openNow: true };
const tomYum: MenuItem = {
  id: 'tomyum', placeId: 'siam', name: 'Tom Yum Shrimp', priceCents: 1400,
  scores: { brothy: 0.95, spicy: 0.6, brightAcidic: 0.9, rich: 0.2, fresh: 0.6, savory: 0.7, proteinForward: 0.7, carbHeavy: 0.1, comforting: 0.6, portion: 0.4 },
  tags: { proteins: ['seafood'], carbs: [], cuisine: 'thai', formats: ['bowl'], archetypeId: 'tom_yum' },
};
const beefSalad: MenuItem = {
  id: 'beefsalad', placeId: 'siam', name: 'Grilled Beef Salad', priceCents: 1700,
  scores: { brightAcidic: 0.9, spicy: 0.6, savory: 0.9, fresh: 0.7, rich: 0.2, proteinForward: 0.9, carbHeavy: 0.1, brothy: 0, comforting: 0.4, portion: 0.5 },
  tags: { proteins: ['beef'], carbs: [], cuisine: 'thai', formats: ['plate'], archetypeId: 'thai_beef_salad' },
};
const greenCurry: MenuItem = {
  id: 'curry', placeId: 'siam', name: 'Green Curry', priceCents: 1600,
  scores: { rich: 0.8, spicy: 0.7, comforting: 0.7, savory: 0.8, carbHeavy: 0.6, brothy: 0.3, portion: 0.7 },
  tags: { proteins: ['chicken'], carbs: ['rice'], cuisine: 'thai', formats: ['plate'], archetypeId: 'green_curry' },
};
const padSeeEw: MenuItem = {
  id: 'padseeew', placeId: 'siam', name: 'Pad See Ew', priceCents: 1500,
  scores: { rich: 0.6, savory: 0.8, comforting: 0.7, carbHeavy: 0.85, brothy: 0, portion: 0.7 },
  tags: { proteins: ['chicken'], carbs: ['noodles'], cuisine: 'thai', formats: ['plate'], archetypeId: 'pad_thai' },
};

const phoHouse: RestaurantSummary = { placeId: 'pho', name: 'Pho House', cuisine: 'vietnamese', rating: 4.4, userRatingCount: 900, openNow: true };
const pho: MenuItem = {
  id: 'pho', placeId: 'pho', name: 'Pho Tai', priceCents: 1600,
  scores: { brothy: 0.95, comforting: 0.8, rich: 0.3, spicy: 0.3, brightAcidic: 0.5, savory: 0.8, proteinForward: 0.6, carbHeavy: 0.5, portion: 0.6 },
  tags: { proteins: ['beef'], carbs: ['noodles'], cuisine: 'vietnamese', formats: ['bowl'], archetypeId: 'pho' },
};

const candidates = [
  { restaurant: siam, items: [tomYum, beefSalad, greenCurry, padSeeEw] },
  { restaurant: phoHouse, items: [pho] },
];

const brothBeefBright = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.brothy', value: 1 },
  { path: 'desiredQualities.brightAcidic', value: 1 },
  { path: 'proteins.beef', value: 1 },
  { path: 'heaviness', value: -0.5 },
  { path: 'carbs.starchAsMain', value: -0.5 },
]);

describe('composePair', () => {
  it('builds a pair that covers more of the profile than either dish', () => {
    const a = scoreItem(tomYum, siam, brothBeefBright, ctx)!;
    const b = scoreItem(beefSalad, siam, brothBeefBright, ctx)!;
    const pair = composePair(a, b, brothBeefBright, ctx)!;
    expect(pair.kind).toBe('pair');
    expect(pair.items.map((i) => i.id)).toEqual(['tomyum', 'beefsalad']);
    expect(pair.score).toBeGreaterThan(Math.max(a.score, b.score));
    expect(pair.trace.positiveSignals.brothy).toBeGreaterThanOrEqual(0.9);
    expect(pair.trace.positiveSignals.protein).toBe(1);
  });

  it('never records an avoided quality as a positive signal of a pair', () => {
    const comTam: MenuItem = {
      id: 'comtam', placeId: 'pho', name: 'Com Tam Suon', priceCents: 1700,
      scores: { savory: 0.85, rich: 0.6, comforting: 0.8, carbHeavy: 0.85, proteinForward: 0.6, spicy: 0, portion: 0.8 },
      tags: { proteins: ['pork'], carbs: ['rice'], cuisine: 'vietnamese', formats: ['plate'], archetypeId: 'broken_rice' },
    };
    const brothyNotSpicy = applyEffects(emptyPreferences(), [
      { path: 'desiredQualities.brothy', value: 1 },
      { path: 'desiredQualities.spicy', value: -1 },
    ]);
    const a = scoreItem(pho, phoHouse, brothyNotSpicy, ctx)!;
    const b = scoreItem(comTam, phoHouse, brothyNotSpicy, ctx)!;
    const pair = composePair(a, b, brothyNotSpicy, ctx)!;
    // Both dishes are mild, so "not spicy" is met, but a met avoidance is not something to praise.
    expect(pair.trace.positiveSignals.brothy).toBeGreaterThanOrEqual(0.9);
    expect(pair.trace.positiveSignals.spicy).toBeUndefined();
  });

  it('penalises two heavy or two starchy dishes', () => {
    const prefs = emptyPreferences();
    const a = scoreItem(greenCurry, siam, prefs, ctx)!;
    const b = scoreItem(padSeeEw, siam, prefs, ctx)!;
    const pair = composePair(a, b, prefs, ctx)!;
    expect(pair.trace.penalties.bothHeavy).toBeGreaterThan(0);
    expect(pair.trace.penalties.bothStarchy).toBeGreaterThan(0);
  });

  it('refuses pairs that break a firm budget or cross restaurants', () => {
    const tight = applyEffects(brothBeefBright, [{ path: 'budget.max', value: 20 }]);
    const a = scoreItem(tomYum, siam, tight, ctx)!;
    const b = scoreItem(beefSalad, siam, tight, ctx)!;
    expect(composePair(a, b, tight, ctx)).toBeNull();
    const c = scoreItem(pho, phoHouse, brothBeefBright, ctx)!;
    expect(composePair(a, c, brothBeefBright, ctx)).toBeNull();
  });

  it('penalises too much food for a light appetite', () => {
    const light = applyEffects(emptyPreferences(), [{ path: 'hunger', value: 'light' }]);
    const a = scoreItem(greenCurry, siam, light, ctx)!;
    const b = scoreItem(padSeeEw, siam, light, ctx)!;
    expect(composePair(a, b, light, ctx)!.trace.penalties.tooMuch).toBeGreaterThan(0);
  });
});

describe('recommend', () => {
  it('picks the tom yum and beef salad pair and a runner-up from another restaurant', () => {
    const { primary, runnerUp } = recommend(candidates, brothBeefBright, ctx);
    expect(primary?.kind).toBe('pair');
    expect(primary?.items.map((i) => i.id).sort()).toEqual(['beefsalad', 'tomyum']);
    expect(runnerUp?.restaurant.placeId).toBe('pho');
  });

  it('returns a primary for empty preferences and null for no candidates', () => {
    expect(recommend(candidates, emptyPreferences(), ctx).primary).not.toBeNull();
    expect(recommend([], emptyPreferences(), ctx).primary).toBeNull();
  });

  it('never repeats rejected items', () => {
    const { primary } = recommend(candidates, brothBeefBright, { kb, rejectedItemIds: new Set(['tomyum', 'beefsalad']) });
    expect(primary?.items.map((i) => i.id)).not.toContain('tomyum');
    expect(primary?.items.map((i) => i.id)).not.toContain('beefsalad');
  });
});

describe('withMenulessFallback', () => {
  it('gives a menu-less restaurant a placeholder from its cuisine, ranked below real dishes', () => {
    const larbHouse: RestaurantSummary = { placeId: 'larb', name: 'Larb House', cuisine: 'thai', rating: 4.8, userRatingCount: 300, openNow: true };
    const filled = withMenulessFallback(kb, [...candidates, { restaurant: larbHouse, items: [] }], brothBeefBright);
    const larb = filled.find((c) => c.restaurant.placeId === 'larb')!;
    expect(larb.items).toHaveLength(1);
    expect(larb.items[0]!.menuless).toBe(true);
    expect(larb.items[0]!.tags.cuisine).toBe('thai');
    const { ranked } = recommend(filled, brothBeefBright, ctx);
    expect(ranked[0]!.menuless).toBe(false);
    expect(ranked.some((r) => r.menuless)).toBe(true);
  });

  it('leaves restaurants without a matching archetype empty', () => {
    const mystery: RestaurantSummary = { placeId: 'm', name: 'Mystery', cuisine: 'martian' };
    expect(withMenulessFallback(kb, [{ restaurant: mystery, items: [] }], emptyPreferences())[0]!.items).toEqual([]);
  });
});

describe('side dishes', () => {
  const fries: MenuItem = {
    id: 'fries', placeId: 'siam', name: 'Fries', priceCents: 500,
    scores: { crispy: 0.9, rich: 0.6, carbHeavy: 0.9, portion: 0.3 },
    tags: { proteins: ['vegetarian'], carbs: [], cuisine: 'thai', formats: ['side'] },
  };
  it('never stands a small side up as the recommendation', () => {
    const tight = applyEffects(emptyPreferences(), [{ path: 'budget.max', value: 10 }]);
    const { primary } = recommend([{ restaurant: siam, items: [fries, tomYum, beefSalad] }], tight, ctx);
    expect(primary).toBeNull();
  });
  it('still lets a small side partner a main dish', () => {
    const prefs = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.crispy', value: 1 }, { path: 'desiredQualities.brothy', value: 1 }]);
    const { ranked } = recommend([{ restaurant: siam, items: [fries, tomYum] }], prefs, ctx);
    expect(ranked.some((r) => r.kind === 'pair' && r.items.some((i) => i.id === 'fries'))).toBe(true);
    expect(ranked.some((r) => r.kind === 'single' && r.items[0]!.id === 'fries')).toBe(false);
  });
});
