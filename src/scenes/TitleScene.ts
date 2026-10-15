import Phaser from 'phaser';
import { buildWheel } from '../core/wheel';
import { saveSettings, settings, Settings } from '../settings';
import { loadSavedRun, session } from '../session';
import { C, HEX, textStyle } from '../ui/theme';
import { Button, felt, panel, para } from '../ui/widgets';
import { WheelView } from '../ui/WheelView';

export const VERSION = 'v0.4 (M4 build)';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    felt(this);
    const wheel = new WheelView(this, 180, 250, 92, 'top');
    wheel.setWheel(buildWheel({ rock: 3, paper: 3, scissors: 2, flame: 2, tide: 2 }));
    wheel.setAlpha(0.35);
    this.tweens.add({ targets: wheel.rot, rotation: Math.PI * 2, duration: 40000, repeat: -1 });

    const title = this.add.text(180, 92, 'CLENCH', textStyle(32, C.cream, { stroke: HEX(C.ink), strokeThickness: 8 })).setOrigin(0.5);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.04 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    this.add.text(180, 128, 'SHAPE THE ODDS.\n THEN SPIN.', textStyle(8, C.gold, { align: 'center', lineSpacing: 6 })).setOrigin(0.5);

    let y = 380;
    const saved = loadSavedRun();
    if (saved) {
      new Button(this, 180, y, { w: 220, h: 40, label: 'CONTINUE', size: 16, onClick: () => { session.run = saved; this.scene.start('Path'); } });
      y += 52;
    }
    new Button(this, 180, y, { w: 220, h: 40, label: 'NEW RUN', size: 16, onClick: () => this.scene.start('CharSelect') });
    y += 52;
    new Button(this, 180, y, { w: 220, h: 32, label: 'HOW TO PLAY', onClick: () => this.howTo() });
    y += 44;
    new Button(this, 180, y, { w: 220, h: 32, label: 'SETTINGS', onClick: () => this.settingsPanel() });
    this.add.text(180, 626, VERSION, textStyle(8, C.dim)).setOrigin(0.5);
  }

  private modal(h: number) {
    const layer = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(180, 320, 360, 640, 0x000000, 0.7).setInteractive();
    const g = this.add.graphics();
    panel(g, 16, 320 - h / 2, 328, h);
    layer.add([shade, g]);
    return { layer, top: 320 - h / 2 };
  }

  private howTo() {
    const { layer, top } = this.modal(470);
    const txt = [
      'Every fight is a duel of spinning wheels.',
      '',
      'ROCK beats Scissors+Flame',
      'PAPER beats Rock+Tide',
      'SCISSORS beats Paper+Tide',
      'FLAME beats Paper+Scissors',
      'TIDE beats Flame+Rock',
      '',
      '1. READ the enemy wheel and its intent.',
      '2. SHAPE: spend Grip on skills. Shaping lasts this spin only.',
      '3. CLENCH: hold the button. Both wheels spin.',
      'Win: roll your dice for damage. Lose: take theirs. Tie: the POT doubles, multiplying the next hit.',
      '',
      'The odds bar is always the real odds.',
    ].join('\n');
    layer.add(para(this, 30, top + 16, txt, 300, C.cream));
    layer.add(new Button(this, 180, top + 470 - 26, { w: 140, h: 30, label: 'GOT IT', onClick: () => layer.destroy() }));
  }

  private settingsPanel() {
    const rows: [keyof Settings, string][] = [
      ['sound', 'SOUND'], ['vibration', 'VIBRATION'], ['fast', 'FAST SPINS'], ['holdToClench', 'HOLD TO CLENCH'], ['reduceShake', 'REDUCE SHAKE'],
    ];
    const { layer, top } = this.modal(300);
    layer.add(this.add.text(180, top + 20, 'SETTINGS', textStyle(16, C.gold)).setOrigin(0.5));
    rows.forEach(([key, label], i) => {
      const b = new Button(this, 180, top + 66 + i * 40, {
        w: 260, h: 32, label: `${label}: ${settings[key] ? 'ON' : 'OFF'}`,
        onClick: () => { settings[key] = !settings[key]; saveSettings(); b.setLabel(`${label}: ${settings[key] ? 'ON' : 'OFF'}`); },
      });
      layer.add(b);
    });
    layer.add(new Button(this, 180, top + 300 - 26, { w: 140, h: 30, label: 'DONE', onClick: () => layer.destroy() }));
  }
}
