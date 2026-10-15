// Lotwheel segments, matchup resolution, and the ONE odds function.
// The odds bar and the actual spin both use compare(), so displayed odds are real odds.

import { TYPES, TypeId, beats, nextType } from './types';

export type SpecialId = 'edge' | 'loaded' | 'wild' | 'mirror' | 'prism' | 'siphon' | 'thorn' | 'echo';
export type HazardId = 'blank' | 'rot';

export const TYPED_SPECIALS: SpecialId[] = ['edge', 'loaded', 'siphon', 'thorn'];
export const TYPELESS_SPECIALS: SpecialId[] = ['wild', 'mirror', 'echo'];
export const ALL_SPECIALS: SpecialId[] = ['edge', 'loaded', 'wild', 'mirror', 'prism', 'siphon', 'thorn', 'echo'];

export const BASE_WHEEL_SIZE = 12;
export const MIN_WHEEL = 8;
export const MAX_WHEEL = 24;
export const MAX_SPECIALS = 4;

export interface Segment {
  /** Primary type. Absent for typeless specials (wild/mirror/echo) and blank/rot hazards. */
  type?: TypeId;
  /** Second type, only for Prism segments. */
  type2?: TypeId;
  special?: SpecialId;
  /** Blank and Rot are segments of their own and always lose. */
  hazard?: HazardId;
  /** Lock hazard: cannot be resized or replaced this fight. */
  lock?: boolean;
  /** Fuse hazard: spins left before it detonates. */
  fuse?: number;
  /** Hidden from the player (enemy Fogged affix). */
  fog?: boolean;
  /** Battle-local identity, so per-spin shaping can be undone without losing reveals or fuses. */
  uid?: number;
}

export type Outcome = 'win' | 'tie' | 'loss';

export const seg = (type: TypeId, special?: SpecialId): Segment => (special ? { type, special } : { type });

export function buildWheel(counts: Partial<Record<TypeId, number>>): Segment[] {
  // Interleave types so the wheel looks mixed rather than in solid blocks.
  const pools = TYPES.map((t) => ({ t, n: counts[t] ?? 0 }));
  const out: Segment[] = [];
  let left = pools.reduce((a, p) => a + p.n, 0);
  while (left > 0) {
    for (const p of pools) {
      if (p.n > 0) {
        out.push({ type: p.t });
        p.n--;
        left--;
      }
    }
  }
  return out;
}

export function isDead(s: Segment): boolean {
  return s.hazard === 'blank' || s.hazard === 'rot';
}

/** Types a segment counts as (0, 1 or 2 for Prism). */
export function typesOf(s: Segment): TypeId[] {
  if (isDead(s)) return [];
  if (s.special === 'prism' && s.type) return s.type2 ? [s.type, s.type2] : [s.type];
  if (s.special === 'wild' || s.special === 'mirror' || s.special === 'echo') return [];
  return s.type ? [s.type] : [];
}

export function isPlainTyped(s: Segment): boolean {
  return !!s.type && !s.special && !s.hazard;
}

/**
 * Resolve one segment against another, from `a`'s point of view.
 * Order: Mirror forces a tie; Blank/Rot always lose; Wild beats everything else;
 * Prism takes its best pairing (two Prisms that can both win tie).
 */
export function compare(a: Segment, b: Segment): Outcome {
  if (a.special === 'mirror' || b.special === 'mirror') return 'tie';
  const aDead = isDead(a);
  const bDead = isDead(b);
  if (aDead && bDead) return 'tie';
  if (aDead) return 'loss';
  if (bDead) return 'win';
  const aw = a.special === 'wild';
  const bw = b.special === 'wild';
  if (aw && bw) return 'tie';
  if (aw) return 'win';
  if (bw) return 'loss';
  const at = typesOf(a);
  const bt = typesOf(b);
  const aCan = at.some((x) => bt.some((y) => beats(x, y)));
  const bCan = bt.some((y) => at.some((x) => beats(y, x)));
  const aPrism = at.length > 1;
  const bPrism = bt.length > 1;
  if (aPrism && bPrism) {
    if (aCan && bCan) return 'tie';
    return aCan ? 'win' : bCan ? 'loss' : 'tie';
  }
  if (aPrism) return aCan ? 'win' : at.some((x) => bt.includes(x)) ? 'tie' : 'loss';
  if (bPrism) return bCan ? 'loss' : bt.some((y) => at.includes(y)) ? 'tie' : 'win';
  return aCan ? 'win' : bCan ? 'loss' : 'tie';
}

export interface Odds {
  win: number;
  tie: number;
  loss: number;
  /** When enemy segments are fogged the exact odds are unknown: these give the honest range. */
  winLo: number;
  winHi: number;
  lossLo: number;
  lossHi: number;
  fogged: boolean;
}

const FOG_CANDIDATES: Segment[] = TYPES.map((t) => ({ type: t }));

/**
 * Exact Win / Tie / Loss for two wheels, each segment equally likely.
 * `resolveA` / `resolveB` turn a wheel segment into what it actually plays as
 * (Echo -> last result, Mask of the House, etc). `luckP` is the chance a loss is re-spun.
 */
export function computeOdds(
  wa: Segment[],
  wb: Segment[],
  resolveA: (s: Segment) => Segment = (s) => s,
  resolveB: (s: Segment) => Segment = (s) => s,
  luckP = 0,
): Odds {
  let w = 0, t = 0, l = 0;
  let wLo = 0, wHi = 0, lLo = 0, lHi = 0;
  let fogged = false;
  const na = wa.length, nb = wb.length;
  for (const sbRaw of wb) {
    if (sbRaw.fog) {
      fogged = true;
      // Unknown segment: range over the five plain types it could be.
      let minW = 1, maxW = 0, minL = 1, maxL = 0, sumW = 0, sumT = 0, sumL = 0;
      for (const cand of FOG_CANDIDATES) {
        let cw = 0, ct = 0, cl = 0;
        for (const sa of wa) {
          const o = compare(resolveA(sa), cand);
          if (o === 'win') cw++; else if (o === 'tie') ct++; else cl++;
        }
        cw /= na; ct /= na; cl /= na;
        minW = Math.min(minW, cw); maxW = Math.max(maxW, cw);
        minL = Math.min(minL, cl); maxL = Math.max(maxL, cl);
        sumW += cw; sumT += ct; sumL += cl;
      }
      // Point estimate assumes an even spread; the range is what we display.
      w += sumW / 5; t += sumT / 5; l += sumL / 5;
      wLo += minW; wHi += maxW; lLo += minL; lHi += maxL;
      continue;
    }
    const sb = resolveB(sbRaw);
    let cw = 0, ct = 0, cl = 0;
    for (const sa of wa) {
      const o = compare(resolveA(sa), sb);
      if (o === 'win') cw++; else if (o === 'tie') ct++; else cl++;
    }
    cw /= na; ct /= na; cl /= na;
    w += cw; t += ct; l += cl;
    wLo += cw; wHi += cw; lLo += cl; lHi += cl;
  }
  const res = (x: number) => x / nb;
  let odds: Odds = {
    win: res(w), tie: res(t), loss: res(l),
    winLo: res(wLo), winHi: res(wHi), lossLo: res(lLo), lossHi: res(lHi), fogged,
  };
  if (luckP > 0) odds = applyLuck(odds, luckP);
  return odds;
}

/** A lost spin is re-spun with probability p (once). */
export function applyLuck(o: Odds, p: number): Odds {
  const f = (win: number, tie: number, loss: number) => ({
    win: win + loss * p * win,
    tie: tie + loss * p * tie,
    loss: loss * (1 - p) + loss * p * loss,
  });
  const main = f(o.win, o.tie, o.loss);
  const lo = f(o.winLo, 0, o.lossHi);
  const hi = f(o.winHi, 0, o.lossLo);
  return { ...o, ...main, winLo: lo.win, winHi: hi.win, lossLo: hi.loss, lossHi: lo.loss };
}

export function countType(wheel: Segment[], t: TypeId): number {
  return wheel.filter((s) => typesOf(s).includes(t)).length;
}

export function largestType(wheel: Segment[], exclude?: TypeId): TypeId | undefined {
  let best: TypeId | undefined;
  let bestN = 0;
  for (const t of TYPES) {
    if (t === exclude) continue;
    const n = wheel.filter((s) => isPlainTyped(s) && s.type === t).length;
    if (n > bestN) { best = t; bestN = n; }
  }
  return best;
}

export function specialCount(wheel: Segment[]): number {
  return wheel.filter((s) => !!s.special).length;
}

export function rotateTypes(wheel: Segment[]): void {
  for (const s of wheel) {
    if (s.lock) continue;
    if (s.type) s.type = nextType(s.type);
    if (s.type2) s.type2 = nextType(s.type2);
  }
}

export const SPECIAL_INFO: Record<SpecialId, { name: string; desc: string; typed: boolean }> = {
  edge: { name: 'Edge', desc: 'Win = critical hit (dice x2).', typed: true },
  loaded: { name: 'Loaded', desc: 'Win = spin again and add that damage (chains up to 3).', typed: true },
  wild: { name: 'Wild', desc: 'Becomes whatever beats the enemy result.', typed: false },
  mirror: { name: 'Mirror', desc: 'Copies the enemy result: forces a tie, grows the Pot.', typed: false },
  prism: { name: 'Prism', desc: 'Counts as two types; takes the better outcome.', typed: true },
  siphon: { name: 'Siphon', desc: 'Win = heal 50% of damage dealt.', typed: true },
  thorn: { name: 'Thorn', desc: 'Loss = reflect 50% of damage taken.', typed: true },
  echo: { name: 'Echo', desc: 'Repeats your previous spin result. First spin: counts as Blank.', typed: false },
};

export const HAZARD_INFO: Record<'blank' | 'rot' | 'lock' | 'fuse', { name: string; desc: string }> = {
  blank: { name: 'Blank', desc: 'Automatic loss. Remove with Scrub.' },
  rot: { name: 'Rot', desc: 'Automatic loss. Spreads to a neighbour each turn.' },
  lock: { name: 'Lock', desc: 'Cannot be changed this fight.' },
  fuse: { name: 'Fuse', desc: 'Explodes for 10 to both sides when it hits 0. Land on it to defuse.' },
};

export function describeSegment(s: Segment): string {
  if (s.fog) return 'Fogged: hidden. Insight or Peek reveals it.';
  const parts: string[] = [];
  if (s.hazard) parts.push(`${HAZARD_INFO[s.hazard].name}: ${HAZARD_INFO[s.hazard].desc}`);
  else {
    const types = typesOf(s).map((t) => t[0].toUpperCase() + t.slice(1)).join('+');
    if (s.special) parts.push(`${types ? types + ' ' : ''}${SPECIAL_INFO[s.special].name}: ${SPECIAL_INFO[s.special].desc}`);
    else parts.push(types);
  }
  if (s.lock) parts.push('Locked.');
  if (s.fuse !== undefined) parts.push(`Fuse: ${s.fuse} spins left.`);
  return parts.join(' ');
}
