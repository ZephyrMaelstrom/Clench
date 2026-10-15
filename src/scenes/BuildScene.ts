import Phaser from 'phaser';
import { CHARACTER, ITEM, SKILL } from '../core/content';
import { runMaxHp } from '../core/run';
import { describeSegment, specialCount, MAX_SPECIALS } from '../core/wheel';
import { session } from '../session';
import { C, RARITY_COLOR, textStyle } from '../ui/theme';
import { Button, panel, para } from '../ui/widgets';
import { WheelView } from '../ui/WheelView';

/** Overlay showing the run's wheel, gear, relics and skills. Tap anything to read it. */
export class BuildScene extends Phaser.Scene {
  private from = 'Path';
  private info!: Phaser.GameObjects.Text;

  constructor() { super('Build'); }

  create(data: { from?: string }) {
    this.from = data.from ?? 'Path';
    const run = session.run!;
    const ch = CHARACTER[run.charId];
    this.add.rectangle(180, 320, 360, 640, 0x000000, 0.85).setInteractive();
    const g = this.add.graphics();
    panel(g, 8, 8, 344, 624);
    this.add.text(20, 20, `${ch.name.toUpperCase()}  ${run.hp}/${runMaxHp(run)} HP`, textStyle(8, C.cream));
    this.add.text(20, 34, `${run.wheel.length} segments, ${specialCount(run.wheel)}/${MAX_SPECIALS} specials`, textStyle(8, C.dim));
    const w = new WheelView(this, 180, 140, 82, 'top');
    w.setWheel(run.wheel);
    w.onSegment((i) => this.say(describeSegment(run.wheel[i])));

    let y = 240;
    this.add.text(20, y, 'GEAR', textStyle(8, C.gold));
    y += 14;
    for (const slot of ['glove', 'charm', 'talisman'] as const) {
      const id = run.items.find((x) => ITEM[x].slot === slot);
      const t = this.add.text(20, y, `${slot.toUpperCase().padEnd(9)} ${id ? ITEM[id].name : '-'}`, textStyle(8, id ? RARITY_COLOR[ITEM[id].rarity] : C.dim)).setInteractive();
      if (id) t.on('pointerdown', () => this.say(`${ITEM[id].name}: ${ITEM[id].desc}`));
      y += 14;
    }
    y += 6;
    this.add.text(20, y, 'RELICS', textStyle(8, C.gold));
    y += 14;
    const relics = run.items.filter((x) => ITEM[x].slot === 'relic');
    if (!relics.length) { this.add.text(20, y, '-', textStyle(8, C.dim)); y += 14; }
    relics.forEach((id, i) => {
      const t = this.add.text(20 + (i % 2) * 164, y + Math.floor(i / 2) * 14, ITEM[id].name, textStyle(8, RARITY_COLOR[ITEM[id].rarity])).setInteractive();
      t.on('pointerdown', () => this.say(`${ITEM[id].name}: ${ITEM[id].desc}`));
    });
    y += Math.ceil(relics.length / 2) * 14 + 6;
    this.add.text(20, y, 'SKILLS', textStyle(8, C.gold));
    y += 14;
    [...run.skills, run.signature].forEach((id, i) => {
      const t = this.add.text(20 + (i % 2) * 164, y + Math.floor(i / 2) * 14, `${SKILL[id].name}${id === run.signature ? '*' : ''} ${SKILL[id].cost}G`, textStyle(8, C.cream)).setInteractive();
      t.on('pointerdown', () => this.say(`${SKILL[id].name} (${SKILL[id].cost} Grip): ${SKILL[id].desc}`));
    });
    y += 3 * 14 + 6;
    this.add.text(20, y, 'PASSIVES', textStyle(8, C.gold));
    y += 14;
    const pt = para(this, 20, y, ch.passiveText.join('\n'), 320, C.dim);
    y += pt.height + 8;

    const ig = this.add.graphics();
    panel(ig, 16, 520, 328, 58, 0x1a1316, 0x5a4630);
    this.info = para(this, 24, 528, 'Tap the wheel, gear or skills to read them.', 312, C.cream);
    new Button(this, 180, 604, { w: 160, h: 32, label: 'CLOSE', onClick: () => this.close() });
  }

  private say(s: string) { this.info.setText(s); }

  private close() {
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
