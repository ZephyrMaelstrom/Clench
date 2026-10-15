// Seeded random numbers (mulberry32). The state is a plain number so battle
// state can be cloned (for odds previews) and runs can be replayed from a seed.

export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

/** Float in [0, 1). Advances the state. */
export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function int(r: RngState, n: number): number {
  return Math.floor(next(r) * n);
}

/** Roll one die with `sides` faces: 1..sides. */
export function roll(r: RngState, sides: number): number {
  return 1 + int(r, sides);
}

export function chance(r: RngState, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[int(r, arr.length)];
}

export function shuffle<T>(r: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Seed from a string (for daily / custom seeds). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
