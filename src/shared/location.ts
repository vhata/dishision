/**
 * Decimal places kept from a device location fix. Two places is a grid of
 * about 1.1 km north-south (less east-west away from the equator):
 * neighbourhood-sized, coarser than a street address and well inside the
 * ~5 km search bias, so a session never holds a point that locates a home.
 */
export const COARSE_COORD_DECIMALS = 2;

const FACTOR = 10 ** COARSE_COORD_DECIMALS;

/** Snap one coordinate to the coarse grid; normalises -0 to 0. */
export function coarsenCoordinate(value: number): number {
  return Math.round(value * FACTOR) / FACTOR || 0;
}

/** Snap a device fix to the coarse grid before it is sent or stored. */
export function coarsenPoint(point: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: coarsenCoordinate(point.lat), lng: coarsenCoordinate(point.lng) };
}
