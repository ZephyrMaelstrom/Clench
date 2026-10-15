// Balance simulator. Plays full 5-fight runs with the greedy bot and reports
// fight length, per-enemy win rates and run win rates.
//   npm run sim            (default 400 runs per character)
//   npm run sim -- 2000    (more runs)

import { clench, createBattle, startTurn } from '../src/core/battle';
import { botReward, botTurn } from '../src/core/bot';
import { CHARACTERS, ENEMY } from '../src/core/content';
import { finishFight, fightSeed, loadout, newRun, rewardOptions } from '../src/core/run';
import { TypeId } from '../src/core/types';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] ?? 400);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

for (const ch of CHARACTERS) {
  let runWins = 0;
  const turns: number[] = [];
  const perEnemy: Record<string, { fights: number; wins: number; turns: number; hpLost: number }> = {};
  let diedAt = [0, 0, 0, 0, 0];
  for (let r = 0; r < RUNS; r++) {
    const grain: TypeId[] = ch.grainChoice ? ['paper', 'tide'] : [];
    const run = newRun(ch.id, 1000 + r * 7919, grain);
    while (!run.over) {
      const id = run.plan[run.fight];
      const b = createBattle(loadout(run), ENEMY[id], fightSeed(run));
      const hpBefore = run.hp;
      startTurn(b);
      while (!b.over && b.turn < 80) {
        botTurn(b);
        clench(b);
        if (!b.over) startTurn(b);
      }
      if (!b.over) b.over = 'lost';
      const e = (perEnemy[id] ??= { fights: 0, wins: 0, turns: 0, hpLost: 0 });
      e.fights++; e.turns += b.turn;
      turns.push(b.turn);
      const idx = run.fight;
      finishFight(run, b);
      e.hpLost += hpBefore - Math.max(0, run.hp);
      if (b.over !== 'lost') e.wins++; else diedAt[idx]++;
      if (!run.over) botReward(run, rewardOptions(run, ENEMY[id].tier === 'elite'));
    }
    if (run.over === 'won') runWins++;
  }
  turns.sort((a, b) => a - b);
  const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
  console.log(`\n=== ${ch.name} (${RUNS} runs) ===`);
  console.log(`Run win rate: ${pct(runWins / RUNS)}   turns/fight avg ${avg.toFixed(1)}, median ${turns[turns.length >> 1]}`);
  console.log(`Died at fight #: ${diedAt.map((n, i) => `${i + 1}:${n}`).join('  ')}`);
  for (const [id, e] of Object.entries(perEnemy).sort()) {
    console.log(`  ${id.padEnd(16)} win ${pct(e.wins / e.fights).padStart(6)}  turns ${(e.turns / e.fights).toFixed(1).padStart(5)}  hp lost ${(e.hpLost / e.fights).toFixed(1).padStart(5)}  (${e.fights})`);
  }
}
