export type DesireVector = Partial<Record<string, number>>;

export interface Alignment {
  /** 0..1 */
  score: number;
  /** per desired key, 0..1 contribution (how well that desire was met) */
  signals: Record<string, number>;
}

export const UNKNOWN_ATTRIBUTE = 0.3;

export function alignQualities(desired: DesireVector, actual: Partial<Record<string, number>>): Alignment {
  let num = 0;
  let den = 0;
  const signals: Record<string, number> = {};
  for (const [key, want] of Object.entries(desired)) {
    if (want === undefined || want === 0) continue;
    const have = actual[key] ?? UNKNOWN_ATTRIBUTE;
    const met = want > 0 ? have : 1 - have;
    const weight = Math.abs(want);
    signals[key] = met;
    num += weight * met;
    den += weight;
  }
  return den === 0 ? { score: 0.5, signals } : { score: num / den, signals };
}
