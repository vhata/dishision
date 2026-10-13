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

  it('matches cuisine tags exactly, not as substrings', () => {
    expect(isExcluded(excluding('eastern'), { cuisines: ['middle_eastern'], text: [] }, cuisines)).toBe(false);
  });

  it('matches other exclusions as whole words, not substrings', () => {
    const p = excluding('fish');
    expect(isExcluded(p, { cuisines: [], text: ['Shellfish platter', 'Shrimp, clams and mussels'] }, cuisines)).toBe(false);
    expect(isExcluded(p, { cuisines: [], text: ['Catfish po boy'] }, cuisines)).toBe(false);
    expect(isExcluded(p, { cuisines: [], text: ['Fish tacos'] }, cuisines)).toBe(true);
    expect(isExcluded(p, { cuisines: [], text: ['fish_tacos'] }, cuisines)).toBe(true);
  });

  it('accepts a plural of the excluded word', () => {
    const p = excluding('mushroom', 'tomato');
    expect(isExcluded(p, { cuisines: [], text: ['Sauteed mushrooms'] }, cuisines)).toBe(true);
    expect(isExcluded(p, { cuisines: [], text: ['Roast tomatoes'] }, cuisines)).toBe(true);
  });

  it('matches a multi-word exclusion as a phrase', () => {
    const p = excluding('blue cheese');
    expect(isExcluded(p, { cuisines: [], text: ['Wedge salad with Blue Cheese dressing'] }, cuisines)).toBe(true);
    expect(isExcluded(p, { cuisines: [], text: ['Blue corn tortilla, cheese'] }, cuisines)).toBe(false);
  });

  it('scans text for an exclusion the knowledge base does not know as a cuisine', () => {
    const p = excluding('french');
    expect(cuisines.has('french')).toBe(false);
    expect(isExcluded(p, { cuisines: ['french'], text: [] }, cuisines)).toBe(true);
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

  it('drops archetypes whose label, id or tags name an excluded word', () => {
    const ids = rankArchetypes(kb, applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'fish' }])).map((r) => r.archetype.id);
    expect(ids).not.toContain('fish_tacos');
    expect(ids).not.toContain('grilled_fish');
    expect(ids).toContain('pho');
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
