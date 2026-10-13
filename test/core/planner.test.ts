import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import {
  cuisineAffinity,
  desiredVector,
  isExcluded,
  knownCuisines,
  planQueries,
  plausibleArchetypes,
  proteinMatch,
  rankArchetypes,
} from '../../src/core/planner';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const kb = loadBaseKb();

const brothyBeef = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.brothy', value: 1 },
  { path: 'desiredQualities.comforting', value: 0.8 },
  { path: 'heaviness', value: -0.5 },
  { path: 'proteins.beef', value: 1 },
]);

describe('desiredVector', () => {
  it('maps heaviness, handheld, novelty and starchAsMain into score keys', () => {
    const p = applyEffects(emptyPreferences(), [
      { path: 'heaviness', value: -0.5 },
      { path: 'handheld', value: 1 },
      { path: 'novelty', value: 0.5 },
      { path: 'carbs.starchAsMain', value: -1 },
    ]);
    expect(desiredVector(p)).toEqual({ rich: -0.5, handheld: 1, adventurous: 0.5, carbHeavy: -1 });
  });

  it('does not override an explicit rich preference with heaviness', () => {
    const p = applyEffects(emptyPreferences(), [
      { path: 'desiredQualities.rich', value: 1 },
      { path: 'heaviness', value: -1 },
    ]);
    expect(desiredVector(p).rich).toBe(1);
  });
});

describe('proteinMatch and cuisineAffinity', () => {
  it('returns null with no protein preference', () => {
    expect(proteinMatch(emptyPreferences(), ['beef'])).toBeNull();
  });
  it('returns the best matching preference weight', () => {
    expect(proteinMatch(brothyBeef, ['beef', 'pork'])).toBe(1);
    expect(proteinMatch(brothyBeef, ['pork'])).toBe(0);
  });
  it('maps cuisine affinity to -1..1 with 0 default', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'cuisines.thai', value: -1 }]);
    expect(cuisineAffinity(p, 'thai')).toBe(-1);
    expect(cuisineAffinity(p, 'korean')).toBe(0);
    expect(cuisineAffinity(p, undefined)).toBe(0);
  });
});

describe('isExcluded', () => {
  const cuisines = knownCuisines(kb);
  const excluding = (...values: string[]) =>
    applyEffects(
      emptyPreferences(),
      values.map((value) => ({ path: 'exclusions', value })),
    );

  it('matches exclusions against cuisine tags and words, case-insensitively', () => {
    const p = excluding('japanese', 'pork');
    expect(isExcluded(p, { cuisines: ['Japanese'], text: ['noodles'] }, cuisines)).toBe(true);
    expect(isExcluded(p, { cuisines: ['thai'], text: ['Pork belly'] }, cuisines)).toBe(true);
    expect(isExcluded(p, { cuisines: ['thai'], text: ['beef'] }, cuisines)).toBe(false);
  });

  it('matches a cuisine exclusion against cuisine tags only, not words in the text', () => {
    const p = excluding('chinese', 'american');
    expect(isExcluded(p, { cuisines: ['thai'], text: ['Pad See Ew', 'Rice noodles with Chinese broccoli'] }, cuisines)).toBe(false);
    expect(isExcluded(p, { cuisines: ['korean'], text: ['Bulgogi melt', 'American cheese on a hoagie'] }, cuisines)).toBe(false);
    expect(isExcluded(p, { cuisines: [undefined, 'chinese'], text: ['Pad See Ew'] }, cuisines)).toBe(true);
  });

  it('matches a cuisine exclusion against the cuisine tag exactly', () => {
    expect(isExcluded(excluding('chinese'), { cuisines: ['chinese_restaurant'], text: ['chinese'] }, cuisines)).toBe(false);
  });

  it('matches other exclusions as substrings, so a ruled-out ingredient is never missed', () => {
    const noFish = excluding('fish');
    expect(isExcluded(noFish, { cuisines: [], text: ['shellfish', 'platter'] }, cuisines)).toBe(true);
    expect(isExcluded(noFish, { cuisines: [], text: ['catfish', 'po', 'boy'] }, cuisines)).toBe(true);
    expect(isExcluded(noFish, { cuisines: [], text: ['grilled', 'swordfish'] }, cuisines)).toBe(true);
    expect(isExcluded(excluding('nut'), { cuisines: [], text: ['candied', 'walnuts'] }, cuisines)).toBe(true);
    expect(isExcluded(noFish, { cuisines: [], text: ['chicken', 'larb'] }, cuisines)).toBe(false);
  });

  it('matches an exclusion the knowledge base does not know as a cuisine against cuisine tags and text', () => {
    const p = excluding('french');
    expect(cuisines.has('french')).toBe(false);
    expect(isExcluded(p, { cuisines: ['french_bistro'], text: [] }, cuisines)).toBe(true);
    expect(isExcluded(p, { cuisines: ['american'], text: ['French onion soup'] }, cuisines)).toBe(true);
  });
});

describe('knownCuisines', () => {
  it('collects the cuisines archetypes and lexicon entries are tagged with', () => {
    const cuisines = knownCuisines(kb);
    for (const c of ['chinese', 'american', 'middle_eastern', 'greek', 'hawaiian']) expect(cuisines.has(c)).toBe(true);
    expect(cuisines.has('fried')).toBe(false);
  });
});

describe('rankArchetypes', () => {
  it('puts brothy beef dishes first for a brothy beef profile', () => {
    const top = rankArchetypes(kb, brothyBeef)
      .slice(0, 4)
      .map((r) => r.archetype.id);
    expect(top).toContain('pho');
    expect(top).toContain('beef_noodle_soup');
    expect(top).not.toContain('burger');
  });

  it('drops excluded cuisines entirely', () => {
    const p = applyEffects(brothyBeef, [{ path: 'exclusions', value: 'vietnamese' }]);
    expect(rankArchetypes(kb, p).map((r) => r.archetype.id)).not.toContain('pho');
  });

  it('drops archetypes whose id, label, proteins or formats contain an excluded word', () => {
    const without = (value: string) =>
      rankArchetypes(kb, applyEffects(emptyPreferences(), [{ path: 'exclusions', value }])).map((r) => r.archetype.id);
    expect(without('margherita')).not.toContain('margherita_pizza');
    expect(without('taiwanese')).not.toContain('beef_noodle_soup');
    expect(without('seafood')).not.toContain('ceviche');
    expect(without('bowl')).not.toContain('pho');
    const noFish = without('fish');
    expect(noFish).not.toContain('fish_tacos');
    expect(noFish).not.toContain('grilled_fish');
    expect(noFish).toContain('pho');
  });

  it('boosts archetypes the user reacted to', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'archetypes.ceviche', value: 1 }]);
    expect(rankArchetypes(kb, p)[0]!.archetype.id).toBe('ceviche');
  });
});

describe('plausibleArchetypes and planQueries', () => {
  it('finds nothing plausible with empty preferences', () => {
    expect(plausibleArchetypes(kb, emptyPreferences())).toEqual([]);
  });

  it('finds several plausible soups for the brothy profile', () => {
    const ids = plausibleArchetypes(kb, brothyBeef).map((a) => a.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain('pho');
  });

  it('plans at most five distinct queries from the top archetypes', () => {
    const queries = planQueries(kb, brothyBeef, 5);
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries).toContain('pho');
  });
});
