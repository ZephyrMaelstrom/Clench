// Battle rules. Pure data + functions: no Phaser. The UI reads state and reports;
// the simulator drives the same functions headlessly.

import { CHARACTER, EnemyDef, IntentDef, Mods, modsFromItems } from './content';
import { growPot } from './pot';
import { RngState, chance, int, makeRng, pick, roll } from './rng';
import { TYPES, TYPE_NAME, TypeId, countersOf } from './types';
import {
  MAX_WHEEL, MIN_WHEEL, Odds, Outcome, Segment, buildWheel, compare, computeOdds, countType, isDead,
  isPlainTyped, largestType, rotateTypes, typesOf,
} from './wheel';

export const DICE = [4, 6, 8, 10, 12];

export interface Statuses {
  burn: number;
  flow: number;
  armor: number;
  combo: number;
  ink: number;
}

export interface Member {
  hp: number;
  maxHp: number;
}

export interface Fighter {
  name: string;
  isPlayer: boolean;
  wheel: Segment[];
  members: Member[];
  /** Dice step: 0=d4 1=d6 2=d8 3=d10 4=d12, past that +1 flat per 2. */
  might: number;
  luck: number;
  insight: number;
  nerve: number;
  st: Statuses;
  /** Effective segment of the last decisive spin (for Echo). */
  lastSeg: Segment | null;
  /** Fight-long bonus dice steps (Grit, Vengeful, Enrage). */
  grit: number;
  /** This-turn bonus dice steps (Charge intent). */
  charge: number;
  /** Burn on this fighter decays every other turn (attacker had Ember Jar). */
  burnSlow: boolean;
  burnSkip: boolean;
}

export interface PlayerFighter extends Fighter {
  charId: string;
  grip: number;
  gripPerTurn: number;
  skills: string[];
  signature: string;
  usedThisTurn: string[];
  passives: string[];
  mods: Mods;
  doubleDown: boolean;
  landslide: boolean;
  quake: boolean;
  firstWinDone: boolean;
}

export interface EnemyFighter extends Fighter {
  def: EnemyDef;
  intentText: string;
  intentKind: IntentDef['kind'] | null;
  enraged: boolean;
}

export interface Clause {
  turnsLeft: number;
  from: TypeId;
  to: TypeId;
}

export interface BattleStats {
  spins: number;
  wins: number;
  ties: number;
  losses: number;
  biggestPot: number;
  biggestHit: number;
  dealt: number;
  taken: number;
}

export interface BattleState {
  rng: RngState;
  turn: number;
  pot: number;
  player: PlayerFighter;
  enemy: EnemyFighter;
  clauses: Clause[];
  over: null | 'won' | 'lost' | 'fled';
  log: string[];
  stats: BattleStats;
  /** Wheels as they stood after start-of-turn effects. Skill shaping lasts one spin, then wheels return to this. */
  base: { player: Segment[]; enemy: Segment[] } | null;
  revealed: number[];
  nextUid: number;
}

/** What the run hands to a battle. */
export interface Loadout {
  charId: string;
  wheel: Segment[];
  hp: number;
  maxHp: number;
  items: string[];
  skills: string[];
  signature: string;
}

// ---------------------------------------------------------------- setup

const emptyStatus = (): Statuses => ({ burn: 0, flow: 0, armor: 0, combo: 0, ink: 0 });

export function createBattle(load: Loadout, def: EnemyDef, seed: number): BattleState {
  const rng = makeRng(seed);
  const ch = CHARACTER[load.charId];
  const mods = modsFromItems(load.items);
  const wheel = load.wheel.map((s) => ({ ...s }));
  for (const ss of mods.startSegs) {
    if (wheel.length >= MAX_WHEEL) break;
    const t = ss.type === 'largest' ? largestType(wheel) ?? 'rock' : ss.type;
    const s: Segment = {};
    if (t && ss.special !== 'wild' && ss.special !== 'mirror' && ss.special !== 'echo') s.type = t;
    if (ss.special) s.special = ss.special;
    if (s.special === 'prism' && s.type) s.type2 = countersOf(s.type)[0];
    wheel.splice(int(rng, wheel.length + 1), 0, s);
  }
  const player: PlayerFighter = {
    name: ch.name, isPlayer: true, charId: ch.id, wheel,
    members: [{ hp: load.hp, maxHp: load.maxHp }],
    might: ch.might + mods.might, luck: ch.luck + mods.luck, insight: ch.insight + mods.insight,
    nerve: ch.nerve + mods.nerve, st: emptyStatus(), lastSeg: null, grit: 0, charge: 0,
    burnSlow: false, burnSkip: false,
    grip: 0, gripPerTurn: ch.grip + mods.grip, skills: [...load.skills], signature: load.signature,
    usedThisTurn: [], passives: ch.passives, mods, doubleDown: false, landslide: false, quake: false,
    firstWinDone: false,
  };
  player.st.flow = mods.flowStart;
  const n = def.members ?? 1;
  const enemy: EnemyFighter = {
    name: def.name, isPlayer: false, def, wheel: buildWheel(def.wheel),
    members: Array.from({ length: n }, () => ({ hp: def.hp, maxHp: def.hp })),
    might: def.might, luck: 0, insight: 0, nerve: 0, st: emptyStatus(), lastSeg: null,
    grit: 0, charge: 0, burnSlow: mods.burnSlow, burnSkip: false, intentText: '', intentKind: null, enraged: false,
  };
  enemy.st.ink = mods.inkStart;
  const st: BattleState = {
    rng, turn: 0, pot: 1, player, enemy, clauses: [], over: null, log: [],
    stats: { spins: 0, wins: 0, ties: 0, losses: 0, biggestPot: 1, biggestHit: 0, dealt: 0, taken: 0 },
    base: null, revealed: [], nextUid: 1,
  };
  for (const s of [...player.wheel, ...enemy.wheel]) stamp(st, s);
  // Fog, then reveal by Insight (2 per point).
  const fog = affix(enemy, 'fogged')?.value ?? 0;
  if (fog > 0) {
    const idx = shuffledIdx(st, enemy.wheel.length).slice(0, fog);
    for (const i of idx) enemy.wheel[i].fog = true;
    revealFog(st, player.insight * 2);
  }
  if (mods.removeEnemyLargest) {
    const t = largestType(enemy.wheel);
    const i = enemy.wheel.findIndex((s) => isPlainTyped(s) && s.type === t);
    if (i >= 0 && enemy.wheel.length > MIN_WHEEL) {
      enemy.wheel.splice(i, 1);
      log(st, `Bureau Stamp voids one ${TYPE_NAME[t!]} segment.`);
    }
  }
  return st;
}

/** Give a segment a battle-local id. */
export function stamp(st: BattleState, s: Segment): Segment {
  s.uid = st.nextUid++;
  return s;
}

const cloneWheel = (w: Segment[]) => w.map((s) => ({ ...s }));

function shuffledIdx(st: BattleState, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = int(st.rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function affix(e: EnemyFighter, kind: string) {
  return e.def.affixes.find((a) => a.kind === kind);
}

export function log(st: BattleState, msg: string) {
  st.log.push(msg);
  if (st.log.length > 60) st.log.shift();
}

export function revealFog(st: BattleState, n: number): number {
  const fogged = st.enemy.wheel.map((s, i) => (s.fog ? i : -1)).filter((i) => i >= 0);
  let k = 0;
  for (const i of shuffledIdx(st, fogged.length)) {
    if (k >= n) break;
    const s = st.enemy.wheel[fogged[i]];
    delete s.fog;
    if (s.uid !== undefined) st.revealed.push(s.uid);
    k++;
  }
  return k;
}

// ---------------------------------------------------------------- helpers

export const alive = (f: Fighter) => f.members.some((m) => m.hp > 0);
export const hp = (f: Fighter) => f.members.reduce((a, m) => a + Math.max(0, m.hp), 0);
export const maxHp = (f: Fighter) => f.members.reduce((a, m) => a + m.maxHp, 0);
export const isUnbreakable = (st: BattleState) => st.player.passives.includes('unbreakable');

/** Can enemies or hazards touch this player segment? (Brawler's Rock is protected.) */
export function protectedSeg(st: BattleState, s: Segment): boolean {
  return !!s.lock || (isUnbreakable(st) && typesOf(s).includes('rock'));
}

/** What a segment actually plays as when it lands. */
export function effective(st: BattleState, f: Fighter, s: Segment): Segment {
  if (s.special === 'echo') return f.lastSeg ? { ...f.lastSeg, fog: undefined } : { hazard: 'blank' };
  if (s.special === 'mirror' && f.isPlayer && st.player.mods.maskOfHouse && st.pot >= 8) return { special: 'wild' };
  return s;
}

export function luckChance(f: Fighter): number {
  return Math.min(0.75, f.luck * 0.05);
}

/** THE odds shown on screen. Same compare() as the spin. */
export function battleOdds(st: BattleState): Odds {
  return computeOdds(
    st.player.wheel,
    st.enemy.wheel,
    (s) => effective(st, st.player, s),
    (s) => effective(st, st.enemy, s),
    luckChance(st.player),
  );
}

export function heal(f: Fighter, amount: number): number {
  if (amount <= 0) return 0;
  const m = f.members.find((x) => x.hp > 0);
  if (!m) return 0;
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + amount);
  return m.hp - before;
}

export interface DamageResult {
  absorbed: number;
  dealt: number;
}

/** Damage through Armor into the front member, overflowing into the next. */
export function damage(st: BattleState, f: Fighter, amount: number, opts: { pierce?: boolean; all?: boolean } = {}): DamageResult {
  let left = Math.max(0, Math.round(amount));
  let absorbed = 0;
  if (!opts.pierce && f.st.armor > 0) {
    absorbed = Math.min(f.st.armor, left);
    f.st.armor -= absorbed;
    left -= absorbed;
  }
  let dealt = 0;
  if (opts.all) {
    for (const m of f.members) if (m.hp > 0) { const d = Math.min(m.hp, left); m.hp -= d; dealt += d; }
  } else {
    for (const m of f.members) {
      if (left <= 0) break;
      if (m.hp <= 0) continue;
      const d = Math.min(m.hp, left);
      m.hp -= d;
      left -= d;
      dealt += d;
    }
  }
  if (f.isPlayer) st.stats.taken += dealt; else st.stats.dealt += dealt;
  checkEnrage(st);
  checkOver(st);
  return { absorbed, dealt };
}

function checkEnrage(st: BattleState) {
  const e = st.enemy;
  if (!e.enraged && affix(e, 'enrage') && e.members.length > 1 && e.members.some((m) => m.hp <= 0) && alive(e)) {
    e.enraged = true;
    e.grit += 2;
    log(st, `${e.name}: the survivor is ENRAGED (+2 dice steps).`);
  }
}

export function checkOver(st: BattleState) {
  if (st.over) return;
  if (!alive(st.player)) st.over = 'lost';
  else if (!alive(st.enemy)) st.over = 'won';
}

/** Put a hazard on the player's wheel (Saboteur, intents). Respects Unbreakable and Lock. */
export function addHazard(st: BattleState, kind: 'blank' | 'rot' | 'fuse' | 'lock'): string {
  const w = st.player.wheel;
  const candidates = w.map((s, i) => i).filter((i) => !protectedSeg(st, w[i]) && !w[i].hazard);
  if (kind === 'blank' || kind === 'rot') {
    if (w.length < MAX_WHEEL) {
      w.splice(int(st.rng, w.length + 1), 0, stamp(st, { hazard: kind }));
      return `${kind === 'blank' ? 'A Blank' : 'Rot'} is carved into your wheel.`;
    }
    if (!candidates.length) return 'Your wheel resists the hazard.';
    w[pick(st.rng, candidates)] = stamp(st, { hazard: kind });
    return `A segment of your wheel turns to ${kind === 'blank' ? 'Blank' : 'Rot'}.`;
  }
  const free = candidates.filter((i) => (kind === 'fuse' ? w[i].fuse === undefined : !w[i].lock));
  if (!free.length) return 'Your wheel resists the hazard.';
  const s = w[pick(st.rng, free)];
  if (kind === 'fuse') { s.fuse = 3; return 'A Fuse is lit on your wheel (3 spins).'; }
  s.lock = true;
  return 'One of your segments is Locked.';
}

/** Remove a segment if the wheel can shrink, otherwise turn it into a plain type. */
export function removeSegment(wheel: Segment[], i: number, fallback: TypeId = 'rock'): boolean {
  if (wheel[i]?.lock) return false;
  if (wheel.length > MIN_WHEEL) { wheel.splice(i, 1); return true; }
  wheel[i] = { type: fallback };
  return true;
}

export function convertSeg(s: Segment, t: TypeId) {
  const fog = s.fog;
  const uid = s.uid;
  for (const k of Object.keys(s) as (keyof Segment)[]) delete s[k];
  s.type = t;
  if (fog) s.fog = true;
  if (uid !== undefined) s.uid = uid;
}

// ---------------------------------------------------------------- turn start

export interface TurnEvent {
  who: 'player' | 'enemy' | 'both';
  kind: 'burn' | 'intent' | 'clause' | 'rot' | 'shift' | 'info' | 'flee' | 'convert';
  text: string;
  amount?: number;
}

export function startTurn(st: BattleState): TurnEvent[] {
  const ev: TurnEvent[] = [];
  if (st.over) return ev;
  st.turn++;
  const p = st.player;
  const e = st.enemy;

  // Burn ticks (pierces Armor), then Armor halves.
  for (const f of [p, e] as Fighter[]) {
    if (f.st.burn > 0) {
      const amt = f.st.burn;
      damage(st, f, amt, { pierce: true });
      ev.push({ who: f.isPlayer ? 'player' : 'enemy', kind: 'burn', text: `Burn ${amt}`, amount: amt });
      if (f.burnSlow) { if (f.burnSkip) f.st.burn--; f.burnSkip = !f.burnSkip; } else f.st.burn--;
    }
    f.st.armor = 0; // Armor lasts until the start of your next turn
    f.charge = 0;
  }
  if (st.over) return ev;

  // Grip: up to 2 unspent carries over.
  p.grip = Math.min(2, p.grip) + p.gripPerTurn;
  p.usedThisTurn = [];
  p.doubleDown = false;

  // Clauses.
  for (const c of st.clauses) c.turnsLeft--;
  for (const c of st.clauses.filter((c) => c.turnsLeft <= 0)) {
    let n = 0;
    for (const s of e.wheel) if (!s.lock && s.type === c.from && !s.special && !s.hazard) { convertSeg(s, c.to); n++; }
    ev.push({ who: 'enemy', kind: 'clause', text: `Clause: ${n} ${TYPE_NAME[c.from]} -> ${TYPE_NAME[c.to]}` });
  }
  st.clauses = st.clauses.filter((c) => c.turnsLeft > 0);

  // Rot spreads (one segment per wheel per turn).
  for (const f of [p, e] as Fighter[]) {
    const w = f.wheel;
    const ri = w.findIndex((s) => s.hazard === 'rot');
    if (ri < 0) continue;
    for (const d of [1, -1]) {
      const j = (ri + d + w.length) % w.length;
      const s = w[j];
      if (s.hazard || s.lock || (f.isPlayer && protectedSeg(st, s))) continue;
      w[j] = stamp(st, { hazard: 'rot' });
      ev.push({ who: f.isPlayer ? 'player' : 'enemy', kind: 'rot', text: 'Rot spreads' });
      break;
    }
  }

  // Enemy affixes that act each turn.
  if (affix(e, 'shifting')) { rotateTypes(e.wheel); ev.push({ who: 'enemy', kind: 'shift', text: 'Its wheel shifts' }); }
  if (affix(e, 'convertTide')) {
    const i = p.wheel.findIndex((s) => isPlainTyped(s) && s.type === 'tide' && !protectedSeg(st, s));
    if (i >= 0) { p.wheel[i].type = 'paper'; ev.push({ who: 'player', kind: 'convert', text: 'Tide -> Paper (kindling)' }); }
  }

  // Enemy intent: chosen and carried out now, so the odds you see are the real odds.
  // Enemy wheel shaping (Lean, Mimicry) follows the same rule as yours: it lasts this spin only.
  const intent = chooseIntent(st);
  const shapes = intent.kind === 'lean' || intent.kind === 'mimicry';
  if (shapes) st.base = { player: cloneWheel(p.wheel), enemy: cloneWheel(e.wheel) };
  e.intentKind = intent.kind;
  e.intentText = doIntent(st, intent);
  if (!shapes) st.base = { player: cloneWheel(p.wheel), enemy: cloneWheel(e.wheel) };
  else if (intent.kind === 'mimicry' || intent.kind === 'lean') {
    // Hazards from a shaping intent never happen; just keep the player's base in sync.
    st.base!.player = cloneWheel(p.wheel);
  }
  ev.push({ who: 'enemy', kind: 'intent', text: e.intentText });
  for (const x of ev) if (x.kind !== 'intent') log(st, x.text);
  log(st, `Turn ${st.turn}. ${e.name}: ${e.intentText}`);
  return ev;
}

function chooseIntent(st: BattleState): IntentDef {
  const list = st.enemy.def.intents;
  const total = list.reduce((a, i) => a + i.w, 0);
  let r = int(st.rng, total);
  for (const i of list) { if (r < i.w) return i; r -= i.w; }
  return list[0];
}

function doIntent(st: BattleState, it: IntentDef): string {
  const e = st.enemy;
  const p = st.player;
  switch (it.kind) {
    case 'lean': {
      const t = it.type!;
      let n = 0;
      for (let k = 0; k < (it.n ?? 1); k++) {
        const from = largestType(e.wheel, t);
        const s = e.wheel.find((x) => isPlainTyped(x) && x.type === from && !x.lock);
        if (!s) break;
        convertSeg(s, t);
        n++;
      }
      return n ? `Leans ${TYPE_NAME[t]} this spin (+${n})` : 'Watches you';
    }
    case 'guard': e.st.armor += it.value ?? 0; return `Guards (+${it.value} Armor)`;
    case 'charge': e.charge += 1; return 'Charges (+1 dice step)';
    case 'hazard': return addHazard(st, it.hazard as 'blank' | 'rot' | 'fuse' | 'lock');
    case 'burn': p.st.burn += it.value ?? 0; return `Spits embers (+${it.value} Burn on you)`;
    case 'heal': { const h = heal(e, it.value ?? 0); return `Mends (+${h} HP)`; }
    case 'mimicry': {
      // Odd turns: copy your largest type. Even turns: betray it with a counter.
      let best: TypeId = 'rock';
      let bestN = -1;
      for (const t of TYPES) { const c = countType(p.wheel, t); if (c > bestN) { best = t; bestN = c; } }
      if (st.turn % 2 === 1) {
        let have = countType(e.wheel, best);
        for (const s of e.wheel) {
          if (have >= Math.min(bestN, e.wheel.length - 2)) break;
          if (isPlainTyped(s) && s.type !== best) { convertSeg(s, best); have++; }
        }
        return `Copies your ${TYPE_NAME[best]}`;
      }
      const into = countersOf(best)[0];
      let n = 0;
      for (const s of e.wheel) if (isPlainTyped(s) && s.type === best) { convertSeg(s, into); n++; }
      return `Betrays! ${n} ${TYPE_NAME[best]} -> ${TYPE_NAME[into]}`;
    }
    default: return 'Watches you';
  }
}

// ---------------------------------------------------------------- the spin

export interface SpinStep {
  pIdx: number;
  eIdx: number;
  pSeg: Segment;
  eSeg: Segment;
  outcome: Outcome;
}

export interface HitInfo {
  by: 'player' | 'enemy';
  rolls: number[];
  dieSize: number;
  crit: boolean;
  pot: number;
  total: number;
  absorbed: number;
  dealt: number;
  immune: boolean;
  capped: boolean;
  all: boolean;
}

export interface SpinReport {
  steps: SpinStep[]; // [0] = first spin; may include a luck re-spin and Loaded chain spins
  respun: boolean;
  chainFrom: number; // index in steps where the Loaded chain starts (-1 if none)
  outcome: Outcome;
  odds: Odds;
  potBefore: number;
  potAfter: number;
  hit: HitInfo | null;
  healed: { player: number; enemy: number };
  reflected: number;
  fuseBlast: number;
  defused: boolean;
  burnApplied: { player: number; enemy: number };
  hazardMsg: string | null;
  flowHeal: { player: number; enemy: number };
  events: string[];
  verb: string | null;
}

function spinOnce(st: BattleState): SpinStep {
  const p = st.player, e = st.enemy;
  const pIdx = int(st.rng, p.wheel.length);
  const eIdx = int(st.rng, e.wheel.length);
  const pSeg = effective(st, p, p.wheel[pIdx]);
  const eSeg = effective(st, e, e.wheel[eIdx]);
  return { pIdx, eIdx, pSeg, eSeg, outcome: compare(pSeg, eSeg) };
}

function rollHit(st: BattleState, atk: Fighter, def: Fighter, s: Segment): { rolls: number[]; size: number; crit: boolean; base: number } {
  const p = st.player;
  let steps = atk.might + atk.grit + atk.charge + atk.st.combo;
  if (!atk.isPlayer && affix(st.enemy, 'burnFrenzy') && def.st.burn > 0) steps++;
  const size = DICE[Math.max(0, Math.min(steps, 4))];
  const flat = steps > 4 ? Math.floor((steps - 4) / 2) : 0;
  const min = atk.isPlayer ? p.mods.diceMin : 1;
  const rolls = [Math.max(min, roll(st.rng, size))];
  const isRock = typesOf(s).includes('rock');
  if (atk.isPlayer && isRock) {
    if (p.mods.rockWinD4) rolls.push(roll(st.rng, 4));
    if (p.landslide) { rolls.push(Math.max(min, roll(st.rng, size))); }
    if (p.quake) { rolls.push(Math.max(min, roll(st.rng, size))); }
  }
  let crit = s.special === 'edge';
  if (atk.isPlayer && p.mods.firstWinCrit && !p.firstWinDone) crit = true;
  const base = rolls.reduce((a, b) => a + b, 0) * (crit ? 2 : 1) + flat;
  return { rolls, size, crit, base };
}

const chainsOn = (st: BattleState, f: Fighter, s: Segment) =>
  s.special === 'loaded' || (f.isPlayer && s.special === 'edge' && st.player.mods.edgesLoaded);

export function clench(st: BattleState): SpinReport {
  const p = st.player, e = st.enemy;
  const odds = battleOdds(st);
  const potBefore = st.pot;
  const rep: SpinReport = {
    steps: [], respun: false, chainFrom: -1, outcome: 'tie', odds, potBefore, potAfter: st.pot, hit: null,
    healed: { player: 0, enemy: 0 }, reflected: 0, fuseBlast: 0, defused: false,
    burnApplied: { player: 0, enemy: 0 }, hazardMsg: null, flowHeal: { player: 0, enemy: 0 }, events: [], verb: null,
  };
  st.stats.spins++;

  let step = spinOnce(st);
  rep.steps.push(step);
  // Luck: a lost spin may be re-spun once.
  let addBlank = false;
  if (step.outcome === 'loss' && p.luck > 0 && chance(st.rng, luckChance(p))) {
    step = spinOnce(st);
    rep.steps.push(step);
    rep.respun = true;
    rep.events.push('Luck! Re-spin.');
    if (p.mods.respinBlank) addBlank = true;
  }
  const decisive = step;
  rep.outcome = decisive.outcome;
  const landedUid = p.wheel[decisive.pIdx].uid;

  if (decisive.outcome === 'tie') {
    st.stats.ties++;
    const growth = { triple: p.doubleDown, nerve: p.nerve };
    st.pot = growPot(st.pot, growth);
    if (affix(e, 'hoarder')) st.pot = growPot(st.pot, {});
    p.st.combo = 0;
    e.st.combo = 0;
    if (p.mods.tieHeal) rep.healed.player += heal(p, p.mods.tieHeal);
    const pa = affix(e, 'potArmor');
    if (pa) { e.st.armor += pa.value ?? 0; rep.events.push(`${e.name} braces (+${pa.value} Armor)`); }
  } else {
    const playerWon = decisive.outcome === 'win';
    const atk: Fighter = playerWon ? p : e;
    const def: Fighter = playerWon ? e : p;
    const atkSegOf = (s: SpinStep) => (playerWon ? s.pSeg : s.eSeg);
    // Loaded chain.
    const chain: SpinStep[] = [decisive];
    if (chainsOn(st, atk, atkSegOf(decisive))) {
      rep.chainFrom = rep.steps.length;
      for (let k = 0; k < 3; k++) {
        const s = spinOnce(st);
        rep.steps.push(s);
        if (s.outcome !== decisive.outcome) break;
        chain.push(s);
        if (!chainsOn(st, atk, atkSegOf(s))) break;
      }
      if (chain.length > 1) rep.events.push(`Loaded! x${chain.length} chain`);
    }
    // Roll damage for each chain step (packs roll per living member).
    const rolls: number[] = [];
    let base = 0;
    let crit = false;
    let size = 4;
    let immune = false;
    const bulwark = affix(e, 'bulwark');
    for (const s of chain) {
      const seg = atkSegOf(s);
      if (playerWon && bulwark && typesOf(seg).includes(bulwark.type!)) { immune = true; continue; }
      const attackers = playerWon ? 1 : e.members.filter((m) => m.hp > 0).length;
      for (let a = 0; a < attackers; a++) {
        const h = rollHit(st, atk, def, seg);
        rolls.push(...h.rolls);
        base += h.base;
        crit = crit || h.crit;
        size = h.size;
      }
    }
    let total = Math.round(base * st.pot);
    let capped = false;
    if (!playerWon) {
      const cap = Math.ceil(maxHp(p) * 0.5); // Pot safety cap (Heat 0-2)
      if (total > cap) { total = cap; capped = true; }
    }
    const allHit = playerWon && p.quake && typesOf(decisive.pSeg).includes('rock');
    const res = damage(st, def, total, { all: allHit });
    rep.hit = { by: playerWon ? 'player' : 'enemy', rolls, dieSize: size, crit, pot: st.pot, total, absorbed: res.absorbed, dealt: res.dealt, immune, capped, all: allHit };
    st.stats.biggestHit = Math.max(st.stats.biggestHit, playerWon ? res.dealt : 0);
    if (immune && !res.dealt) rep.events.push(`${e.name} is immune to ${TYPE_NAME[bulwark!.type!]}!`);

    // Siphon / Thorn.
    if (chain.some((s) => atkSegOf(s).special === 'siphon') && res.dealt > 0) {
      const h = heal(atk, Math.floor(res.dealt * 0.5));
      if (playerWon) rep.healed.player += h; else rep.healed.enemy += h;
    }
    const defSeg = playerWon ? decisive.eSeg : decisive.pSeg;
    if (defSeg.special === 'thorn' && res.dealt > 0) {
      const r = Math.floor(res.dealt * 0.5);
      damage(st, atk, r, { pierce: true });
      rep.reflected = r;
    }

    if (playerWon) {
      st.stats.wins++;
      const ptypes = typesOf(decisive.pSeg);
      if (ptypes.includes('flame') && p.mods.flameWinBurn) { e.st.burn += p.mods.flameWinBurn; rep.burnApplied.enemy += p.mods.flameWinBurn; }
      if (ptypes.includes('rock')) { p.landslide = false; p.quake = false; }
      p.firstWinDone = true;
      p.st.combo++;
      e.st.combo = 0;
      if (affix(e, 'vengeful')) { e.grit++; rep.events.push(`${e.name} grows vengeful (+1 step)`); }
    } else {
      st.stats.losses++;
      const bow = affix(e, 'burnOnWin');
      if (bow) { p.st.burn += bow.value ?? 0; rep.burnApplied.player += bow.value ?? 0; }
      const sab = affix(e, 'saboteur');
      if (sab) rep.hazardMsg = addHazard(st, sab.hazard as 'blank');
      e.st.combo++;
      p.st.combo = 0;
      if (p.passives.includes('grit')) { p.grit++; rep.events.push('Grit: +1 Might this fight'); }
    }
    st.pot = 1;
    const a = typesOf(decisive.pSeg)[0], b = typesOf(decisive.eSeg)[0];
    if (a && b) rep.verb = playerWon ? `${a}>${b}` : `${b}>${a}`;
  }
  st.stats.biggestPot = Math.max(st.stats.biggestPot, st.pot);

  // Shaping lasts one spin: wheels return to how they stood at the start of the turn.
  restoreWheels(st);

  // Fuses: landing on one defuses it; the rest tick down.
  const landed = p.wheel.find((s) => s.uid === landedUid);
  if (landed && landed.fuse !== undefined) { delete landed.fuse; rep.defused = true; rep.events.push('Fuse defused!'); }
  for (const s of p.wheel) {
    if (s.fuse === undefined) continue;
    s.fuse--;
    if (s.fuse <= 0) { delete s.fuse; rep.fuseBlast += 10; }
  }

  if (rep.fuseBlast) {
    damage(st, p, rep.fuseBlast, { pierce: true });
    damage(st, e, rep.fuseBlast, { pierce: true });
    rep.events.push(`FUSE BLAST: ${rep.fuseBlast} to both!`);
  }
  if (addBlank) addHazard(st, 'blank');

  p.lastSeg = { ...decisive.pSeg };
  e.lastSeg = { ...decisive.eSeg };

  // End of turn: Flow heals.
  for (const f of [p, e] as Fighter[]) {
    if (f.st.flow > 0 && alive(f)) {
      const h = heal(f, f.st.flow);
      if (f.isPlayer) rep.flowHeal.player = h; else rep.flowHeal.enemy = h;
      f.st.flow--;
    }
  }
  checkOver(st);
  const flee = affix(e, 'fleeAfter');
  if (!st.over && flee && st.turn >= (flee.value ?? 3)) { st.over = 'fled'; rep.events.push(`${e.name} flees!`); }
  rep.potAfter = st.pot;
  for (const x of rep.events) log(st, x);
  log(st, describeSpin(rep));
  return rep;
}

export function restoreWheels(st: BattleState) {
  if (!st.base) return;
  const rev = new Set(st.revealed);
  st.player.wheel = cloneWheel(st.base.player);
  st.enemy.wheel = cloneWheel(st.base.enemy);
  for (const s of st.enemy.wheel) if (s.uid !== undefined && rev.has(s.uid)) delete s.fog;
  st.base = null;
}

function describeSpin(r: SpinReport): string {
  if (r.outcome === 'tie') return `Tie. Pot ${r.potBefore}x -> ${r.potAfter}x.`;
  const h = r.hit!;
  const who = h.by === 'player' ? 'You hit' : 'You take';
  return `${who} ${h.dealt}${h.absorbed ? ` (+${h.absorbed} blocked)` : ''}${h.crit ? ' CRIT' : ''}${h.pot > 1 ? ` at Pot ${h.pot}x` : ''}.`;
}

/** Plays as an honest, simple bot for the simulator: no skills, just spin. */
export function isOver(st: BattleState) {
  return st.over !== null;
}

export { isDead };
