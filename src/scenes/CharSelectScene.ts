import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { CHARACTERS, CharacterDef, SKILL } from '../core/content';
import { newRun } from '../core/run';
import { TYPES, TYPE_NAME, TypeId } from '../core/types';
import { buildWheel } from '../core/wheel';
import { clearSavedRun, saveRun, session } from '../session';
import { C, TYPE_COLOR, textStyle } from '../ui/theme';
import { Button, felt, panel, para } from '../ui/widgets';
import { WheelView } from '../ui/WheelView';

export class CharSelectScene extends Phaser.Scene {
  private pick = 0;
  private grain: TypeId[] = [];
  private detail?: Phaser.GameObjects.Container;
  private cards: Button[] = [];

  constructor() { super('CharSelect'); }

  create() {
    this.pick = 0;
    this.grain = ['paper', 'tide'];
    felt(this);
    this.add.text(180, 22, 'CHOOSE YOUR CHALLENGER', textStyle(8, C.gold)).setOrigin(0.5);
    this.cards = CHARACTERS.map((ch, i) => {
      const b = new Button(this, 92 + i * 176, 58, {
        w: 168, h: 44, label: `${ch.name.toUpperCase()}\n${ch.hp} HP`,
        onClick: () => { this.pick = i; this.refresh(); },
      });
      return b;
    });
    new Button(this, 60, 612, { w: 100, h: 34, label: 'BACK', onClick: () => this.scene.start('Title') });
    new Button(this, 236, 612, {
      w: 220, h: 40, label: 'BEGIN', size: 16,
      onClick: () => {
        const ch = CHARACTERS[this.pick];
        const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
        session.run = newRun(ch.id, seed, ch.grainChoice ? this.grain : []);
        clearSavedRun();
        saveRun();
        sfx.confirm();
        this.scene.start('Path');
      },
    });
    this.refresh();
  }

  private refresh() {
    this.cards.forEach((c, i) => c.setSelected(i === this.pick));
    this.detail?.destroy();
    const ch = CHARACTERS[this.pick];
    const d = this.add.container(0, 0);
    this.detail = d;
    const g = this.add.graphics();
    panel(g, 12, 88, 336, 498);
    d.add(g);
    d.add(this.add.text(24, 102, ch.name.toUpperCase(), textStyle(16, C.cream)));
    d.add(this.add.text(24, 124, ch.title, textStyle(8, C.dim)));
    d.add(para(this, 24, 142, ch.blurb, 180, C.gold));
    const stats = `HP    ${ch.hp}\nGRIP  ${ch.grip}/turn\nDICE  d${[4, 6, 8, 10, 12][ch.might]}\nINSIGHT ${ch.insight}`;
    d.add(this.add.text(24, 184, stats, textStyle(8, C.cream, { lineSpacing: 6 })));
    const wheel = new WheelView(this, 272, 186, 54, 'top');
    const counts = { ...ch.wheel };
    if (ch.grainChoice) for (const t of this.grain) counts[t] = (counts[t] ?? 0) + 1;
    wheel.setWheel(buildWheel(counts));
    d.add(wheel);

    let y = 260;
    d.add(this.add.text(24, y, 'PASSIVES', textStyle(8, C.gold)));
    y += 16;
    for (const p of ch.passiveText) {
      const t = para(this, 24, y, p, 312, C.cream);
      d.add(t);
      y += t.height + 8;
    }
    y += 4;
    d.add(this.add.text(24, y, 'SKILLS', textStyle(8, C.gold)));
    y += 16;
    const skills = [...ch.skills.map((s) => SKILL[s].name), `${SKILL[ch.signature].name} (signature)`];
    const st = para(this, 24, y, skills.join('  /  '), 312, C.cream);
    d.add(st);
    y += st.height + 8;
    const sig = para(this, 24, y, `${SKILL[ch.signature].name}: ${SKILL[ch.signature].desc}`, 312, C.dim);
    d.add(sig);
    y += sig.height + 12;
    if (ch.grainChoice) this.grainPicker(d, ch, y);
  }

  private grainPicker(d: Phaser.GameObjects.Container, _ch: CharacterDef, y: number) {
    d.add(this.add.text(24, y, `GRAIN: ${this.grain.map((t) => TYPE_NAME[t]).join(' + ') || 'pick 2'}`, textStyle(8, C.gold)));
    d.add(para(this, 24, y + 14, 'Tap two types to add to your wheel.', 312, C.dim));
    TYPES.forEach((t, i) => {
      const x = 46 + i * 66;
      const b = new Button(this, x, y + 50, {
        w: 58, h: 34, label: '', fill: TYPE_COLOR[t],
        onClick: () => {
          this.grain = [...this.grain.slice(-1), t];
          this.refresh();
        },
      });
      b.add(this.add.image(0, 0, `icon-${t}`).setScale(2));
      const n = this.grain.filter((x) => x === t).length;
      if (n) b.add(this.add.text(20, -12, `+${n}`, textStyle(8, C.ink)).setOrigin(1, 0));
      d.add(b);
    });
  }
}
