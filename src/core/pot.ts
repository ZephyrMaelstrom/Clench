// The Pot: ties grow it, the next decisive spin multiplies damage by it, then it resets.
// Doubles up to 16x, then diminishing returns: +4x per tie, uncapped.

export const POT_DOUBLE_LIMIT = 16;
export const POT_LATE_STEP = 4;

export interface PotGrowth {
  /** Double Down: triples instead of doubling (or +8 past the limit). */
  triple?: boolean;
  /** Nerve: +0.5x per point added after growth. */
  nerve?: number;
}

export function growPot(pot: number, g: PotGrowth = {}): number {
  let p = pot;
  if (p < POT_DOUBLE_LIMIT) p = Math.min(p * (g.triple ? 3 : 2), Math.max(POT_DOUBLE_LIMIT, p * 2));
  else p += g.triple ? POT_LATE_STEP * 2 : POT_LATE_STEP;
  if (g.nerve) p += 0.5 * g.nerve;
  return p;
}

export function formatPot(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(1)}x`;
}
