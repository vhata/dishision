import { describe, expect, it } from 'vitest';
import { alignQualities } from '../../src/core/alignment';

describe('alignQualities', () => {
  it('returns 0.5 with no desires', () => {
    expect(alignQualities({}, { brothy: 1 }).score).toBe(0.5);
  });

  it('rewards wanted qualities that are present', () => {
    const { score, signals } = alignQualities({ brothy: 1 }, { brothy: 0.9 });
    expect(score).toBeCloseTo(0.9);
    expect(signals.brothy).toBeCloseTo(0.9);
  });

  it('rewards avoided qualities that are absent', () => {
    expect(alignQualities({ rich: -1 }, { rich: 0.1 }).score).toBeCloseTo(0.9);
    expect(alignQualities({ rich: -1 }, { rich: 0.9 }).score).toBeCloseTo(0.1);
  });

  it('weights by desire strength and treats unknown attributes as weakly absent', () => {
    const { score } = alignQualities({ brothy: 1, spicy: 0.5 }, { brothy: 1 });
    // brothy contributes 1 * 1, spicy contributes 0.5 * 0.3 (unknown => 0.3)
    expect(score).toBeCloseTo((1 + 0.15) / 1.5);
  });
});
