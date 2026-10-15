import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import type { Segment } from '../core/wheel';
import { settings } from '../settings';
import { C, HEX, TYPE_COLOR, textStyle } from './theme';

const TAU = Math.PI * 2;

export interface WheelDrawOpts {
  /** Segments that can be tapped right now (targeting). Others are dimmed. */
  selectable?: (s: Segment, i: number) => boolean;
  /** Segments picked so far in a multi-pick. */
  picked?: number[];
}

/** A Lotwheel: segments rotate inside a brass rim; a fixed pointer marks the result. */
export class WheelView extends Phaser.GameObjects.Container {
  r: number;
  pointerAngle: number;
  rot: Phaser.GameObjects.Container;
  wedges: Phaser.GameObjects.Graphics;
  overlay: Phaser.GameObjects.Graphics;
  rim: Phaser.GameObjects.Graphics;
  segs: Segment[] = [];
  private iconObjs: Phaser.GameObjects.GameObject[] = [];
  private onTap?: (i: number) => void;
  spinning = false;

  constructor(scene: Phaser.Scene, x: number, y: number, r: number, pointer: 'top' | 'bottom' = 'top') {
    super(scene, x, y);
    this.r = r;
    this.pointerAngle = pointer === 'top' ? -Math.PI / 2 : Math.PI / 2;
    this.rot = scene.add.container(0, 0);
    this.wedges = scene.add.graphics();
    this.overlay = scene.add.graphics();
    this.rot.add([this.wedges]);
    this.rim = scene.add.graphics();
    this.add([this.rot, this.overlay, this.rim]);
    this.drawRim();
    const zone = scene.add.zone(0, 0, r * 2, r * 2).setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.spinning || !this.onTap || !this.segs.length) return;
      const lx = p.worldX - this.x, ly = p.worldY - this.y;
      if (Math.hypot(lx, ly) < r * 0.2) return;
      this.onTap(this.indexAtAngle(Math.atan2(ly, lx)));
    });
    this.add(zone);
    scene.add.existing(this);
  }

  get theta() { return TAU / Math.max(1, this.segs.length); }

  /** Which segment sits under a world-space angle (radians, Phaser convention). */
  indexAtAngle(a: number): number {
    const local = (((a - this.rot.rotation + Math.PI / 2) % TAU) + TAU) % TAU;
    return Math.floor(local / this.theta) % this.segs.length;
  }

  get landedIndex() { return this.indexAtAngle(this.pointerAngle); }

  /** World position of the pointer tip. */
  pointerPos() {
    const d = this.r + 6;
    return { x: this.x + Math.cos(this.pointerAngle) * d, y: this.y + Math.sin(this.pointerAngle) * d };
  }

  onSegment(cb: ((i: number) => void) | undefined) { this.onTap = cb; }

  private drawRim() {
    const { r } = this;
    const g = this.rim.clear();
    g.lineStyle(4, C.ink, 1).strokeCircle(0, 0, r + 3);
    g.lineStyle(3, C.brass, 1).strokeCircle(0, 0, r + 2);
    g.lineStyle(1, C.brassLight, 1).strokeCircle(0, 0, r + 3);
    g.fillStyle(C.ink, 1).fillCircle(0, 0, r * 0.2 + 2);
    g.fillStyle(C.brass, 1).fillCircle(0, 0, r * 0.2);
    g.fillStyle(C.brassLight, 1).fillCircle(-2, -2, r * 0.08);
    // pointer
    const a = this.pointerAngle;
    const tip = { x: Math.cos(a) * (r - 4), y: Math.sin(a) * (r - 4) };
    const base = r + 12;
    const px = Math.cos(a + Math.PI / 2) * 8, py = Math.sin(a + Math.PI / 2) * 8;
    const bx = Math.cos(a) * base, by = Math.sin(a) * base;
    g.fillStyle(C.ink, 1).fillTriangle(tip.x, tip.y, bx + px * 1.25, by + py * 1.25, bx - px * 1.25, by - py * 1.25);
    g.fillStyle(C.cream, 1).fillTriangle(tip.x + Math.cos(a) * 3, tip.y + Math.sin(a) * 3, bx + px, by + py, bx - px, by - py);
  }

  setWheel(segs: Segment[], opts: WheelDrawOpts = {}) {
    this.segs = segs;
    const { r } = this;
    const g = this.wedges.clear();
    for (const o of this.iconObjs) o.destroy();
    this.iconObjs = [];
    const th = this.theta;
    const n = segs.length;
    const iconScale = n <= 9 ? 2 : n <= 16 ? 1.5 : 1;
    segs.forEach((s, i) => {
      const a0 = -Math.PI / 2 + i * th;
      const a1 = a0 + th;
      const mid = (a0 + a1) / 2;
      const color = s.fog ? C.fog : s.hazard === 'blank' ? C.blank : s.hazard === 'rot' ? C.rot
        : s.special === 'wild' ? C.wild : s.special === 'mirror' ? C.mirror : s.special === 'echo' ? C.echo
        : s.type ? TYPE_COLOR[s.type] : C.fog;
      g.fillStyle(color, 1).slice(0, 0, r, a0, a1, false).fillPath();
      // inner shading ring
      g.fillStyle(0x000000, 0.12).slice(0, 0, r * 0.42, a0, a1, false).fillPath();
      if (s.special === 'prism' && s.type2 && !s.fog) g.fillStyle(TYPE_COLOR[s.type2], 1).slice(0, 0, r * 0.5, a0, a1, false).fillPath();
      const sel = opts.selectable ? opts.selectable(s, i) : true;
      if (!sel) g.fillStyle(0x000000, 0.55).slice(0, 0, r, a0, a1, false).fillPath();
      if (opts.picked?.includes(i)) g.fillStyle(C.gold, 0.45).slice(0, 0, r, a0, a1, false).fillPath();
      // icon
      const key = s.fog ? 'fog' : s.hazard ? s.hazard : s.type ? s.type : s.special!;
      const ir = s.special && s.type ? r * 0.58 : r * 0.66;
      const small = s.fog || s.hazard || !s.type; // 7px icons get a little extra scale
      const img = this.scene.add.image(Math.cos(mid) * ir, Math.sin(mid) * ir, `icon-${key}`).setScale(small ? iconScale * 1.25 : iconScale);
      img.setRotation(mid + Math.PI / 2);
      this.rot.add(img);
      this.iconObjs.push(img);
      if (s.special && s.type && !s.fog) {
        const sr = r * 0.88;
        const inl = this.scene.add.image(Math.cos(mid) * sr, Math.sin(mid) * sr, `icon-${s.special}`).setRotation(mid + Math.PI / 2).setScale(Math.max(1, iconScale * 0.75));
        this.rot.add(inl);
        this.iconObjs.push(inl);
      }
      if (s.lock) {
        const li = this.scene.add.image(Math.cos(mid) * r * 0.36, Math.sin(mid) * r * 0.36, 'icon-lock').setRotation(mid + Math.PI / 2);
        this.rot.add(li);
        this.iconObjs.push(li);
      }
      if (s.fuse !== undefined) {
        const ft = this.scene.add.text(Math.cos(mid) * r * 0.36, Math.sin(mid) * r * 0.36, String(s.fuse), textStyle(8, C.gold, { stroke: HEX(C.ink), strokeThickness: 3 })).setOrigin(0.5);
        this.rot.add(ft);
        this.iconObjs.push(ft);
      }
    });
    // separators
    g.lineStyle(2, C.ink, 1);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * th;
      g.lineBetween(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  /** Briefly flash the landed segment. */
  flashLanded(color: number = 0xffffff) {
    const i = this.landedIndex;
    const th = this.theta;
    const a0 = -Math.PI / 2 + i * th + this.rot.rotation;
    const g = this.overlay.clear();
    g.fillStyle(color, 0.5).slice(0, 0, this.r, a0, a0 + th, false).fillPath();
    this.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, duration: 500, onComplete: () => { g.clear(); g.setAlpha(1); } });
  }

  /**
   * Spin so segment k ends under the pointer. `tension` lands it near the edge of a
   * neighbouring segment (dir -1/+1) and slows the final approach.
   */
  spinTo(k: number, opts: { tension?: -1 | 0 | 1; turns?: number; quick?: boolean } = {}): Promise<void> {
    const th = this.theta;
    const tension = opts.tension ?? 0;
    const off = tension ? tension * (0.36 + Math.random() * 0.08) : (Math.random() - 0.5) * 0.6;
    const want = this.pointerAngle + Math.PI / 2 - (k + 0.5 + off) * th;
    const cur = this.rot.rotation;
    const fast = settings.fast || opts.quick;
    const turns = opts.turns ?? (fast ? 1 : 3);
    let delta = (((want - cur) % TAU) + TAU) % TAU;
    delta += turns * TAU;
    const duration = (fast ? 650 : 1500) + (tension ? (fast ? 400 : 1100) : 0);
    this.spinning = true;
    let last = this.landedIndex;
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({
        from: cur, to: cur + delta, duration,
        ease: tension ? 'Quint.easeOut' : 'Cubic.easeOut',
        onUpdate: (tw) => {
          this.rot.rotation = tw.getValue() ?? cur;
          const idx = this.landedIndex;
          if (idx !== last) { last = idx; sfx.tick(this.pointerAngle < 0 ? 1 : 0.8); }
        },
        onComplete: () => {
          this.rot.rotation = Phaser.Math.Angle.Wrap(this.rot.rotation);
          this.spinning = false;
          sfx.land();
          resolve();
        },
      });
    });
  }
}
