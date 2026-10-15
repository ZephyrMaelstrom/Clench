import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { ITEM, SKILL } from '../core/content';
import { Reward, canPlaceSlice, healRun, placeSlice, rewardOptions, slotConflict, takeItem, takeSkill } from '../core/run';
import { SPECIAL_INFO, SpecialId } from '../core/wheel';
import { saveRun, session } from '../session';
import { C, RARITY_COLOR, textStyle } from '../ui/theme';
import { Button, felt, panel, para } from '../ui/widgets';
import { WheelView } from '../ui/WheelView';

const SKIP_HEAL = 10;

/** Choose 1 of 3: an item, a skill, or a special slice to inlay into your wheel. */
export class RewardScene extends Phaser.Scene {
  private opts: Reward[] = [];
  private layer?: Phaser.GameObjects.Container;

  constructor() { super('Reward'); }

  create(data: { elite?: boolean }) {
    const run = session.run!;
    felt(this);
    this.opts = rewardOptions(run, !!data.elite);
    saveRun();
    sfx.reward();
    this.add.text(180, 26, 'SPOILS', textStyle(16, C.gold)).setOrigin(0.5);
    this.add.text(180, 48, 'Choose one', textStyle(8, C.dim)).setOrigin(0.5);
    this.opts.forEach((o, i) => this.card(o, 70 + i * 148));
    new Button(this, 180, 604, { w: 260, h: 36, label: `SKIP  (+${SKIP_HEAL} HP)`, onClick: () => { healRun(run, SKIP_HEAL); sfx.heal(); this.done(); } });
  }

  private card(o: Reward, y: number) {
    const run = session.run!;
    const g = this.add.graphics();
    let kind = '', name = '', desc = '', color: number = C.cream, extra = '';
    if (o.kind === 'item') {
      const it = ITEM[o.id];
      kind = `${it.slot === 'relic' ? 'RELIC' : `GEAR: ${it.slot.toUpperCase()}`} - ${it.rarity.toUpperCase()}`;
      name = it.name; desc = it.desc; color = RARITY_COLOR[it.rarity];
      const old = slotConflict(run, o.id);
      if (old) extra = `Replaces ${ITEM[old].name}`;
    } else if (o.kind === 'skill') {
      const s = SKILL[o.id];
      kind = `SKILL - ${s.cost} GRIP`; name = s.name; desc = s.desc; color = C.flow;
      if (run.skills.length >= 4) extra = 'Bar full: you will replace a skill';
    } else {
      kind = 'SLICE TOKEN'; name = SPECIAL_INFO[o.special].name; desc = `Inlay into your wheel permanently. ${SPECIAL_INFO[o.special].desc}`; color = C.wild;
    }
    panel(g, 16, y, 328, 136, C.panel, color);
    const icon = o.kind === 'slice' ? o.special : o.kind === 'skill' ? 'sword' : 'star';
    this.add.rectangle(42, y + 26, 34, 34, color).setStrokeStyle(2, C.ink);
    this.add.image(42, y + 26, `icon-${icon}`).setScale(3);
    this.add.text(64, y + 12, kind, textStyle(8, color));
    this.add.text(64, y + 26, name.toUpperCase(), textStyle(8, C.cream));
    para(this, 28, y + 48, desc, 304, C.cream);
    if (extra) para(this, 28, y + 96, extra, 200, C.gold);
    new Button(this, 290, y + 116, { w: 90, h: 24, label: 'TAKE', onClick: () => this.take(o) });
  }

  private take(o: Reward) {
    const run = session.run!;
    if (o.kind === 'item') { takeItem(run, o.id); sfx.confirm(); this.done(); return; }
    if (o.kind === 'skill') {
      if (takeSkill(run, o.id)) { sfx.confirm(); this.done(); return; }
      this.replaceSkill(o.id);
      return;
    }
    this.placeSlice(o.special);
  }

  private modal(title: string) {
    this.layer?.destroy();
    const layer = this.add.container(0, 0).setDepth(50);
    layer.add(this.add.rectangle(180, 320, 360, 640, 0x000000, 0.8).setInteractive());
    const g = this.add.graphics();
    panel(g, 12, 70, 336, 500);
    layer.add(g);
    layer.add(this.add.text(180, 90, title, textStyle(8, C.gold)).setOrigin(0.5));
    layer.add(new Button(this, 180, 544, { w: 140, h: 30, label: 'CANCEL', onClick: () => { layer.destroy(); this.layer = undefined; } }));
    this.layer = layer;
    return layer;
  }

  private replaceSkill(id: string) {
    const run = session.run!;
    const layer = this.modal(`REPLACE A SKILL WITH ${SKILL[id].name.toUpperCase()}`);
    run.skills.forEach((s, i) => {
      const d = SKILL[s];
      const b = new Button(this, 180, 140 + i * 84, {
        w: 300, h: 72, label: '',
        onClick: () => { takeSkill(run, id, s); sfx.confirm(); this.done(); },
      });
      b.add(this.add.text(-140, -28, d.name.toUpperCase(), textStyle(8, C.gold)));
      b.add(para(this, -140, -12, d.desc, 280, C.cream));
      layer.add(b);
    });
  }

  private placeSlice(special: SpecialId) {
    const run = session.run!;
    const layer = this.modal(`TAP A SEGMENT FOR ${SPECIAL_INFO[special].name.toUpperCase()}`);
    layer.add(para(this, 28, 106, SPECIAL_INFO[special].desc, 304, C.cream));
    const w = new WheelView(this, 180, 300, 110, 'top');
    w.setWheel(run.wheel, { selectable: (_s, i) => canPlaceSlice(run, special, i) });
    w.onSegment((i) => {
      if (!canPlaceSlice(run, special, i)) { sfx.error(); return; }
      placeSlice(run, special, i);
      sfx.confirm();
      w.setWheel(run.wheel);
      w.flashLanded(C.gold);
      this.time.delayedCall(450, () => this.done());
    });
    layer.add(w);
    layer.add(para(this, 28, 436, 'Typed slices keep their segment\'s type. Max 4 special slices.', 304, C.dim));
  }

  private done() {
    saveRun();
    this.scene.start('Path');
  }
}
