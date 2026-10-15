import { describe, expect, it } from 'vitest';
import { battleOdds, clench, createBattle, effective, hp, maxHp, startTurn } from '../src/core/battle';
import { ENEMY, ENEMIES, ITEMS, SKILLS } from '../src/core/content';
import { loadout, newRun, placeSlice, takeItem } from '../src/core/run';
import { useSkill } from '../src/core/skills';
import { buildWheel } from '../src/core/wheel';

const fresh = (char = 'brawler', enemy = 'clan_bruiser', seed = 1) => {
  const run = newRun(char, seed, char === 'scribe' ? ['paper', 'tide'] : []);
  const b = createBattle(loadout(run), ENEMY[enemy], seed);
  startTurn(b);
  return { run, b };
};

describe('content', () => {
  it('has the counts the milestone asks for', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(20);
    expect(SKILLS.filter((s) => s.pool !== 'signature').length).toBeGreaterThanOrEqual(12);
    expect(ENEMIES.length).toBeGreaterThanOrEqual(8);
  });
  it('characters start on 12-segment wheels', () => {
    expect(newRun('brawler', 1).wheel).toHaveLength(12);
    expect(newRun('scribe', 1, ['rock', 'tide']).wheel).toHaveLength(12);
  });
});

describe('battle', () => {
  it('is deterministic for a seed', () => {
    const play = () => {
      const { b } = fresh('brawler', 'kindling_imp', 77);
      const out: string[] = [];
      while (!b.over && b.turn < 60) { out.push(clench(b).outcome); startTurn(b); }
      return out.join(',') + b.over;
    };
    expect(play()).toBe(play());
  });

  it('a lost spin damages HP but never wipes a full-HP player (Pot safety cap)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { b } = fresh('scribe', 'clan_warchief', seed);
      b.pot = 64;
      const r = clench(b);
      if (r.outcome === 'loss') {
        expect(r.hit!.total).toBeLessThanOrEqual(Math.ceil(maxHp(b.player) * 0.5));
        expect(hp(b.player)).toBeGreaterThan(0);
      }
    }
  });

  it('ties grow the Pot and a decisive spin resets it', () => {
    let sawTie = false, sawReset = false;
    for (let seed = 1; seed < 300 && !(sawTie && sawReset); seed++) {
      const { b } = fresh('brawler', 'clan_bruiser', seed);
      const r = clench(b);
      if (r.outcome === 'tie') { sawTie = true; expect(r.potAfter).toBe(2); }
      else { sawReset = true; expect(r.potAfter).toBe(1); }
    }
    expect(sawTie && sawReset).toBe(true);
  });

  it('skills spend Grip and move the displayed odds', () => {
    const { b } = fresh('brawler', 'kindling_imp', 5);
    const before = battleOdds(b).win;
    expect(b.player.grip).toBe(3);
    const r = useSkill(b, 'lean', { types: ['tide'] });
    expect(r.ok).toBe(true);
    expect(b.player.grip).toBe(2);
    expect(battleOdds(b).win).not.toBe(before);
    expect(useSkill(b, 'lean', { types: ['tide'] }).ok).toBe(false); // once per turn
  });

  it('Ink makes enemy-targeting skills free', () => {
    const { b } = fresh('scribe', 'clan_bruiser', 3);
    b.enemy.st.ink = 1;
    const grip = b.player.grip;
    expect(useSkill(b, 'amend', { segs: [0], types: ['scissors'] }).ok).toBe(true);
    expect(b.player.grip).toBe(grip);
    expect(b.enemy.st.ink).toBe(0);
  });

  it('Echo on the first spin plays as a Blank, then repeats the last result', () => {
    const { b } = fresh();
    expect(effective(b, b.player, { special: 'echo' }).hazard).toBe('blank');
    b.player.lastSeg = { type: 'tide' };
    expect(effective(b, b.player, { special: 'echo' }).type).toBe('tide');
  });

  it('Mask of the House turns Mirrors Wild at Pot 8x+', () => {
    const { run } = fresh();
    takeItem(run, 'mask_of_house');
    const b = createBattle(loadout(run), ENEMY.clan_bruiser, 9);
    b.pot = 8;
    expect(effective(b, b.player, { special: 'mirror' }).special).toBe('wild');
    b.pot = 4;
    expect(effective(b, b.player, { special: 'mirror' }).special).toBe('mirror');
  });

  it('Brawler Rock is Unbreakable: Saboteur hazards never land on Rock', () => {
    const { b } = fresh('brawler', 'coal_acolyte', 11);
    const rocks = () => b.player.wheel.filter((s) => s.type === 'rock' && !s.hazard).length;
    const n = rocks();
    for (let i = 0; i < 40 && !b.over; i++) { clench(b); startTurn(b); }
    expect(rocks()).toBeGreaterThanOrEqual(n);
  });

  it('Edge and Loaded stack: a Loaded Edge crits and chains', () => {
    const { run } = fresh();
    run.wheel = buildWheel({ rock: 12 });
    for (let i = 0; i < 12; i++) placeSlice(run, i % 2 ? 'edge' : 'loaded', i);
    takeItem(run, 'guild_shears'); // edges also count as loaded
    let chained = false, crit = false;
    for (let seed = 1; seed < 100; seed++) {
      const b = createBattle(loadout(run), { ...ENEMY.pebble_rat, wheel: { scissors: 8 }, affixes: [], intents: [{ kind: 'rest', w: 1 }] }, seed);
      startTurn(b);
      const r = clench(b);
      if (r.chainFrom >= 0 && r.steps.length > 1) chained = true;
      if (r.hit?.crit) crit = true;
    }
    expect(chained).toBe(true);
    expect(crit).toBe(true);
  });

  it('every skill and item can be used without throwing', () => {
    for (const s of SKILLS) {
      const { b } = fresh('scribe', 'ash_moth', 2);
      b.player.grip = 9;
      expect(() => useSkill(b, s.id, { segs: [0, 1], types: ['rock', 'paper'] })).not.toThrow();
    }
    for (const it of ITEMS) {
      const { run } = fresh();
      takeItem(run, it.id);
      const b = createBattle(loadout(run), ENEMY.slag_twins, 4);
      expect(() => { for (let i = 0; i < 30 && !b.over; i++) { startTurn(b); clench(b); } }).not.toThrow();
    }
  });
});

describe('ink', () => {
  it('Footnote is never free, so Ink cannot loop forever', () => {
    const run = newRun('scribe', 1, ['paper', 'tide']);
    const b = createBattle(loadout(run), ENEMY.clan_bruiser, 1);
    startTurn(b);
    b.enemy.st.ink = 2;
    const g = b.player.grip;
    expect(useSkill(b, 'footnote').ok).toBe(true);
    expect(b.player.grip).toBe(g - 1);
    expect(b.enemy.st.ink).toBe(5);
  });
});
