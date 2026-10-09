import { describe, expect, it } from 'vitest';
import { evalRule } from '../../src/core/kb/rules';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';

const prefs = applyEffects(emptyPreferences(), [
  { path: 'desiredQualities.comforting', value: 0.7 },
  { path: 'hunger', value: 'very_hungry' },
  { path: 'exclusions', value: 'japanese' },
]);

describe('evalRule', () => {
  it('compares numbers', () => {
    expect(evalRule({ path: 'desiredQualities.comforting', op: 'gte', value: 0.5 }, prefs)).toBe(true);
    expect(evalRule({ path: 'desiredQualities.comforting', op: 'lte', value: 0.5 }, prefs)).toBe(false);
    expect(evalRule({ path: 'desiredQualities.rich', op: 'gte', value: 0 }, prefs)).toBe(false);
  });

  it('handles set, unset and eq', () => {
    expect(evalRule({ path: 'hunger', op: 'eq', value: 'very_hungry' }, prefs)).toBe(true);
    expect(evalRule({ path: 'heaviness', op: 'unset' }, prefs)).toBe(true);
    expect(evalRule({ path: 'exclusions', op: 'set' }, prefs)).toBe(true);
    expect(evalRule({ path: 'recentMeals', op: 'set' }, prefs)).toBe(false);
    expect(evalRule({ path: 'carbs', op: 'unset' }, prefs)).toBe(true);
  });

  it('handles includes on lists', () => {
    expect(evalRule({ path: 'exclusions', op: 'includes', value: 'japanese' }, prefs)).toBe(true);
    expect(evalRule({ path: 'exclusions', op: 'includes', value: 'thai' }, prefs)).toBe(false);
  });

  it('combines with all, any and not', () => {
    expect(evalRule({ all: [{ path: 'hunger', op: 'set' }, { path: 'heaviness', op: 'unset' }] }, prefs)).toBe(true);
    expect(evalRule({ any: [{ path: 'heaviness', op: 'set' }, { path: 'hunger', op: 'set' }] }, prefs)).toBe(true);
    expect(evalRule({ not: { path: 'hunger', op: 'set' } }, prefs)).toBe(false);
  });

  it('reads derived values', () => {
    expect(evalRule({ path: 'derived.plausibleArchetypeCount', op: 'gte', value: 5 }, prefs, { plausibleArchetypeCount: 6 })).toBe(true);
    expect(evalRule({ path: 'derived.plausibleArchetypeCount', op: 'gte', value: 5 }, prefs, {})).toBe(false);
  });
});
