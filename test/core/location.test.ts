import { describe, expect, it } from 'vitest';
import { COARSE_COORD_DECIMALS, coarsenCoordinate, coarsenPoint } from '../../src/shared/location';

describe('coarsenCoordinate', () => {
  it('keeps two decimal places', () => {
    expect(COARSE_COORD_DECIMALS).toBe(2);
    expect(coarsenCoordinate(37.761234567)).toBe(37.76);
  });

  it('rounds to the nearest grid line rather than truncating', () => {
    expect(coarsenCoordinate(37.766)).toBe(37.77);
    expect(coarsenCoordinate(-122.416)).toBe(-122.42);
  });

  it('normalises negative zero to zero', () => {
    expect(Object.is(coarsenCoordinate(-0.004), 0)).toBe(true);
  });
});

describe('coarsenPoint', () => {
  it('coarsens both coordinates', () => {
    expect(coarsenPoint({ lat: 37.761234567, lng: -122.414812345 })).toEqual({ lat: 37.76, lng: -122.41 });
  });
});
