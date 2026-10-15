# CLENCH

A five-type rock-paper-scissors roguelite. Shape the odds, then spin.

Web game built with **Phaser 3 + TypeScript + Vite**, deployed to GitHub Pages and installable on Android as a home-screen app.

## Play / test on your phone

Every push to `main` runs the tests, builds, and deploys to GitHub Pages (see the Actions tab).
Open the Pages link on your Android phone in Chrome, then **menu > Add to Home screen** to install it full-screen.

## Develop

```bash
npm install
npm run dev        # local server; open the printed Network URL on your phone (same Wi-Fi)
npm test           # rules tests (odds, Pot, slices, skills, items)
npm run sim        # balance simulator: bot plays full runs and reports win rates
npm run build      # production build into dist/
```

Debug hook: open the game with `?debug` and use `window.clench` in the browser console
(`clench.game.scene.start('Reward')`, `clench.session.run`, ...).

## Project layout

```
src/
  core/      game rules, no Phaser code: wheel + odds, rng, battle, skills, run, pot, bot
  data/      content as JSON: characters, enemies, items, skills
  scenes/    Boot, Title, CharSelect, Path, Battle, Reward, Build, Recap
  ui/        theme, pixel icons, WheelView, widgets (buttons, HP bars, odds bar)
  audio/     synthesized retro sound effects (WebAudio, no files)
tests/       vitest tests for core
tools/       simulate.ts (balance), make-icons.mjs (PWA icons)
```

### Architecture rules

1. **Logic is separate from graphics.** All rules live in `src/core`. Scenes only display state and reports.
2. **One odds function.** `battleOdds()` drives both the odds bar and the spin (`compare()`), so displayed odds are real odds.
3. **Seeded randomness.** Every random result comes from the battle/run RNG state. Same seed, same run.
4. **Content is data.** Add an enemy, item or skill by editing JSON in `src/data` (new effect kinds need a few lines in core).
5. **Portrait first.** 360x640 canvas, pixel art mode, scaled to fit.

## Status

Milestones M0 to M4 of the MVP Dev Guide are done. See [docs/DEVLOG.md](docs/DEVLOG.md).
