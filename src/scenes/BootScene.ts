import Phaser from 'phaser';
import { unlockAudio } from '../audio/sfx';
import { makeIconTextures } from '../ui/icons';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    makeIconTextures(this);
    // Browsers keep audio locked until the first touch; unlock on any tap anywhere.
    this.input.on('pointerdown', unlockAudio);
    window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
    this.scene.start('Title');
  }
}
