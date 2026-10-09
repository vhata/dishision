import { describe, expect, it } from 'vitest';
import { fixtureCandidates } from '../../fixtures/sf';
import { explain } from '../../src/core/explain';
import { withMenulessFallback } from '../../src/core/fallback';
import { loadBaseKb } from '../../src/core/kb';
import { recommend } from '../../src/core/pairs';
import { applyEffects, emptyPreferences, type Effect } from '../../src/core/preferences';

const kb = loadBaseKb();
const candidates = fixtureCandidates(kb);

function run(effects: Effect[]) {
  const prefs = applyEffects(emptyPreferences(), effects);
  const result = recommend(withMenulessFallback(kb, candidates, prefs), prefs, { kb });
  return { prefs, ...result };
}

const archetypesOf = (items: { tags: { archetypeId?: string } }[]) => items.map((i) => i.tags.archetypeId);

describe('fixtures', () => {
  it('tags every fixture item with a protein or a vegetarian marker and a cuisine', () => {
    for (const c of candidates) {
      for (const item of c.items) {
        expect(item.tags.cuisine, item.name).toBeTruthy();
        expect(item.tags.proteins.length, item.name).toBeGreaterThan(0);
      }
    }
  });
});

describe('Scenario A: comfort, not heavy, broth, beef, moderate spice, minimal rice', () => {
  const effects: Effect[] = [
    { path: 'hunger', value: 'normal' },
    { path: 'desiredQualities.comforting', value: 0.8 },
    { path: 'desiredQualities.brothy', value: 1 },
    { path: 'heaviness', value: -0.5 },
    { path: 'proteins.beef', value: 1 },
    { path: 'desiredQualities.spicy', value: 0.3 },
    { path: 'carbs.rice', value: -0.5 },
    { path: 'carbs.starchAsMain', value: -0.5 },
  ];
  it('recommends a beefy soup or a soup plus grilled beef pair', () => {
    const { primary, runnerUp, prefs } = run(effects);
    const expected = ['pho', 'beef_noodle_soup', 'yukgaejang', 'bun_bo_hue', 'tom_yum', 'thai_beef_salad'];
    for (const a of archetypesOf(primary!.items)) expect(expected).toContain(a);
    expect(primary!.menuless).toBe(false);
    expect(runnerUp).not.toBeNull();
    expect(runnerUp!.restaurant.placeId).not.toBe(primary!.restaurant.placeId);
    const text = explain(primary!, prefs, runnerUp);
    expect(text).toContain(primary!.items[0]!.name);
    expect(text).toMatch(/broth/);
  });
  it('respects exclusions and still answers', () => {
    const { primary } = run([...effects, { path: 'exclusions', value: 'vietnamese' }, { path: 'exclusions', value: 'chinese' }, { path: 'exclusions', value: 'korean' }]);
    expect(primary).not.toBeNull();
    expect(['vietnamese', 'chinese', 'korean']).not.toContain(primary!.restaurant.cuisine);
  });
});

describe('Scenario B: hot weather, seafood, acidic, not heavy, interesting', () => {
  it('recommends ceviche, aguachile, sashimi, grilled fish or fish tacos', () => {
    const { primary } = run([
      { path: 'desiredQualities.fresh', value: 1 },
      { path: 'desiredQualities.brightAcidic', value: 1 },
      { path: 'proteins.seafood', value: 1 },
      { path: 'heaviness', value: -0.7 },
      { path: 'novelty', value: 0.5 },
    ]);
    const expected = ['ceviche', 'aguachile', 'sashimi', 'grilled_fish', 'fish_tacos'];
    for (const a of archetypesOf(primary!.items)) expect(expected).toContain(a);
  });
});

describe('Scenario C: starving, indulgent, handheld, beef, familiar', () => {
  it('recommends a burger, cheesesteak, tacos, shawarma or kebab wrap', () => {
    const { primary } = run([
      { path: 'hunger', value: 'very_hungry' },
      { path: 'desiredQualities.rich', value: 1 },
      { path: 'desiredQualities.comforting', value: 0.5 },
      { path: 'handheld', value: 1 },
      { path: 'proteins.beef', value: 1 },
      { path: 'novelty', value: -1 },
    ]);
    const expected = ['burger', 'cheesesteak', 'tacos', 'shawarma_wrap', 'kebab_plate', 'burrito'];
    for (const a of archetypesOf(primary!.items)) expect(expected).toContain(a);
  });
});

describe('degenerate inputs', () => {
  it('answers with no preferences at all', () => {
    const { primary, runnerUp } = run([]);
    expect(primary).not.toBeNull();
    expect(runnerUp).not.toBeNull();
  });
  it('returns null when every cuisine is excluded', () => {
    const cuisines = [...new Set(candidates.map((c) => c.restaurant.cuisine!))];
    const { primary } = run(cuisines.map((c) => ({ path: 'exclusions', value: c })));
    expect(primary).toBeNull();
  });
});
