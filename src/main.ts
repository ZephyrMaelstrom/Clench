import '@fontsource/press-start-2p';
import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { CharSelectScene } from './scenes/CharSelectScene';
import { PathScene } from './scenes/PathScene';
import { RecapScene } from './scenes/RecapScene';
import { RewardScene } from './scenes/RewardScene';
import { TitleScene } from './scenes/TitleScene';
import { C, H, W } from './ui/theme';
import { session } from './session';
import { newRun } from './core/run';

async function start() {
  // Wait for the pixel font so Phaser measures text correctly (falls back after 2.5s offline).
  try {
    await Promise.race([
      Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('16px "Press Start 2P"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fallback font */ }
  document.getElementById('boot')?.remove();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: C.bg,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene, CharSelectScene, PathScene, BattleScene, RewardScene, BuildScene, RecapScene],
  });
  // Test hook: open the game with ?debug to reach any scene from the browser console.
  if (location.search.includes('debug')) Object.assign(window, { clench: { game, session, newRun } });
}

void start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  });
}
