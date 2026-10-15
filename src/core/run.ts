// Run state: the chain of fights, the player's permanent wheel, items, skills and rewards.

import { BattleState, Loadout, hp as fighterHp } from './battle';
import { CHARACTER, ENEMIES, ITEM, ITEMS, ItemDef, SKILLS, modsFromItems } from './content';
import { RngState, int, makeRng, pick, shuffle } from './rng';
import { TypeId, countersOf } from './types';
import { MAX_SPECIALS, Segment, SpecialId, buildWheel, isPlainTyped, specialCount } from './wheel';

export const FIGHTS_PER_RUN = 5;
export const MAX_SKILLS = 4;
export const BREATHER_HEAL = 5;

export interface RunStats {
  fightsWon: number;
  spins: number;
  wins: number;
  ties: number;
  losses: number;
  biggestPot: number;
  biggestHit: number;
  dealt: number;
  taken: number;
}

export interface RunState {
  seed: number;
  rng: RngState;
  charId: string;
  wheel: Segment[];
  hp: number;
  items: string[];
  skills: string[];
  signature: string;
  fight: number;
  plan: string[];
  over: null | 'won' | 'lost';
  stats: RunStats;
}

export function newRun(charId: string, seed: number, grain: TypeId[] = []): RunState {
  const ch = CHARACTER[charId];
  const rng = makeRng(seed);
  const counts = { ...ch.wheel };
  for (const t of grain.slice(0, 2)) counts[t] = (counts[t] ?? 0) + 1;
  const run: RunState = {
    seed, rng, charId, wheel: buildWheel(counts), hp: ch.hp, items: [], skills: [...ch.skills],
    signature: ch.signature, fight: 0, plan: planFights(rng), over: null,
    stats: { fightsWon: 0, spins: 0, wins: 0, ties: 0, losses: 0, biggestPot: 1, biggestHit: 0, dealt: 0, taken: 0 },
  };
  return run;
}

function planFights(rng: RngState): string[] {
  const easy = shuffle(rng, ENEMIES.filter((e) => e.tier === 'easy').map((e) => e.id));
  const normal = shuffle(rng, ENEMIES.filter((e) => e.tier === 'normal').map((e) => e.id));
  const elite = ENEMIES.filter((e) => e.tier === 'elite').map((e) => e.id);
  return [easy[0], easy[1], normal[0], normal[1], pick(rng, elite)];
}

export function runMaxHp(run: RunState): number {
  return CHARACTER[run.charId].hp + modsFromItems(run.items).maxHp;
}

export function loadout(run: RunState): Loadout {
  return {
    charId: run.charId, wheel: run.wheel, hp: run.hp, maxHp: runMaxHp(run),
    items: run.items, skills: run.skills, signature: run.signature,
  };
}

export function fightSeed(run: RunState): number {
  return (run.seed ^ Math.imul(run.fight + 1, 2654435761)) >>> 0;
}

/** Apply a finished battle to the run. Returns the breather heal amount. */
export function finishFight(run: RunState, b: BattleState): number {
  const s = b.stats;
  run.stats.spins += s.spins; run.stats.wins += s.wins; run.stats.ties += s.ties; run.stats.losses += s.losses;
  run.stats.dealt += s.dealt; run.stats.taken += s.taken;
  run.stats.biggestPot = Math.max(run.stats.biggestPot, s.biggestPot);
  run.stats.biggestHit = Math.max(run.stats.biggestHit, s.biggestHit);
  run.hp = fighterHp(b.player);
  if (b.over === 'lost') { run.over = 'lost'; return 0; }
  run.stats.fightsWon++;
  run.fight++;
  const before = run.hp;
  run.hp = Math.min(runMaxHp(run), run.hp + BREATHER_HEAL);
  if (run.fight >= run.plan.length) run.over = 'won';
  return run.hp - before;
}

// ---------------------------------------------------------------- rewards

export type Reward =
  | { kind: 'item'; id: string }
  | { kind: 'skill'; id: string }
  | { kind: 'slice'; special: SpecialId };

const RARITY_W: Record<ItemDef['rarity'], number> = { common: 60, rare: 28, mythic: 8, cursed: 4 };
const SLICE_POOL: SpecialId[] = ['edge', 'loaded', 'wild', 'mirror', 'prism', 'siphon', 'thorn', 'echo'];

export function rewardOptions(run: RunState, elite = false): Reward[] {
  const r = run.rng;
  const pool = ITEMS.filter((i) => !run.items.includes(i.id));
  const weighted = pool.flatMap((i) => Array(elite && i.rarity === 'common' ? 1 : RARITY_W[i.rarity]).fill(i.id) as string[]);
  const item = weighted.length ? pick(r, weighted) : null;
  const skillPool = SKILLS.filter((s) => s.pool !== 'signature' && !run.skills.includes(s.id)).map((s) => s.id);
  const skill = skillPool.length ? pick(r, skillPool) : null;
  const out: Reward[] = [];
  if (item) out.push({ kind: 'item', id: item });
  if (skill) out.push({ kind: 'skill', id: skill });
  out.push({ kind: 'slice', special: SLICE_POOL[int(r, SLICE_POOL.length)] });
  return out;
}

/** Item in the same gear slot that would be replaced (relics never replace). */
export function slotConflict(run: RunState, itemId: string): string | null {
  const it = ITEM[itemId];
  if (it.slot === 'relic') return null;
  return run.items.find((id) => ITEM[id].slot === it.slot) ?? null;
}

export function takeItem(run: RunState, id: string) {
  const old = slotConflict(run, id);
  if (old) run.items = run.items.filter((x) => x !== old);
  const before = runMaxHp(run);
  run.items.push(id);
  const gain = runMaxHp(run) - before;
  if (gain > 0) run.hp += gain;
  run.hp = Math.min(run.hp, runMaxHp(run));
}

export function takeSkill(run: RunState, id: string, replace?: string): boolean {
  if (run.skills.length < MAX_SKILLS) { run.skills.push(id); return true; }
  if (!replace) return false;
  const i = run.skills.indexOf(replace);
  if (i < 0) return false;
  run.skills[i] = id;
  return true;
}

export function canPlaceSlice(run: RunState, special: SpecialId, i: number): boolean {
  const s = run.wheel[i];
  if (!s || s.hazard) return false;
  if (specialCount(run.wheel) >= MAX_SPECIALS && !s.special) return false;
  if (special === 'wild' || special === 'mirror' || special === 'echo') return true;
  return !!s.type && (isPlainTyped(s) || !!s.special);
}

/** Inlay a special slice permanently into the run wheel. */
export function placeSlice(run: RunState, special: SpecialId, i: number): boolean {
  if (!canPlaceSlice(run, special, i)) return false;
  const s = run.wheel[i];
  if (special === 'wild' || special === 'mirror' || special === 'echo') {
    run.wheel[i] = { special };
    return true;
  }
  const t = s.type!;
  run.wheel[i] = special === 'prism' ? { type: t, type2: countersOf(t)[0], special } : { type: t, special };
  return true;
}

export function healRun(run: RunState, amount: number): number {
  const before = run.hp;
  run.hp = Math.min(runMaxHp(run), run.hp + amount);
  return run.hp - before;
}
