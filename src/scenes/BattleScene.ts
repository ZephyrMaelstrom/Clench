import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import {
  BattleState, DICE, Fighter, SpinReport, SpinStep, TurnEvent, affix, battleOdds, clench, createBattle, hp, maxHp, startTurn,
} from '../core/battle';
import { ENEMY, SKILL, TargetKind } from '../core/content';
import { finishFight, fightSeed, loadout } from '../core/run';
import { Targets, canUse, skillCost, useSkill } from '../core/skills';
import { MATCHUP_VERB, TYPES, TYPE_NAME, TypeId } from '../core/types';
import { Segment, compare, describeSegment, isPlainTyped, typesOf } from '../core/wheel';
import { formatPot } from '../core/pot';
import { settings, vibrate } from '../settings';
import { saveRun, session } from '../session';
import { C, HEX, TYPE_COLOR, textStyle } from '../ui/theme';
import { Button, HPBar, OddsBar, felt, floatText, panel, para } from '../ui/widgets';
import { WheelView } from '../ui/WheelView';

type Step = 'type' | 'enemySeg' | 'ownSeg';
const STEPS: Record<TargetKind, Step[]> = {
  none: [], type: ['type'], enemySeg: ['enemySeg'], ownSeg: ['ownSeg'],
  'enemySeg+type': ['enemySeg', 'type'], 'type+type': ['type', 'type'], enemySeg2: ['enemySeg', 'enemySeg'],
};

const AFFIX_LABEL: Record<string, (v?: number, t?: TypeId) => string> = {
  pack: () => 'PACK', vengeful: () => 'VENGEFUL', burnOnWin: () => 'BURNS', fogged: () => 'FOGGED',
  fleeAfter: (v) => `FLEES T${v}`, burnFrenzy: () => 'FRENZY', bulwark: (_v, t) => `IMMUNE:${t ? TYPE_NAME[t].toUpperCase() : ''}`,
  mimic: () => 'MIMIC', saboteur: () => 'SABOTEUR', shifting: () => 'SHIFTING', potArmor: () => 'POT ARMOR',
  convertTide: () => 'KINDLES TIDE', hoarder: () => 'HOARDER', enrage: () => 'ENRAGE',
};

const CENTER = { x: 180, y: 248 };

export class BattleScene extends Phaser.Scene {
  b!: BattleState;
  ew!: WheelView;
  pw!: WheelView;
  odds!: OddsBar;
  eHp!: HPBar;
  pHp!: HPBar;
  eName!: Phaser.GameObjects.Text;
  intent!: Phaser.GameObjects.Text;
  affixText!: Phaser.GameObjects.Text;
  eStatus!: Phaser.GameObjects.Container;
  pStatus!: Phaser.GameObjects.Container;
  gripText!: Phaser.GameObjects.Text;
  potText!: Phaser.GameObjects.Text;
  potG!: Phaser.GameObjects.Graphics;
  turnText!: Phaser.GameObjects.Text;
  info!: Phaser.GameObjects.Text;
  skillBtns: { id: string; btn: Button }[] = [];
  clenchBtn!: Button;
  typePicker?: Phaser.GameObjects.Container;
  busy = true;
  sel: { id: string; steps: Step[]; targets: Targets; pending?: string } | null = null;

  constructor() { super('Battle'); }

  create() {
    const run = session.run!;
    const def = ENEMY[run.plan[run.fight]];
    this.b = createBattle(loadout(run), def, fightSeed(run));
    this.busy = true;
    this.sel = null;
    this.skillBtns = [];
    felt(this);
    this.buildLayout();
    this.intro();
  }

  // ------------------------------------------------------------ layout

  private buildLayout() {
    const b = this.b;
    // enemy header
    this.eName = this.add.text(12, 10, b.enemy.name.toUpperCase(), textStyle(8, C.cream)).setInteractive();
    this.eName.on('pointerdown', () => this.say(`${b.enemy.name}: ${b.enemy.def.desc}`));
    this.eHp = new HPBar(this, 12, 24, 196, 10, C.loss);
    this.intent = this.add.text(12, 42, '', textStyle(8, C.gold, { wordWrap: { width: 300 } }));
    this.affixText = this.add.text(12, 58, '', textStyle(8, C.dim));
    this.eStatus = this.add.container(220, 22);
    new Button(this, 324, 18, { w: 60, h: 26, label: 'BAG', onClick: () => { if (this.busy) return; this.scene.launch('Build', { from: 'Battle' }); this.scene.pause(); } });

    this.ew = new WheelView(this, 180, 140, 58, 'bottom');
    this.pw = new WheelView(this, 180, 354, 58, 'top');
    this.ew.onSegment((i) => this.tapSegment('enemy', i));
    this.pw.onSegment((i) => this.tapSegment('player', i));

    this.odds = new OddsBar(this, 20, 232, 320);
    this.turnText = this.add.text(14, 256, '', textStyle(8, C.dim));
    this.potG = this.add.graphics();
    this.potText = this.add.text(316, 268, '', textStyle(8, C.gold)).setOrigin(0.5);

    // player
    this.add.text(12, 420, 'YOU', textStyle(8, C.cream));
    this.pHp = new HPBar(this, 44, 419, 164, 10, C.win);
    this.pStatus = this.add.container(220, 418);
    this.gripText = this.add.text(12, 436, '', textStyle(8, C.gold));

    const p = b.player;
    const ids = [...p.skills, p.signature];
    ids.forEach((id, i) => {
      const d = SKILL[id];
      const btn = new Button(this, 40 + i * 70, 476, {
        w: 66, h: 46, label: '', border: id === p.signature ? C.gold : C.brass,
        onClick: () => this.tapSkill(id), sound: false,
      });
      btn.text.setText(this.skillLabel(d.name)).setY(-6);
      btn.sub = this.add.text(0, 14, '', textStyle(8, C.gold)).setOrigin(0.5);
      btn.add(btn.sub);
      this.skillBtns.push({ id, btn });
    });

    const ig = this.add.graphics();
    panel(ig, 8, 504, 344, 60, 0x1a1316, 0x5a4630);
    this.info = para(this, 16, 512, '', 328, C.cream);
    const infoZone = this.add.zone(180, 534, 344, 60).setInteractive();
    infoZone.on('pointerdown', () => { if (!this.sel) this.showLog(); });

    this.clenchBtn = new Button(this, 180, 600, {
      w: 240, h: 50, label: 'CLENCH', size: 16, fill: 0x4a1f1a, border: C.gold,
      hold: settings.holdToClench ? 380 : undefined,
      onClick: () => this.doClench(),
    });
  }

  private skillLabel(name: string) {
    return name.toUpperCase().replace(' ', '\n');
  }

  // ------------------------------------------------------------ refresh

  private refresh(instantHp = false) {
    const b = this.b;
    const pickedE = this.sel?.steps.length && this.sel.targets.segs ? this.sel.targets.segs : [];
    const step = this.currentStep();
    this.ew.setWheel(b.enemy.wheel, {
      selectable: step === 'enemySeg' ? (s) => !s.lock : step === 'ownSeg' ? () => false : undefined,
      picked: step === 'enemySeg' ? pickedE : [],
    });
    this.pw.setWheel(b.player.wheel, {
      selectable: step === 'ownSeg' ? (s) => isPlainTyped(s) : step === 'enemySeg' ? () => false : undefined,
    });
    if (instantHp) {
      this.eHp.set(hp(b.enemy), maxHp(b.enemy), true);
      this.pHp.set(hp(b.player), maxHp(b.player), true);
    }
    this.intent.setText(b.enemy.intentText ? `> ${b.enemy.intentText}` : '');
    this.affixText.setText(b.enemy.def.affixes.map((a) => AFFIX_LABEL[a.kind]?.(a.value, a.type) ?? a.kind.toUpperCase()).join(' '));
    const pk = b.enemy.members.length > 1 ? `  x${b.enemy.members.filter((m) => m.hp > 0).length}` : '';
    this.eName.setText(b.enemy.name.toUpperCase() + pk);
    this.drawStatus(this.eStatus, b.enemy, true);
    this.drawStatus(this.pStatus, b.player, false);
    const p = b.player;
    const steps = p.might + p.grit + p.st.combo;
    this.gripText.setText(`GRIP ${'#'.repeat(Math.max(0, p.grip))}${'.'.repeat(Math.max(0, p.gripPerTurn + 2 - p.grip))}  DICE d${DICE[Math.min(4, steps)]}${steps > 4 ? `+${Math.floor((steps - 4) / 2)}` : ''}${p.luck ? `  LUCK ${Math.round(p.luck * 5)}%` : ''}`);
    this.turnText.setText(`TURN ${b.turn}`);
    this.drawPot();
    for (const { id, btn } of this.skillBtns) {
      const c = canUse(b, id);
      const cost = skillCost(b, id);
      btn.sub!.setText(p.usedThisTurn.includes(id) ? 'USED' : cost === 0 && SKILL[id].cost > 0 ? 'FREE' : `${cost}G`);
      btn.setEnabled(!this.busy && c.ok);
      btn.setSelected(this.sel?.id === id);
    }
    this.clenchBtn.setEnabled(!this.busy);
    if (!this.sel) this.odds.set(battleOdds(b));
  }

  private drawStatus(c: Phaser.GameObjects.Container, f: Fighter, enemy: boolean) {
    c.removeAll(true);
    const items: [string, number, number][] = [];
    if (f.st.armor) items.push(['armor', f.st.armor, C.armor]);
    if (f.st.burn) items.push(['burn', f.st.burn, C.burn]);
    if (f.st.flow) items.push(['flow', f.st.flow, C.flow]);
    if (f.st.combo) items.push(['combo', f.st.combo, C.gold]);
    if (enemy && f.st.ink) items.push(['ink', f.st.ink, C.ink2]);
    if (enemy) {
      const e = this.b.enemy;
      const steps = e.might + e.grit + e.charge;
      items.push(['sword', DICE[Math.min(4, steps)], C.cream]);
    }
    items.slice(0, 4).forEach(([icon, n, col], i) => {
      const x = i * 26;
      c.add(this.add.image(x + 4, 6, `icon-${icon}`).setScale(1.4));
      c.add(this.add.text(x + 11, 2, icon === 'sword' ? `d${n}` : String(n), textStyle(8, col)));
    });
  }

  private drawPot() {
    const pot = this.b.pot;
    const g = this.potG.clear();
    g.fillStyle(C.ink, 1).fillEllipse(316, 258, 52, 22);
    g.fillStyle(C.brass, 1).fillEllipse(316, 256, 48, 18);
    g.fillStyle(0x3a2a14, 1).fillEllipse(316, 254, 40, 12);
    const coins = Math.min(10, Math.round(Math.log2(pot) * 2));
    for (let i = 0; i < coins; i++) g.fillStyle(i % 2 ? C.gold : 0xffe08a, 1).fillRect(300 + (i * 7) % 30, 250 - Math.floor(i / 4) * 3, 5, 3);
    this.potText.setText(`POT ${formatPot(pot)}`).setColor(HEX(pot >= 8 ? C.loss : pot > 1 ? C.gold : C.cream)).setY(282);
  }

  private say(msg: string, color: number = C.cream) {
    this.info.setText(msg).setColor(HEX(color));
  }

  // ------------------------------------------------------------ flow

  private intro() {
    this.refresh(true);
    const b = this.b;
    for (const w of [this.ew, this.pw]) { w.setScale(1.4).setAlpha(0); }
    this.tweens.add({ targets: [this.ew, this.pw], scale: 1, alpha: 1, duration: 260, ease: 'Quad.easeIn' });
    this.time.delayedCall(260, () => { sfx.slam(); this.shake(0.006, 160); vibrate(30); });
    const banner = this.add.container(180, 248).setDepth(60);
    const bg = this.add.rectangle(0, 0, 360, 56, C.ink, 0.92);
    const t1 = this.add.text(0, -10, b.enemy.name.toUpperCase(), textStyle(16, b.enemy.def.tier === 'elite' ? C.loss : C.cream)).setOrigin(0.5);
    const t2 = this.add.text(0, 12, b.enemy.def.tier === 'elite' ? 'ELITE CHALLENGE' : 'A CHALLENGE IS THROWN', textStyle(8, C.gold)).setOrigin(0.5);
    banner.add([bg, t1, t2]);
    banner.setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, duration: 200, delay: 300 });
    this.tweens.add({ targets: banner, alpha: 0, duration: 250, delay: settings.fast ? 900 : 1500, onComplete: () => { banner.destroy(); this.beginTurn(); } });
  }

  private beginTurn() {
    const ev = startTurn(this.b);
    this.showTurnEvents(ev);
    this.busy = false;
    this.refresh();
    if (this.b.over) { this.endBattle(); return; }
    this.say(this.b.turn === 1 ? 'Tap a skill to preview it, tap again to use it. Then hold CLENCH.' : 'Shape the odds, then CLENCH. Tap here for the log.', C.dim);
  }

  private showTurnEvents(ev: TurnEvent[]) {
    let d = 0;
    for (const e of ev) {
      if (e.kind === 'burn') {
        const pos = e.who === 'player' ? { x: 126, y: 412 } : { x: 110, y: 22 };
        floatText(this, pos.x, pos.y, `-${e.amount} BURN`, C.burn, 8, { delay: d });
        this.time.delayedCall(d, () => sfx.burn());
        d += 200;
      } else if (e.kind !== 'intent') {
        floatText(this, 180, e.who === 'player' ? 300 : 190, e.text.toUpperCase(), C.gold, 8, { delay: d });
        d += 250;
      }
    }
    this.time.delayedCall(d, () => {
      this.eHp.set(hp(this.b.enemy), maxHp(this.b.enemy));
      this.pHp.set(hp(this.b.player), maxHp(this.b.player));
    });
  }

  // ------------------------------------------------------------ skills & targeting

  private currentStep(): Step | null {
    if (!this.sel) return null;
    const done = (this.sel.targets.segs?.length ?? 0) + (this.sel.targets.types?.length ?? 0);
    return this.sel.steps[done] ?? null;
  }

  private tapSkill(id: string) {
    if (this.busy) return;
    const d = SKILL[id];
    const b = this.b;
    if (this.sel?.id === id) {
      if (!this.sel.steps.length) { this.commitSkill(); return; }
      this.cancelSel();
      sfx.back();
      return;
    }
    const c = canUse(b, id);
    if (!c.ok) { sfx.error(); this.say(`${d.name}: ${c.why}. ${d.desc}`, C.loss); return; }
    sfx.tap();
    this.sel = { id, steps: STEPS[d.target], targets: {} };
    this.closeTypePicker();
    const cost = skillCost(b, id);
    const head = `${d.name.toUpperCase()} (${cost} Grip): ${d.desc}`;
    if (!this.sel.steps.length) {
      this.say(`${head}\nTap again to use.`, C.cream);
      this.previewOdds();
    } else {
      this.promptStep(head);
    }
    this.refresh();
  }

  private promptStep(head?: string) {
    const step = this.currentStep();
    const d = SKILL[this.sel!.id];
    const base = head ?? `${d.name.toUpperCase()}:`;
    if (step === 'type') {
      const second = (this.sel!.targets.types?.length ?? 0) > 0 && d.target === 'type+type';
      this.say(`${base}\n${second ? 'Pick the type it becomes.' : d.target === 'type+type' ? 'Pick the enemy type to rewrite.' : 'Pick a type (tap twice to use).'}`);
      this.openTypePicker();
    } else if (step === 'enemySeg') {
      this.say(`${base}\nTap an enemy segment.${d.target === 'enemySeg' ? ' Tap it again to use.' : ''}`);
    } else if (step === 'ownSeg') {
      this.say(`${base}\nTap one of your plain segments. Tap it again to use.`);
    }
  }

  private cancelSel() {
    this.sel = null;
    this.closeTypePicker();
    this.refresh();
    this.say('Shape the odds, then CLENCH.', C.dim);
  }

  /** Record a choice; if it completes the targets, the first tap previews and a second identical tap commits. */
  private choose(kind: Step, value: number | TypeId) {
    const sel = this.sel!;
    const key = `${kind}:${value}`;
    const isLast = sel.steps.length - ((sel.targets.segs?.length ?? 0) + (sel.targets.types?.length ?? 0)) === 1;
    if (isLast && sel.pending !== key) {
      sel.pending = key;
      const t = this.withChoice(sel.targets, kind, value);
      this.previewOdds(t);
      sfx.tap();
      this.say(`${SKILL[sel.id].name.toUpperCase()}: tap again to confirm${kind === 'type' ? ` (${TYPE_NAME[value as TypeId]})` : ''}.`, C.gold);
      return;
    }
    sel.targets = this.withChoice(sel.targets, kind, value);
    sel.pending = undefined;
    if (this.currentStep()) {
      sfx.tap();
      this.promptStep();
      this.refresh();
      return;
    }
    this.commitSkill();
  }

  private withChoice(t: Targets, kind: Step, value: number | TypeId): Targets {
    if (kind === 'type') return { ...t, types: [...(t.types ?? []), value as TypeId] };
    return { ...t, segs: [...(t.segs ?? []), value as number] };
  }

  private previewOdds(t?: Targets) {
    const sel = this.sel!;
    const clone = structuredClone(this.b);
    const r = useSkill(clone, sel.id, t ?? sel.targets);
    if (r.ok) {
      this.odds.set(battleOdds(this.b), battleOdds(clone));
      // ghost the wheels the skill would change
      this.ew.setWheel(clone.enemy.wheel, { picked: t?.segs ?? [] });
      this.pw.setWheel(clone.player.wheel);
    }
  }

  private commitSkill() {
    const sel = this.sel!;
    const r = useSkill(this.b, sel.id, sel.targets);
    this.sel = null;
    this.closeTypePicker();
    if (!r.ok) { sfx.error(); this.say(r.msg, C.loss); this.refresh(); return; }
    const id = SKILL[sel.id];
    if (sel.id === 'brace' || sel.id === 'bedrock') sfx.armor();
    else if (sel.id === 'swell') sfx.heal();
    else if (sel.id === 'ignite') sfx.burn();
    else sfx.slide();
    if (id.enemy && this.b.player.passives.includes('paperwork')) floatText(this, 126, 410, '+2 ARMOR', C.armor);
    this.say(r.msg, C.win);
    vibrate(10);
    this.refresh();
  }

  private tapSegment(side: 'enemy' | 'player', i: number) {
    if (this.busy) return;
    const step = this.currentStep();
    if (step === 'enemySeg' && side === 'enemy') {
      const s = this.b.enemy.wheel[i];
      if (s.lock) { sfx.error(); this.say('That segment is Locked.', C.loss); return; }
      this.choose('enemySeg', i);
      return;
    }
    if (step === 'ownSeg' && side === 'player') {
      if (!isPlainTyped(this.b.player.wheel[i])) { sfx.error(); this.say('Pick a plain type segment.', C.loss); return; }
      this.choose('ownSeg', i);
      return;
    }
    if (step) { sfx.error(); return; }
    const s = (side === 'enemy' ? this.b.enemy.wheel : this.b.player.wheel)[i];
    this.say(`${side === 'enemy' ? 'ENEMY' : 'YOUR'} SEGMENT: ${describeSegment(s)}`, C.cream);
  }

  private openTypePicker() {
    this.closeTypePicker();
    const c = this.add.container(0, 0).setDepth(40);
    const bg = this.add.graphics();
    panel(bg, 8, 504, 344, 60, 0x1a1316, C.gold);
    c.add(bg);
    TYPES.forEach((t, i) => {
      const x = 44 + i * 68;
      const b = new Button(this, x, 542, {
        w: 60, h: 34, label: '', fill: TYPE_COLOR[t], sound: false,
        onClick: () => this.choose('type', t),
      });
      b.add(this.add.image(0, 0, `icon-${t}`).setScale(2));
      c.add(b);
    });
    c.add(this.add.text(180, 512, 'PICK A TYPE', textStyle(8, C.gold)).setOrigin(0.5));
    this.typePicker = c;
  }

  private closeTypePicker() {
    this.typePicker?.destroy();
    this.typePicker = undefined;
  }

  private showLog() {
    const layer = this.add.container(0, 0).setDepth(90);
    const shade = this.add.rectangle(180, 320, 360, 640, 0x000000, 0.75).setInteractive();
    const g = this.add.graphics();
    panel(g, 12, 80, 336, 480);
    const lines = this.b.log.slice(-26).join('\n');
    layer.add([shade, g, this.add.text(24, 92, 'COMBAT LOG', textStyle(8, C.gold)), para(this, 24, 110, lines, 312, C.cream)]);
    shade.on('pointerdown', () => layer.destroy());
  }

  // ------------------------------------------------------------ the spin

  private tensionFor(shaped: Segment[], k: number, step: SpinStep): -1 | 0 | 1 {
    if (Math.random() > 0.45 || shaped.length < 2) return 0;
    for (const dir of [1, -1] as const) {
      const n = shaped[(k + dir + shaped.length) % shaped.length];
      if (compare(n, step.eSeg) !== step.outcome) return dir;
    }
    return 0;
  }

  private async doClench() {
    if (this.busy || this.b.over) return;
    this.busy = true;
    this.sel = null;
    this.closeTypePicker();
    const shapedP = this.b.player.wheel.map((s) => ({ ...s }));
    const shapedE = this.b.enemy.wheel.map((s) => ({ ...s }));
    // Make sure the wheels on screen show exactly what is about to spin.
    this.ew.setWheel(shapedE);
    this.pw.setWheel(shapedP);
    this.odds.set(battleOdds(this.b));
    const r = clench(this.b);
    this.refreshButtonsOnly();
    vibrate(15);
    this.say('...', C.dim);

    const first = r.steps[0];
    const tension = this.tensionFor(shapedP, first.pIdx, first);
    if (tension) this.time.delayedCall(settings.fast ? 500 : 1300, () => sfx.tension());
    await Promise.all([this.ew.spinTo(first.eIdx), this.pw.spinTo(first.pIdx, { tension })]);
    let decisive = first;
    if (r.respun) {
      floatText(this, 180, 300, 'LUCK! RE-SPIN', C.gold, 16);
      sfx.coin(2);
      await this.wait(400);
      decisive = r.steps[1];
      await Promise.all([this.ew.spinTo(decisive.eIdx, { quick: true }), this.pw.spinTo(decisive.pIdx, { quick: true })]);
    }
    await this.clashAnim(decisive, r);

    // Loaded chain
    if (r.chainFrom >= 0) {
      for (let i = r.chainFrom; i < r.steps.length; i++) {
        const s = r.steps[i];
        floatText(this, 180, 300, 'LOADED! SPIN AGAIN', C.gold, 8);
        sfx.coin(3);
        await Promise.all([this.ew.spinTo(s.eIdx, { quick: true, turns: 1 }), this.pw.spinTo(s.pIdx, { quick: true, turns: 1 })]);
        const cont = s.outcome === decisive.outcome;
        floatText(this, CENTER.x, CENTER.y, cont ? 'CHAIN!' : 'MISS', cont ? C.win : C.dim, 8);
        await this.wait(300);
      }
    }
    await this.resolveAnim(r);
    await this.after(r);
  }

  private refreshButtonsOnly() {
    for (const { btn } of this.skillBtns) btn.setEnabled(false).setSelected(false);
    this.clenchBtn.setEnabled(false);
  }

  private wait(ms: number) {
    return new Promise<void>((res) => this.time.delayedCall(settings.fast ? ms * 0.6 : ms, res));
  }

  private shake(intensity: number, dur: number) {
    if (settings.reduceShake) intensity *= 0.25;
    this.cameras.main.shake(dur, intensity);
  }

  private iconFor(s: Segment) {
    return s.hazard ? s.hazard : s.type ? s.type : s.special ?? 'fog';
  }

  private async clashAnim(step: SpinStep, r: SpinReport) {
    const ep = this.ew.pointerPos();
    const pp = this.pw.pointerPos();
    this.ew.flashLanded();
    this.pw.flashLanded();
    const ei = this.add.image(ep.x, ep.y + 10, `icon-${this.iconFor(step.eSeg)}`).setScale(2).setDepth(30);
    const pi = this.add.image(pp.x, pp.y - 10, `icon-${this.iconFor(step.pSeg)}`).setScale(2).setDepth(30);
    const ring = (img: Phaser.GameObjects.Image, s: Segment) => {
      const col = s.type ? TYPE_COLOR[s.type] : s.special === 'wild' ? C.wild : s.special === 'mirror' ? C.mirror : C.fog;
      const c = this.add.circle(img.x, img.y, 14, col).setStrokeStyle(2, C.ink).setDepth(29);
      return c;
    };
    const ec = ring(ei, step.eSeg), pc = ring(pi, step.pSeg);
    await new Promise<void>((res) => {
      this.tweens.add({ targets: [ei, ec], x: CENTER.x, y: CENTER.y - 12, duration: 220, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: [pi, pc], x: CENTER.x, y: CENTER.y + 12, duration: 220, ease: 'Quad.easeIn', onComplete: () => res() });
    });
    const o = step.outcome;
    const winnerType = (o === 'win' ? typesOf(step.pSeg) : typesOf(step.eSeg))[0];
    if (o === 'tie') {
      sfx.tie();
      this.sparks(CENTER.x, CENTER.y, C.cream, 14);
      floatText(this, CENTER.x, CENTER.y - 30, 'CLASH!', C.cream, 16);
      this.tweens.add({ targets: [ei, ec], y: CENTER.y - 40, alpha: 0, duration: 380 });
      this.tweens.add({ targets: [pi, pc], y: CENTER.y + 40, alpha: 0, duration: 380 });
    } else {
      sfx.clash(winnerType);
      const loserImg = o === 'win' ? [ei, ec] : [pi, pc];
      const winImg = o === 'win' ? [pi, pc] : [ei, ec];
      const loserSeg = o === 'win' ? step.eSeg : step.pSeg;
      const col = loserSeg.type ? TYPE_COLOR[loserSeg.type] : C.fog;
      this.sparks(CENTER.x, CENTER.y, col, 18);
      this.tweens.add({ targets: loserImg, scale: 0, alpha: 0, duration: 260 });
      this.tweens.add({ targets: winImg, y: CENTER.y, scale: { from: 1, to: 1.6 }, duration: 160, yoyo: true });
      this.tweens.add({ targets: winImg, alpha: 0, duration: 300, delay: 450 });
      const verb = r.verb ? MATCHUP_VERB[r.verb] : o === 'win' ? 'WINS' : 'BEATS YOU';
      if (verb) floatText(this, CENTER.x, CENTER.y - 30, verb, o === 'win' ? C.win : C.loss, 16);
    }
    await this.wait(480);
    for (const x of [ei, pi, ec, pc]) x.destroy();
  }

  private sparks(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 20 + Math.random() * 40;
      const p = this.add.rectangle(x, y, 3, 3, color).setDepth(35);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 350 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  private async resolveAnim(r: SpinReport) {
    const b = this.b;
    if (r.outcome === 'tie') {
      sfx.coin(Math.log2(Math.max(1, r.potAfter)));
      for (let i = 0; i < 4; i++) {
        const c = this.add.rectangle(CENTER.x, CENTER.y, 5, 3, C.gold).setDepth(35);
        this.tweens.add({ targets: c, x: 304 + i * 6, y: 252, duration: 300, delay: i * 60, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
      }
      await this.wait(300);
      this.drawPot();
      this.tweens.add({ targets: this.potText, scale: { from: 1.8, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      floatText(this, 316, 232, formatPot(r.potAfter), C.gold, 16);
      vibrate(20);
    } else if (r.hit) {
      const h = r.hit;
      // Dice tumble
      sfx.dice();
      const dice = h.rolls.slice(0, 6).map((v, i) => {
        const x = CENTER.x + (i - (Math.min(6, h.rolls.length) - 1) / 2) * 22;
        const box = this.add.rectangle(x, CENTER.y, 18, 18, C.cream).setStrokeStyle(2, C.ink).setDepth(40);
        const t = this.add.text(x, CENTER.y + 1, '?', textStyle(8, C.ink)).setOrigin(0.5).setDepth(41);
        return { box, t, v };
      });
      for (let k = 0; k < 6; k++) {
        await this.wait(45);
        for (const d of dice) { d.t.setText(String(1 + Math.floor(Math.random() * h.dieSize))); d.box.setAngle((Math.random() - 0.5) * 30); }
      }
      for (const d of dice) { d.t.setText(String(d.v)); d.box.setAngle(0); }
      if (h.crit) {
        sfx.crit();
        const flash = this.add.rectangle(180, 320, 360, 640, 0xffffff, 0.6).setDepth(80);
        this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
        floatText(this, CENTER.x, CENTER.y - 30, 'CRIT x2', C.gold, 16);
        await this.wait(260);
      }
      if (h.pot > 1) floatText(this, CENTER.x + 70, CENTER.y, `x${formatPot(h.pot)}`, C.gold, 16);
      await this.wait(280);
      for (const d of dice) { d.box.destroy(); d.t.destroy(); }

      const jackpot = h.pot >= 8;
      if (jackpot) await this.jackpot(h.pot, h.by === 'player');
      const toEnemy = h.by === 'player';
      const target = toEnemy ? { x: 110, y: 30 } : { x: 126, y: 424 };
      const msg = h.immune && !h.dealt ? 'IMMUNE' : `-${h.dealt}`;
      floatText(this, target.x, target.y + (toEnemy ? 16 : -16), msg, toEnemy ? C.cream : C.loss, 16, { hold: 600 });
      if (h.absorbed) floatText(this, target.x + 70, target.y + (toEnemy ? 16 : -16), `${h.absorbed} BLOCKED`, C.armor, 8, { delay: 100 });
      if (h.capped) floatText(this, 180, 300, 'HIT CAPPED AT 50%', C.dim, 8, { delay: 200 });
      if (toEnemy) {
        sfx.win();
        this.eHp.set(hp(b.enemy), maxHp(b.enemy));
        this.tweens.add({ targets: this.ew, x: { from: 186, to: 180 }, duration: 160, ease: 'Bounce.easeOut' });
        vibrate(25);
      } else {
        sfx.loss();
        this.pHp.set(hp(b.player), maxHp(b.player));
        const frac = h.dealt / maxHp(b.player);
        this.shake(0.004 + frac * 0.04, 260);
        this.vignette();
        vibrate(Math.round(40 + frac * 200));
      }
      if (h.all && toEnemy) floatText(this, 180, 70, 'QUAKE HITS THE PACK!', C.gold, 8);
      await this.wait(350);
    }
    // Secondary effects
    const p = this.b.player;
    if (r.healed.player || r.flowHeal.player) { floatText(this, 126, 400, `+${r.healed.player + r.flowHeal.player} HP`, C.win, 8, { delay: 100 }); sfx.heal(); }
    if (r.healed.enemy || r.flowHeal.enemy) floatText(this, 110, 50, `+${r.healed.enemy + r.flowHeal.enemy} HP`, C.win, 8, { delay: 100 });
    if (r.reflected) floatText(this, r.hit?.by === 'player' ? 126 : 110, r.hit?.by === 'player' ? 400 : 50, `THORN -${r.reflected}`, C.loss, 8, { delay: 200 });
    if (r.burnApplied.enemy) floatText(this, 110, 50, `+${r.burnApplied.enemy} BURN`, C.burn, 8, { delay: 250 });
    if (r.burnApplied.player) floatText(this, 126, 400, `+${r.burnApplied.player} BURN`, C.burn, 8, { delay: 250 });
    if (r.hazardMsg) floatText(this, 180, 300, r.hazardMsg.toUpperCase().slice(0, 30), C.loss, 8, { delay: 300 });
    if (r.defused) floatText(this, 180, 300, 'FUSE DEFUSED', C.win, 8, { delay: 300 });
    if (r.fuseBlast) { sfx.fuse(); this.shake(0.02, 300); floatText(this, 180, 248, `FUSE BLAST -${r.fuseBlast}`, C.loss, 16, { delay: 200 }); }
    if (p.grit && r.outcome === 'loss' && p.passives.includes('grit')) floatText(this, 126, 440, 'GRIT +1 MIGHT', C.gold, 8, { delay: 350 });
    this.eHp.set(hp(b.enemy), maxHp(b.enemy));
    this.pHp.set(hp(b.player), maxHp(b.player));
    this.say(this.b.log[this.b.log.length - 1] ?? '', r.outcome === 'win' ? C.win : r.outcome === 'loss' ? C.loss : C.gold);
    await this.wait(250);
  }

  private vignette() {
    const g = this.add.graphics().setDepth(70);
    g.lineStyle(24, C.loss, 0.5).strokeRect(0, 0, 360, 640);
    this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  private async jackpot(pot: number, good: boolean) {
    sfx.jackpot();
    const t = this.add.text(180, 248, `JACKPOT ${formatPot(pot)}!`, textStyle(16, good ? C.gold : C.loss, { stroke: HEX(C.ink), strokeThickness: 6 })).setOrigin(0.5).setDepth(85).setScale(0.2);
    this.tweens.add({ targets: t, scale: 1.3, duration: 350, ease: 'Back.easeOut' });
    for (let i = 0; i < 40; i++) {
      const c = this.add.rectangle(Math.random() * 360, -10, 5, 4, i % 2 ? C.gold : 0xffe08a).setDepth(84);
      this.tweens.add({ targets: c, y: 660, angle: 360, duration: 900 + Math.random() * 700, delay: Math.random() * 300, onComplete: () => c.destroy() });
    }
    vibrate([60, 40, 60, 40, 120]);
    await this.wait(1000);
    this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
  }

  private async after(r: SpinReport) {
    // Shaping fades: wheels return to their start-of-turn state.
    this.refresh();
    if (this.b.over) { this.endBattle(); return; }
    await this.wait(250);
    this.beginTurn();
  }

  // ------------------------------------------------------------ end

  private endBattle() {
    const b = this.b;
    const run = session.run!;
    this.busy = true;
    this.refresh();
    const outcome = b.over!;
    const won = outcome !== 'lost';
    const tier = b.enemy.def.tier;
    const heal = finishFight(run, b);
    saveRun();
    if (won) sfx.victory(); else sfx.defeat();
    const banner = this.add.container(180, 248).setDepth(90);
    banner.add(this.add.rectangle(0, 0, 360, 90, C.ink, 0.94));
    banner.add(this.add.text(0, -18, outcome === 'won' ? 'VICTORY' : outcome === 'fled' ? 'IT FLED' : 'DEFEATED', textStyle(16, won ? C.gold : C.loss)).setOrigin(0.5));
    banner.add(this.add.text(0, 8, won ? `Breather: +${heal} HP` : 'Your Lotwheel cracks...', textStyle(8, C.cream)).setOrigin(0.5));
    banner.add(this.add.text(0, 28, 'TAP TO CONTINUE', textStyle(8, C.dim)).setOrigin(0.5));
    banner.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', () => {
        if (run.over) this.scene.start('Recap');
        else this.scene.start('Reward', { elite: tier === 'elite' });
      });
    });
  }
}

export { affix };
