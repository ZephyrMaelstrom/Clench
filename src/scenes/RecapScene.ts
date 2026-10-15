import Phaser from 'phaser';
import { CHARACTER } from '../core/content';
import { FIGHTS_PER_RUN } from '../core/run';
import { formatPot } from '../core/pot';
import { clearSavedRun, session } from '../session';
import { C, textStyle } from '../ui/theme';
import { Button, felt, panel } from '../ui/widgets';

/** End-of-run ledger. */
export class RecapScene extends Phaser.Scene {
  constructor() { super('Recap'); }

  create() {
    const run = session.run;
    if (!run) { this.scene.start('Title'); return; }
    clearSavedRun();
    felt(this);
    const won = run.over === 'won';
    this.add.text(180, 60, won ? 'CHALLENGE WON' : 'RUN OVER', textStyle(16, won ? C.gold : C.loss)).setOrigin(0.5);
    this.add.text(180, 86, won ? 'The Ember Foothills are behind you.' : 'The Lifeline pulls you back to the Den.', textStyle(8, C.dim)).setOrigin(0.5);
    const g = this.add.graphics();
    panel(g, 24, 116, 312, 300);
    const s = run.stats;
    const spins = Math.max(1, s.spins);
    const rows: [string, string][] = [
      ['Character', CHARACTER[run.charId].name],
      ['Fights won', `${s.fightsWon} / ${FIGHTS_PER_RUN}`],
      ['Spins', String(s.spins)],
      ['Win / Tie / Loss', `${Math.round((s.wins / spins) * 100)}/${Math.round((s.ties / spins) * 100)}/${Math.round((s.losses / spins) * 100)}%`],
      ['Biggest Pot', formatPot(s.biggestPot)],
      ['Biggest hit', String(s.biggestHit)],
      ['Damage dealt', String(s.dealt)],
      ['Damage taken', String(s.taken)],
      ['Seed', String(run.seed)],
    ];
    rows.forEach(([k, v], i) => {
      this.add.text(40, 138 + i * 28, k.toUpperCase(), textStyle(8, C.dim));
      this.add.text(320, 138 + i * 28, v, textStyle(8, C.cream)).setOrigin(1, 0);
    });
    new Button(this, 180, 470, { w: 240, h: 44, label: 'NEW RUN', size: 16, onClick: () => { session.run = null; this.scene.start('CharSelect'); } });
    new Button(this, 180, 530, { w: 240, h: 34, label: 'TITLE', onClick: () => { session.run = null; this.scene.start('Title'); } });
  }
}
