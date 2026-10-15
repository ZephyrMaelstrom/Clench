import Phaser from 'phaser';
import { CHARACTER, ENEMY } from '../core/content';
import { FIGHTS_PER_RUN, runMaxHp } from '../core/run';
import { saveRun, session } from '../session';
import { C, textStyle } from '../ui/theme';
import { Button, HPBar, felt, panel, para } from '../ui/widgets';

const TIER_LABEL = { easy: 'SKIRMISH', normal: 'BRAWL', elite: 'ELITE' } as const;
const TIER_ICON = { easy: 'sword', normal: 'sword', elite: 'skull' } as const;

/** Between fights: shows the chain of 5 fights, HP, and the next challenge. */
export class PathScene extends Phaser.Scene {
  constructor() { super('Path'); }

  create() {
    const run = session.run;
    if (!run) { this.scene.start('Title'); return; }
    saveRun();
    felt(this);
    const ch = CHARACTER[run.charId];
    this.add.text(180, 24, 'THE EMBER FOOTHILLS', textStyle(8, C.gold)).setOrigin(0.5);
    this.add.text(180, 40, `${ch.name.toUpperCase()}  -  FIGHT ${run.fight + 1} OF ${FIGHTS_PER_RUN}`, textStyle(8, C.cream)).setOrigin(0.5);
    const hb = new HPBar(this, 40, 58, 280, 12, C.win);
    hb.set(run.hp, runMaxHp(run), true);

    const g = this.add.graphics();
    panel(g, 24, 86, 312, 330);
    run.plan.forEach((id, i) => {
      const def = ENEMY[id];
      const y = 112 + (FIGHTS_PER_RUN - 1 - i) * 62;
      const done = i < run.fight;
      const cur = i === run.fight;
      const rg = this.add.graphics();
      if (cur) rg.fillStyle(C.gold, 0.18).fillRect(32, y - 22, 296, 50);
      if (i > 0) rg.fillStyle(C.brass, 0.5).fillRect(56, y + 26, 2, 14);
      this.add.image(57, y, `icon-${done ? 'star' : TIER_ICON[def.tier]}`).setScale(3).setAlpha(done ? 0.5 : 1);
      const name = done || cur ? def.name.toUpperCase() : '???';
      this.add.text(84, y - 12, `${i + 1}. ${TIER_LABEL[def.tier]}`, textStyle(8, def.tier === 'elite' ? C.loss : C.gold));
      this.add.text(84, y + 2, name, textStyle(8, done ? C.dim : C.cream));
      if (cur) para(this, 84, y + 14, def.desc, 236, C.dim);
      if (done) this.add.text(320, y - 4, 'WON', textStyle(8, C.win)).setOrigin(1, 0);
    });

    para(this, 24, 428, 'Win to earn a reward. After each fight you catch your breath (+5 HP).', 312, C.dim);
    new Button(this, 180, 498, { w: 240, h: 48, label: 'FIGHT', size: 16, onClick: () => this.scene.start('Battle') });
    new Button(this, 100, 566, { w: 140, h: 36, label: 'BUILD', onClick: () => { this.scene.launch('Build', { from: 'Path' }); this.scene.pause(); } });
    new Button(this, 260, 566, { w: 140, h: 36, label: 'SAVE & QUIT', onClick: () => { saveRun(); this.scene.start('Title'); } });
  }
}
