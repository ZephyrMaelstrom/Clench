// Typed access to the JSON content in src/data. Content is data; rules live in core.

import charactersJson from '../data/characters.json';
import enemiesJson from '../data/enemies.json';
import itemsJson from '../data/items.json';
import skillsJson from '../data/skills.json';
import type { TypeId } from './types';
import type { HazardId, SpecialId } from './wheel';

export type TargetKind = 'none' | 'type' | 'enemySeg' | 'ownSeg' | 'enemySeg+type' | 'type+type' | 'enemySeg2';

export interface SkillDef {
  id: string;
  name: string;
  cost: number;
  target: TargetKind;
  /** Targets the enemy wheel (Ink makes these free). */
  enemy: boolean;
  pool: string;
  desc: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  hp: number;
  wheel: Partial<Record<TypeId, number>>;
  might: number;
  grip: number;
  luck: number;
  insight: number;
  nerve: number;
  passives: string[];
  passiveText: string[];
  skills: string[];
  signature: string;
  grainChoice: boolean;
  blurb: string;
}

export interface IntentDef {
  kind: 'lean' | 'guard' | 'charge' | 'hazard' | 'burn' | 'heal' | 'rest' | 'mimicry';
  w: number;
  type?: TypeId;
  n?: number;
  value?: number;
  hazard?: HazardId | 'fuse' | 'lock';
}

export interface AffixDef {
  kind: string;
  value?: number;
  type?: TypeId;
  hazard?: HazardId | 'fuse' | 'lock';
}

export interface EnemyDef {
  id: string;
  name: string;
  tier: 'easy' | 'normal' | 'elite';
  act: number;
  hp: number;
  members?: number;
  might: number;
  wheel: Partial<Record<TypeId, number>>;
  affixes: AffixDef[];
  intents: IntentDef[];
  desc: string;
}

export type ItemSlot = 'glove' | 'charm' | 'talisman' | 'relic';

export interface ItemEffect {
  kind: string;
  stat?: 'luck' | 'insight' | 'might' | 'nerve' | 'grip' | 'maxHp';
  value?: number;
  type?: TypeId | 'largest';
  special?: SpecialId;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: 'common' | 'rare' | 'mythic' | 'cursed';
  desc: string;
  effects: ItemEffect[];
}

export const CHARACTERS = charactersJson as CharacterDef[];
export const ENEMIES = enemiesJson as EnemyDef[];
export const ITEMS = itemsJson as ItemDef[];
export const SKILLS = skillsJson as SkillDef[];

const byId = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map((x) => [x.id, x])) as Record<string, T>;
export const CHARACTER = byId(CHARACTERS);
export const ENEMY = byId(ENEMIES);
export const ITEM = byId(ITEMS);
export const SKILL = byId(SKILLS);

/** Everything the player's items add up to, computed once per fight. */
export interface Mods {
  luck: number;
  insight: number;
  might: number;
  nerve: number;
  grip: number;
  maxHp: number;
  startSegs: { type?: TypeId | 'largest'; special?: SpecialId }[];
  rockWinD4: boolean;
  flameWinBurn: number;
  tieHeal: number;
  edgesLoaded: boolean;
  maskOfHouse: boolean;
  removeEnemyLargest: boolean;
  respinBlank: boolean;
  inkStart: number;
  firstWinCrit: boolean;
  burnSlow: boolean;
  diceMin: number;
  flowStart: number;
}

export function emptyMods(): Mods {
  return {
    luck: 0, insight: 0, might: 0, nerve: 0, grip: 0, maxHp: 0, startSegs: [],
    rockWinD4: false, flameWinBurn: 0, tieHeal: 0, edgesLoaded: false, maskOfHouse: false,
    removeEnemyLargest: false, respinBlank: false, inkStart: 0, firstWinCrit: false,
    burnSlow: false, diceMin: 1, flowStart: 0,
  };
}

export function modsFromItems(itemIds: string[]): Mods {
  const m = emptyMods();
  for (const id of itemIds) {
    const item = ITEM[id];
    if (!item) continue;
    for (const e of item.effects) {
      switch (e.kind) {
        case 'stat': m[e.stat!] += e.value ?? 0; break;
        case 'startSeg': m.startSegs.push({ type: e.type, special: e.special }); break;
        case 'rockWinD4': m.rockWinD4 = true; break;
        case 'flameWinBurn': m.flameWinBurn += e.value ?? 0; break;
        case 'tieHeal': m.tieHeal += e.value ?? 0; break;
        case 'edgesLoaded': m.edgesLoaded = true; break;
        case 'maskOfHouse': m.maskOfHouse = true; break;
        case 'removeEnemyLargest': m.removeEnemyLargest = true; break;
        case 'respinBlank': m.respinBlank = true; break;
        case 'inkStart': m.inkStart += e.value ?? 0; break;
        case 'firstWinCrit': m.firstWinCrit = true; break;
        case 'burnSlow': m.burnSlow = true; break;
        case 'diceMin': m.diceMin = Math.max(m.diceMin, e.value ?? 1); break;
        case 'flowStart': m.flowStart += e.value ?? 0; break;
      }
    }
  }
  return m;
}
