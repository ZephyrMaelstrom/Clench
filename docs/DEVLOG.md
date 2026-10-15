# Dev log

## 2026-10-15: M0 to M4

### M0 Setup
- Phaser 3 + TypeScript + Vite project, 360x640 portrait canvas, pixel-art mode, FIT scaling.
- GitHub Actions: test, build, deploy to Pages on every push to `main`.
- PWA: manifest, network-first service worker, generated pixel-art icons (`npm run icons`).
- Pixel font (Press Start 2P) bundled via `@fontsource`, so it works offline.

### M1 Odds engine
- `core/wheel.ts`: segments, `compare()` (Mirror, Blank/Rot, Wild, Prism rules), exact `computeOdds()`
  including honest ranges for fogged segments and Luck re-spins.
- `core/pot.ts`: doubles to 16x, then +4x per tie, uncapped.
- `core/battle.ts`: turns, Grip, statuses, intents, damage (dice steps, crit, Pot, Armor), HP, healing,
  Pot safety cap (one enemy hit can't exceed 50% max HP).
- Tests reproduce every worked example from the design doc; simulated spins match calculated odds within 0.5%.
- `tools/simulate.ts` plays full runs with a greedy bot.

### M2 Greybox battle
- Android portrait battle layout: enemy header, enemy wheel, odds bar, Pot, player wheel, HP, Grip, skill bar, info panel, CLENCH.
- Tap a skill to preview its effect on the real odds; tap again to use. Targeted skills prompt for a segment or type.
- Tap any segment to read it. Tap the info panel for the combat log.

### M3 Feel and sound
- Ratchet spin with deceleration and tick sounds; edge-tension slow-downs near a different outcome.
- Clash animation with per-type sound and matchup verbs (BLUNTS, DOUSES...), sparks, dice tumble, crit freeze,
  Pot coin flow, jackpot banner at 8x+, screen shake and red vignette scaled to damage, phone vibration.
- All sounds synthesized at runtime; audio unlocks on first tap.
- Settings: sound, vibration, fast spins, hold-to-clench, reduce shake.

### M4 Build systems
- 8 special slices + 4 hazards, 5 statuses, 22 items, 16 skills + 3 signatures.
- Brawler and Scribe. Rewards: choose item / skill / slice token (inlay onto a tapped segment). Build screen.
- 5-fight chains: 2 skirmishes, 2 brawls, 1 elite, from 12 Act 1 enemies. Recap screen. Save & continue between fights.

### Design changes found by testing (update the design doc)
- **Skill shaping lasts one spin.** The bot found that Lean/Pinch stacked forever, reaching ~95% win odds by turn 10.
  Now skills that change wheels (Lean, Pinch, Amend, Taunt, Kindle, Riptide, Snip, Redact) last for the current spin;
  enemy Lean intents follow the same rule. Clauses, hazards, fog reveals and slice inlays persist.
- **Armor lasts until your next turn** (was: halves each turn). Halving let the Brawler stack Armor and become untouchable.
- **Scribe:** 60 HP, 4 Grip, new passive *Paperwork* (enemy-targeting skills give 2 Armor), starts with Footnote instead of Peek.
- **Ink** makes enemy-targeting skills free, except Footnote itself (no infinite loop).
- Brace gives 4 Armor; Bedrock costs 2 Grip.
- Elite and brawl HP trimmed (Warchief 38, Priestess 36, Golem 24, Bruiser 22).

### Balance snapshot (greedy bot, Heat 0)
| Character | Run win rate | Avg turns per fight |
|---|---|---|
| Brawler | ~43% | 8.8 |
| Scribe | ~51% | 10.8 |

Target from the design doc: ~45% for a skilled player. Elites with Bulwark still run long (15 to 18 turns).
