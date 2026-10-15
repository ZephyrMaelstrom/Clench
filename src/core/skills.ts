// Skill effects. Definitions (name, cost, targeting) live in data/skills.json.

import { BattleState, convertSeg, log, protectedSeg, removeSegment, revealFog, stamp } from './battle';
import { SKILL, SkillDef } from './content';
import { int } from './rng';
import { TYPES, TYPE_NAME, TypeId } from './types';
import { MAX_WHEEL, MIN_WHEEL, Segment, countType, isPlainTyped, largestType, rotateTypes } from './wheel';

export interface Targets {
  segs?: number[];
  types?: TypeId[];
}

export interface SkillResult {
  ok: boolean;
  msg: string;
}

/** Grip this skill costs right now (Ink makes enemy-targeting skills free). */
/** Ink makes enemy-targeting skills free, except Footnote itself (no infinite Ink loop). */
export function inkable(id: string): boolean {
  return SKILL[id].enemy && id !== 'footnote';
}

export function skillCost(st: BattleState, id: string): number {
  if (inkable(id) && st.enemy.st.ink > 0) return 0;
  return SKILL[id].cost;
}

export function canUse(st: BattleState, id: string): { ok: boolean; why?: string } {
  if (st.over) return { ok: false, why: 'Battle over' };
  if (st.player.usedThisTurn.includes(id)) return { ok: false, why: 'Used this turn' };
  if (skillCost(st, id) > st.player.grip) return { ok: false, why: 'Not enough Grip' };
  return { ok: true };
}

const convertInPlace = convertSeg;

type Effect = (st: BattleState, t: Targets) => SkillResult;

const ok = (msg: string): SkillResult => ({ ok: true, msg });
const no = (msg: string): SkillResult => ({ ok: false, msg });

const EFFECTS: Record<string, Effect> = {
  lean: (st, t) => {
    const to = t.types?.[0];
    if (!to) return no('Pick a type');
    const w = st.player.wheel;
    const from = largestType(w.filter((s) => !s.lock), to);
    const s = w.find((x) => isPlainTyped(x) && x.type === from && !x.lock);
    if (!s || !from) return no('Nothing to lean');
    s.type = to;
    return ok(`Lean: ${TYPE_NAME[from]} -> ${TYPE_NAME[to]}`);
  },
  pinch: (st, t) => {
    const i = t.segs?.[0];
    const w = st.enemy.wheel;
    if (i === undefined || !w[i]) return no('Pick an enemy segment');
    if (w.length <= MIN_WHEEL) return no('Enemy wheel is at minimum size');
    if (w[i].lock) return no('That segment is Locked');
    w.splice(i, 1);
    return ok('Pinch: segment removed');
  },
  peek: (st) => {
    const n = revealFog(st, 3);
    return n ? ok(`Peek: revealed ${n}`) : no('Nothing is fogged');
  },
  brace: (st) => { st.player.st.armor += 4; return ok('Brace: +4 Armor'); },
  scrub: (st) => {
    const w = st.player.wheel;
    let i = w.findIndex((s) => s.hazard);
    if (i >= 0) {
      if (w.length > MIN_WHEEL) w.splice(i, 1); else w[i] = stamp(st, { type: largestType(w) ?? 'rock' });
      return ok('Scrub: hazard removed');
    }
    i = w.findIndex((s) => s.fuse !== undefined);
    if (i >= 0) { delete w[i].fuse; return ok('Scrub: fuse removed'); }
    i = w.findIndex((s) => s.lock);
    if (i >= 0) { delete w[i].lock; return ok('Scrub: lock removed'); }
    return no('No hazards to scrub');
  },
  taunt: (st, t) => {
    const ty = t.types?.[0];
    if (!ty) return no('Pick a type');
    const w = st.enemy.wheel;
    let n = 0;
    for (let k = 0; k < 2 && w.length < MAX_WHEEL; k++) { w.splice(int(st.rng, w.length + 1), 0, stamp(st, { type: ty })); n++; }
    return n ? ok(`Taunt: enemy +${n} ${TYPE_NAME[ty]}`) : no('Enemy wheel is full');
  },
  doubledown: (st) => { st.player.doubleDown = true; return ok('Double Down: a tie triples the Pot'); },
  bedrock: (st) => {
    const n = countType(st.player.wheel, 'rock');
    st.player.st.armor += n;
    return ok(`Bedrock: +${n} Armor`);
  },
  landslide: (st) => { st.player.landslide = true; return ok('Landslide: next Rock win +1 die'); },
  amend: (st, t) => {
    const i = t.segs?.[0];
    const ty = t.types?.[0];
    const s = i !== undefined ? st.enemy.wheel[i] : undefined;
    if (!s || !ty) return no('Pick a segment and a type');
    if (s.lock) return no('That segment is Locked');
    convertInPlace(s, ty);
    delete s.fog;
    return ok(`Amend: segment -> ${TYPE_NAME[ty]}`);
  },
  footnote: (st) => { st.enemy.st.ink += 3; return ok('Footnote: +3 Ink'); },
  snip: (st, t) => {
    const i = t.segs?.[0];
    const s = i !== undefined ? st.player.wheel[i] : undefined;
    if (!s || !isPlainTyped(s)) return no('Pick one of your plain type segments');
    s.special = 'edge';
    return ok('Snip: Edge carved');
  },
  ignite: (st) => { st.enemy.st.burn += 3; return ok('Ignite: +3 Burn'); },
  kindle: (st) => {
    const w = st.enemy.wheel;
    let n = 0;
    for (let k = 0; k < 2; k++) {
      const c = w.map((s, i) => i).filter((i) => isPlainTyped(w[i]) && w[i].type !== 'paper' && !w[i].lock);
      if (!c.length) break;
      convertInPlace(w[c[int(st.rng, c.length)]], 'paper');
      n++;
    }
    return n ? ok(`Kindle: ${n} -> Paper`) : no('Nothing to kindle');
  },
  swell: (st) => { st.player.st.flow += 3; return ok('Swell: +3 Flow'); },
  riptide: (st) => { rotateTypes(st.enemy.wheel); return ok('Riptide: enemy wheel rotates'); },
  quake: (st) => { st.player.quake = true; return ok('Quake: next Rock win shakes the whole pack'); },
  clause: (st, t) => {
    const [from, to] = t.types ?? [];
    if (!from || !to) return no('Pick two types');
    if (from === to) return no('Pick two different types');
    st.clauses.push({ turnsLeft: 2, from, to });
    return ok(`Clause filed: in 2 turns ${TYPE_NAME[from]} -> ${TYPE_NAME[to]}`);
  },
  redact: (st, t) => {
    const idx = [...new Set(t.segs ?? [])].sort((a, b) => b - a);
    if (idx.length < 2) return no('Pick two enemy segments');
    const w = st.enemy.wheel;
    let n = 0;
    for (const i of idx) {
      if (w.length <= MIN_WHEEL || !w[i] || w[i].lock) continue;
      w.splice(i, 1);
      n++;
    }
    return n ? ok(`Redact: ${n} segment${n > 1 ? 's' : ''} struck out`) : no('Enemy wheel is at minimum size');
  },
};

export function useSkill(st: BattleState, id: string, targets: Targets = {}): SkillResult {
  const c = canUse(st, id);
  if (!c.ok) return no(c.why!);
  const fx = EFFECTS[id];
  if (!fx) return no('Unknown skill');
  const cost = skillCost(st, id);
  const inked = inkable(id) && st.enemy.st.ink > 0;
  const r = fx(st, targets);
  if (!r.ok) return r;
  st.player.grip -= cost;
  if (inked) st.enemy.st.ink--;
  st.player.usedThisTurn.push(id);
  if (SKILL[id].enemy && st.player.passives.includes('paperwork')) st.player.st.armor += 2;
  log(st, r.msg);
  return r;
}

export function needsTargets(d: SkillDef): boolean {
  return d.target !== 'none';
}

export { TYPES, protectedSeg, removeSegment };
