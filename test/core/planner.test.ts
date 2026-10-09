import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { cuisineAffinity, desiredVector, isExcluded, planQueries, plausibleArchetypes, proteinMatch, rankArchetypes } from '../../src/core/planner';

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
    const p = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.rich', value: 1 }, { path: 'heaviness', value: -1 }]);
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
  it('matches exclusions against any word, case-insensitively', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'japanese' }, { path: 'exclusions', value: 'pork' }]);
    expect(isExcluded(p, ['Japanese', 'noodles'])).toBe(true);
    expect(isExcluded(p, ['thai', 'beef'])).toBe(false);
  });
});

describe('rankArchetypes', () => {
  it('puts brothy beef dishes first for a brothy beef profile', () => {
    const top = rankArchetypes(kb, brothyBeef).slice(0, 4).map((r) => r.archetype.id);
    expect(top).toContain('pho');
    expect(top).toContain('beef_noodle_soup');
    expect(top).not.toContain('burger');
  });

  it('drops excluded cuisines entirely', () => {
    const p = applyEffects(brothyBeef, [{ path: 'exclusions', value: 'vietnamese' }]);
    expect(rankArchetypes(kb, p).map((r) => r.archetype.id)).not.toContain('pho');
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
