// A simple greedy player used by the balance simulator.
// Each turn it tries every affordable skill/target and keeps whatever most improves
// (win - loss) on the real odds, the same odds a human sees.

import { BattleState, affix, battleOdds, convertSeg, hp, maxHp } from './battle';
import { computeOdds, typesOf } from './wheel';
import { SKILL } from './content';
import { RunState, canPlaceSlice, placeSlice, rewardOptions, takeItem, takeSkill, Reward } from './run';
import { Targets, canUse, useSkill } from './skills';
import { TYPES } from './types';

const score = (st: BattleState) => {
  // Wins on a type the enemy is immune to deal nothing, so score them like ties.
  const bw = affix(st.enemy, 'bulwark')?.type;
  const o = bw
    ? computeOdds(st.player.wheel.map((s) => (typesOf(s).includes(bw) ? { special: 'mirror' as const } : s)), st.enemy.wheel)
    : battleOdds(st);
  // A small bonus for defensive value so Armor/Flow skills get used.
  return o.win - o.loss + st.player.st.armor * 0.004 + st.player.st.flow * 0.003 + st.enemy.st.burn * 0.004;
};

function targetOptions(st: BattleState, id: string): Targets[] {
  const d = SKILL[id];
  const eSegs = st.enemy.wheel.map((_, i) => i);
  const pSegs = st.player.wheel.map((_, i) => i);
  switch (d.target) {
    case 'none': return [{}];
    case 'type': return TYPES.map((t) => ({ types: [t] }));
    case 'enemySeg': return eSegs.map((i) => ({ segs: [i] }));
    case 'ownSeg': return pSegs.map((i) => ({ segs: [i] }));
    case 'enemySeg+type': return eSegs.flatMap((i) => TYPES.map((t) => ({ segs: [i], types: [t] })));
    case 'type+type': return TYPES.flatMap((a) => TYPES.filter((b) => b !== a).map((b) => ({ types: [a, b] })));
    case 'enemySeg2': return eSegs.flatMap((i) => eSegs.filter((j) => j > i).map((j) => ({ segs: [i, j] })));
  }
}

export function botTurn(st: BattleState) {
  for (let guard = 0; guard < 8; guard++) {
    const base = score(st);
    let best: { id: string; t: Targets; s: number } | null = null;
    for (const id of [...st.player.skills, st.player.signature]) {
      if (!canUse(st, id).ok) continue;
      for (const t of targetOptions(st, id)) {
        const c = structuredClone(st);
        if (!useSkill(c, id, t).ok) continue;
        // Delayed effects (Clause) are scored as if they had already landed, slightly discounted.
        if (id === 'clause' && t.types) {
          const [from, to] = t.types;
          for (const seg of c.enemy.wheel) if (seg.type === from && !seg.special && !seg.hazard && !seg.lock) convertSeg(seg, to);
          const s = score(c) - 0.03;
          if (s > base + 0.005 && (!best || s > best.s)) best = { id, t, s };
          continue;
        }
        const s = score(c);
        if (s > base + 0.005 && (!best || s > best.s)) best = { id, t, s };
      }
    }
    if (!best) return;
    useSkill(st, best.id, best.t);
  }
}

export function botReward(run: RunState, opts: Reward[]) {
  // Prefer items, then slices, then skills.
  const item = opts.find((o) => o.kind === 'item');
  if (item && item.kind === 'item') { takeItem(run, item.id); return; }
  const slice = opts.find((o) => o.kind === 'slice');
  if (slice && slice.kind === 'slice') {
    for (let i = 0; i < run.wheel.length; i++) if (canPlaceSlice(run, slice.special, i)) { placeSlice(run, slice.special, i); return; }
  }
  const skill = opts.find((o) => o.kind === 'skill');
  if (skill && skill.kind === 'skill') takeSkill(run, skill.id, run.skills[0]);
}

export { hp, maxHp, rewardOptions };
