import { describe, expect, it } from 'vitest';
import { applyEffects, emptyPreferences, getPath } from '../../src/core/preferences';

describe('applyEffects', () => {
  it('sets a nested quality scaled by intensity', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'desiredQualities.comforting', value: 1 }], 0.5);
    expect(p.desiredQualities.comforting).toBe(0.5);
  });

  it('does not mutate the input', () => {
    const base = emptyPreferences();
    applyEffects(base, [{ path: 'desiredQualities.spicy', value: 1 }]);
    expect(base.desiredQualities.spicy).toBeUndefined();
  });

  it('sets scalar string fields', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'hunger', value: 'very_hungry' }]);
    expect(p.hunger).toBe('very_hungry');
  });

  it('pushes to list fields without duplicates, lowercased', () => {
    const p1 = applyEffects(emptyPreferences(), [{ path: 'exclusions', value: 'Japanese' }]);
    const p2 = applyEffects(p1, [{ path: 'exclusions', value: 'japanese' }]);
    expect(p2.exclusions).toEqual(['japanese']);
  });

  it('adds and clamps to [-1, 1]', () => {
    const p1 = applyEffects(emptyPreferences(), [{ path: 'proteins.beef', value: 0.8 }]);
    const p2 = applyEffects(p1, [{ path: 'proteins.beef', op: 'add', value: 0.8 }]);
    expect(p2.proteins.beef).toBe(1);
  });

  it('supports max and min', () => {
    const p1 = applyEffects(emptyPreferences(), [{ path: 'heaviness', value: 0.5 }]);
    expect(applyEffects(p1, [{ path: 'heaviness', op: 'min', value: -0.5 }]).heaviness).toBe(-0.5);
    expect(applyEffects(p1, [{ path: 'heaviness', op: 'max', value: 0.2 }]).heaviness).toBe(0.5);
  });

  it('does not clamp budget', () => {
    const p = applyEffects(emptyPreferences(), [{ path: 'budget.max', value: 30 }]);
    expect(p.budget.max).toBe(30);
  });

  it('rejects unknown fields and malformed paths', () => {
    expect(() => applyEffects(emptyPreferences(), [{ path: 'mood', value: 1 }])).toThrow(/unknown preference field/);
    expect(() => applyEffects(emptyPreferences(), [{ path: 'desiredQualities', value: 1 }])).toThrow();
    expect(() => applyEffects(emptyPreferences(), [{ path: 'hunger.now', value: 1 }])).toThrow();
  });
});

describe('getPath', () => {
  it('reads scalars and nested keys', () => {
    const p = applyEffects(emptyPreferences(), [
      { path: 'hunger', value: 'light' },
      { path: 'cuisines.thai', value: 1 },
    ]);
    expect(getPath(p, 'hunger')).toBe('light');
    expect(getPath(p, 'cuisines.thai')).toBe(1);
    expect(getPath(p, 'cuisines.korean')).toBeUndefined();
  });
});
