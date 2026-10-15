import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import type { Odds } from '../core/wheel';
import { C, HEX, textStyle } from './theme';

/** A beveled pixel panel. */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number = C.panel, border: number = C.brass) {
  g.fillStyle(C.ink, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(border, 1).fillRect(x, y, w, h);
  g.fillStyle(fill, 1).fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle(0xffffff, 0.06).fillRect(x + 2, y + 2, w - 4, 2);
}

export interface ButtonOpts {
  w: number;
  h: number;
  label: string;
  size?: number;
  fill?: number;
  border?: number;
  color?: number;
  onClick?: () => void;
  /** Hold to fire (ms). */
  hold?: number;
  sound?: boolean;
}

export class Button extends Phaser.GameObjects.Container {
  g: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  sub?: Phaser.GameObjects.Text;
  opts: ButtonOpts;
  enabled = true;
  selected = false;
  private holdT = 0;
  private holding = false;
  private holdBar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.opts = opts;
    this.g = scene.add.graphics();
    this.holdBar = scene.add.graphics();
    this.text = scene.add.text(0, 0, opts.label, textStyle(opts.size ?? 8, opts.color ?? C.cream, { align: 'center', lineSpacing: 4 })).setOrigin(0.5);
    this.add([this.g, this.holdBar, this.text]);
    this.setSize(opts.w, opts.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      unlockAudio();
      if (!this.enabled) return;
      if (opts.hold) { this.holding = true; this.holdT = 0; }
      this.draw(true);
    });
    this.on('pointerout', () => { this.holding = false; this.holdBar.clear(); this.draw(false); });
    this.on('pointerup', () => {
      if (!this.enabled) { sfx.error(); return; }
      this.draw(false);
      if (opts.hold) {
        if (this.holding && this.holdT < opts.hold) { this.holding = false; this.holdBar.clear(); this.flashHint(); }
        return;
      }
      if (opts.sound !== false) sfx.tap();
      opts.onClick?.();
    });
    scene.events.on('update', this.tick, this);
    this.once('destroy', () => scene.events.off('update', this.tick, this));
    this.draw(false);
    scene.add.existing(this);
  }

  private flashHint() {
    const orig = this.text.text;
    if (orig.startsWith('HOLD')) return;
    this.text.setText('HOLD TO\nCLENCH');
    this.scene.time.delayedCall(700, () => this.text.active && this.text.setText(orig));
  }

  private tick(_t: number, dt: number) {
    if (!this.holding || !this.opts.hold) return;
    this.holdT += dt;
    const p = Math.min(1, this.holdT / this.opts.hold);
    const { w, h } = this.opts;
    this.holdBar.clear().fillStyle(C.gold, 0.35).fillRect(-w / 2 + 2, -h / 2 + 2, (w - 4) * p, h - 4);
    if (p >= 1) {
      this.holding = false;
      this.holdBar.clear();
      this.draw(false);
      this.opts.onClick?.();
    }
  }

  draw(pressed: boolean) {
    const { w, h } = this.opts;
    this.g.clear();
    const fill = !this.enabled ? 0x2a2224 : this.selected ? C.panelLight : this.opts.fill ?? C.panel;
    const border = !this.enabled ? 0x4a3f3a : this.selected ? C.gold : this.opts.border ?? C.brass;
    panel(this.g, -w / 2, -h / 2 + (pressed ? 2 : 0), w, h - (pressed ? 2 : 0), fill, border);
    if (!pressed) this.g.fillStyle(C.ink, 0.6).fillRect(-w / 2, h / 2, w, 2);
    this.text.setY(pressed ? 1 : 0).setAlpha(this.enabled ? 1 : 0.45);
    this.sub?.setAlpha(this.enabled ? 1 : 0.45);
  }

  setEnabled(v: boolean) { this.enabled = v; this.draw(false); return this; }
  setSelected(v: boolean) { this.selected = v; this.draw(false); return this; }
  setLabel(s: string) { this.text.setText(s); return this; }
}

/** HP bar with a trailing ghost bar showing how much the last hit took. */
export class HPBar extends Phaser.GameObjects.Container {
  g: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  w: number;
  h: number;
  shown = 1;
  ghost = 1;
  max = 1;
  value = 1;
  color: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number = C.loss) {
    super(scene, x, y);
    this.w = w; this.h = h; this.color = color;
    this.g = scene.add.graphics();
    this.label = scene.add.text(w / 2, h / 2 + 1, '', textStyle(8, C.cream)).setOrigin(0.5);
    this.add([this.g, this.label]);
    scene.add.existing(this);
  }

  set(value: number, max: number, instant = false) {
    const prevFrac = this.shown;
    this.value = Math.max(0, value);
    this.max = max;
    const frac = this.value / max;
    this.label.setText(`${this.value}/${max}`);
    if (instant) { this.shown = this.ghost = frac; this.draw(); return; }
    if (frac < prevFrac) {
      this.shown = frac;
      this.ghost = Math.max(this.ghost, prevFrac);
      this.draw();
      this.scene.tweens.addCounter({
        from: this.ghost, to: frac, duration: 600, delay: 350, ease: 'Quad.easeIn',
        onUpdate: (tw) => { this.ghost = tw.getValue() ?? frac; this.draw(); },
      });
    } else {
      this.scene.tweens.addCounter({
        from: prevFrac, to: frac, duration: 400,
        onUpdate: (tw) => { this.shown = this.ghost = tw.getValue() ?? frac; this.draw(); },
      });
    }
  }

  draw() {
    const { w, h } = this;
    this.g.clear();
    this.g.fillStyle(C.ink, 1).fillRect(-1, -1, w + 2, h + 2);
    this.g.fillStyle(0x3a1f22, 1).fillRect(0, 0, w, h);
    this.g.fillStyle(0xf6eedb, 0.85).fillRect(0, 0, Math.round(w * this.ghost), h);
    this.g.fillStyle(this.color, 1).fillRect(0, 0, Math.round(w * this.shown), h);
    this.g.fillStyle(0xffffff, 0.18).fillRect(0, 0, Math.round(w * this.shown), 2);
  }
}

/** Win / Tie / Loss bar. Shows a preview arrow when a skill is being considered. */
export class OddsBar extends Phaser.GameObjects.Container {
  g: Phaser.GameObjects.Graphics;
  tw: Phaser.GameObjects.Text;
  tt: Phaser.GameObjects.Text;
  tl: Phaser.GameObjects.Text;
  w: number;
  cur: { win: number; tie: number; loss: number } = { win: 0.4, tie: 0.2, loss: 0.4 };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number) {
    super(scene, x, y);
    this.w = w;
    this.g = scene.add.graphics();
    this.tw = scene.add.text(0, -12, '', textStyle(8, C.win));
    this.tt = scene.add.text(w / 2, -12, '', textStyle(8, C.tie)).setOrigin(0.5, 0);
    this.tl = scene.add.text(w, -12, '', textStyle(8, C.loss)).setOrigin(1, 0);
    this.add([this.g, this.tw, this.tt, this.tl]);
    scene.add.existing(this);
  }

  set(o: Odds, preview?: Odds) {
    const target = preview ?? o;
    const pc = (x: number) => `${Math.round(x * 100)}%`;
    const rng = (lo: number, hi: number) => (Math.round(lo * 100) === Math.round(hi * 100) ? pc(lo) : `${Math.round(lo * 100)}-${pc(hi)}`);
    if (preview) {
      this.tw.setText(`WIN ${pc(o.win)}>${pc(preview.win)}`);
      this.tl.setText(`${pc(o.loss)}>${pc(preview.loss)} LOSS`);
      this.tt.setText(`TIE ${pc(preview.tie)}`);
    } else if (o.fogged) {
      this.tw.setText(`WIN ${rng(o.winLo, o.winHi)}`);
      this.tl.setText(`${rng(o.lossLo, o.lossHi)} LOSS`);
      this.tt.setText('?');
    } else {
      this.tw.setText(`WIN ${pc(o.win)}`);
      this.tt.setText(`TIE ${pc(o.tie)}`);
      this.tl.setText(`${pc(o.loss)} LOSS`);
    }
    const from = { ...this.cur };
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 260, ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        this.cur = {
          win: from.win + (target.win - from.win) * k,
          tie: from.tie + (target.tie - from.tie) * k,
          loss: from.loss + (target.loss - from.loss) * k,
        };
        this.draw(!!preview, o.fogged && !preview ? o : null);
      },
    });
  }

  draw(preview: boolean, fog: Odds | null) {
    const { w } = this;
    const h = 10;
    const g = this.g.clear();
    g.fillStyle(C.ink, 1).fillRect(-2, -2, w + 4, h + 4);
    const ww = Math.round(w * this.cur.win);
    const wl = Math.round(w * this.cur.loss);
    g.fillStyle(C.win, 1).fillRect(0, 0, ww, h);
    g.fillStyle(C.tie, 1).fillRect(ww, 0, w - ww - wl, h);
    g.fillStyle(C.loss, 1).fillRect(w - wl, 0, wl, h);
    g.fillStyle(0xffffff, 0.2).fillRect(0, 0, w, 2);
    if (fog) {
      // Hatch the uncertain zones.
      g.fillStyle(C.ink, 0.45);
      const a = Math.round(w * fog.winLo), b = Math.round(w * fog.winHi);
      for (let x = a; x < b; x += 3) g.fillRect(x, 0, 1, h);
      const c = Math.round(w * (1 - fog.lossHi)), d = Math.round(w * (1 - fog.lossLo));
      for (let x = c; x < d; x += 3) g.fillRect(x, 0, 1, h);
    }
    if (preview) g.lineStyle(2, C.gold, 1).strokeRect(-2, -2, w + 4, h + 4);
  }
}

/** Floating text that drifts up and fades (damage numbers, statuses). */
export function floatText(scene: Phaser.Scene, x: number, y: number, msg: string, color: number = C.cream, size = 8, opts: { dy?: number; delay?: number; hold?: number } = {}) {
  const t = scene.add.text(x, y, msg, textStyle(size, color, { stroke: HEX(C.ink), strokeThickness: size >= 16 ? 6 : 4 })).setOrigin(0.5).setDepth(50).setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 120, delay: opts.delay ?? 0, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: t, y: y - (opts.dy ?? 22), alpha: 0, duration: 700, delay: (opts.delay ?? 0) + (opts.hold ?? 450), ease: 'Quad.easeIn',
    onComplete: () => t.destroy(),
  });
  return t;
}

/** Word-wrapped text helper. */
export function para(scene: Phaser.Scene, x: number, y: number, msg: string, width: number, color: number = C.cream, size = 8) {
  return scene.add.text(x, y, msg, textStyle(size, color, { wordWrap: { width }, lineSpacing: 4 }));
}

export function felt(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  g.fillStyle(C.felt, 1).fillRect(0, 0, 360, 640);
  // pixel dither for felt texture
  g.fillStyle(C.feltDark, 1);
  for (let y = 0; y < 640; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < 360; x += 4) g.fillRect(x, y, 1, 1);
  g.fillStyle(C.brass, 1).fillRect(0, 0, 360, 3).fillRect(0, 637, 360, 3).fillRect(0, 0, 3, 640).fillRect(357, 0, 3, 640);
  return g;
}
