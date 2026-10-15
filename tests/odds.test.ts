import { describe, expect, it } from 'vitest';
import { BEATS, TYPES, beats } from '../src/core/types';
import { buildWheel, compare, computeOdds, Segment } from '../src/core/wheel';
import { growPot } from '../src/core/pot';
import { int, makeRng } from '../src/core/rng';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('typings', () => {
  it('every type beats exactly two and loses to exactly two', () => {
    for (const t of TYPES) {
      expect(BEATS[t]).toHaveLength(2);
      expect(TYPES.filter((x) => beats(x, t))).toHaveLength(2);
      expect(beats(t, t)).toBe(false);
    }
  });

  it('matches the matrix in the design doc', () => {
    // row attacks column: W/T/L
    const m: Record<string, string> = {
      rock: 'TLWWL', paper: 'WTLLW', scissors: 'LWTLW', flame: 'LWWTL', tide: 'WLLWT',
    };
    for (const a of TYPES) {
      TYPES.forEach((b, j) => {
        const o = compare({ type: a }, { type: b });
        expect(o[0].toUpperCase()).toBe(m[a][j]);
      });
    }
  });
});

describe('odds (Typings tab worked examples)', () => {
  // Enemy: 50% Flame, 12.5% each other type (8 segments)
  const enemy = buildWheel({ flame: 4, rock: 1, paper: 1, scissors: 1, tide: 1 });

  it('two even wheels are 40 / 20 / 40', () => {
    const even = buildWheel({ rock: 2, paper: 2, scissors: 2, flame: 2, tide: 2 });
    const o = computeOdds(even, even);
    close(o.win, 0.4); close(o.tie, 0.2); close(o.loss, 0.4);
  });

  it('even player vs Flame-heavy enemy is 40 / 20 / 40', () => {
    const o = computeOdds(buildWheel({ rock: 1, paper: 1, scissors: 1, flame: 1, tide: 1 }), enemy);
    close(o.win, 0.4); close(o.tie, 0.2); close(o.loss, 0.4);
  });

  it('Rock 40% / others 15% is 45.625 / 18.125 / 36.25', () => {
    const p = buildWheel({ rock: 8, paper: 3, scissors: 3, flame: 3, tide: 3 });
    const o = computeOdds(p, enemy);
    close(o.win, 0.45625); close(o.tie, 0.18125); close(o.loss, 0.3625);
  });

  it('Rock 50% / Tide 50% is 62.5 / 12.5 / 25', () => {
    const o = computeOdds(buildWheel({ rock: 1, tide: 1 }), enemy);
    close(o.win, 0.625); close(o.tie, 0.125); close(o.loss, 0.25);
  });

  it('fogged segments give an honest range containing the truth', () => {
    const p = buildWheel({ rock: 4, paper: 2, scissors: 2, flame: 2, tide: 2 });
    const e: Segment[] = buildWheel({ flame: 6, rock: 2, paper: 2, scissors: 1, tide: 1 });
    const truth = computeOdds(p, e).win;
    e.slice(0, 5).forEach((s) => (s.fog = true));
    const o = computeOdds(p, e);
    expect(o.fogged).toBe(true);
    expect(o.winLo).toBeLessThanOrEqual(truth + 1e-9);
    expect(o.winHi).toBeGreaterThanOrEqual(truth - 1e-9);
  });

  it('luck re-spins lift wins and cut losses, still summing to 1', () => {
    const w = buildWheel({ rock: 2, paper: 2, scissors: 2, flame: 2, tide: 2 });
    const o = computeOdds(w, w, undefined, undefined, 0.15);
    close(o.win + o.tie + o.loss, 1);
    close(o.win, 0.4 + 0.4 * 0.15 * 0.4);
  });
});

describe('special slices', () => {
  const R: Segment = { type: 'rock' };
  it('Wild vs Mirror ties; Wild vs Wild ties; Mirror vs Mirror ties', () => {
    expect(compare({ special: 'wild' }, { special: 'mirror' })).toBe('tie');
    expect(compare({ special: 'wild' }, { special: 'wild' })).toBe('tie');
    expect(compare({ special: 'mirror' }, { special: 'mirror' })).toBe('tie');
  });
  it('Wild beats anything typed; Mirror ties anything', () => {
    for (const t of TYPES) {
      expect(compare({ special: 'wild' }, { type: t })).toBe('win');
      expect(compare({ special: 'mirror' }, { type: t })).toBe('tie');
    }
  });
  it('Blank always loses, Mirror copying a Blank ties', () => {
    expect(compare({ hazard: 'blank' }, R)).toBe('loss');
    expect(compare({ special: 'wild' }, { hazard: 'blank' })).toBe('win');
    expect(compare({ hazard: 'blank' }, { hazard: 'rot' })).toBe('tie');
    expect(compare({ special: 'mirror' }, { hazard: 'blank' })).toBe('tie');
  });
  it('Prism takes its better pairing', () => {
    const prism: Segment = { type: 'rock', type2: 'paper', special: 'prism' };
    expect(compare(prism, { type: 'scissors' })).toBe('win'); // rock beats scissors
    expect(compare(prism, { type: 'rock' })).toBe('win'); // paper beats rock
    expect(compare(prism, { type: 'tide' })).toBe('win'); // paper beats tide
    expect(compare({ type: 'scissors' }, prism)).toBe('loss');
  });
  it('Prism vs Prism where both can win is a tie', () => {
    const a: Segment = { type: 'rock', type2: 'paper', special: 'prism' };
    const b: Segment = { type: 'scissors', type2: 'tide', special: 'prism' };
    expect(compare(a, b)).toBe('tie');
  });
  it('typed specials resolve by their type', () => {
    expect(compare({ type: 'rock', special: 'edge' }, { type: 'scissors' })).toBe('win');
    expect(compare({ type: 'rock', special: 'thorn' }, { type: 'paper' })).toBe('loss');
  });
});

describe('pot', () => {
  it('doubles to 16x then adds +4x per tie (uncapped)', () => {
    let p = 1;
    const seq: number[] = [];
    for (let i = 0; i < 7; i++) { p = growPot(p); seq.push(p); }
    expect(seq).toEqual([2, 4, 8, 16, 20, 24, 28]);
  });
  it('nerve adds 0.5 per point; double down triples', () => {
    expect(growPot(2, { nerve: 1 })).toBe(4.5);
    expect(growPot(2, { triple: true })).toBe(6);
    expect(growPot(16, { triple: true })).toBe(24);
  });
});

describe('simulated spins match calculated odds', () => {
  it('within 0.5% over 200k spins', () => {
    const p = buildWheel({ rock: 4, paper: 2, scissors: 2, flame: 2, tide: 2 });
    p[0] = { special: 'wild' };
    p[3] = { type: 'tide', type2: 'flame', special: 'prism' };
    const e = buildWheel({ flame: 5, rock: 1, paper: 2, scissors: 3, tide: 1 });
    e[2] = { special: 'mirror' };
    const o = computeOdds(p, e);
    const rng = makeRng(42);
    let w = 0, t = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const r = compare(p[int(rng, p.length)], e[int(rng, e.length)]);
      if (r === 'win') w++; else if (r === 'tie') t++;
    }
    expect(Math.abs(w / N - o.win)).toBeLessThan(0.005);
    expect(Math.abs(t / N - o.tie)).toBeLessThan(0.005);
  });
});
