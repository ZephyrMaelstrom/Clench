import type { TypeId } from '../core/types';

export const W = 360;
export const H = 640;
export const FONT = '"Press Start 2P", monospace';

export const C = {
  bg: 0x120d10,
  felt: 0x1d3a2e,
  feltDark: 0x14291f,
  feltLine: 0x2a5141,
  brass: 0xb8873a,
  brassLight: 0xe0b45e,
  ink: 0x1b1410,
  cream: 0xf3e7c9,
  dim: 0x8d8574,
  win: 0x6fcf6a,
  tie: 0x9a9a9a,
  loss: 0xe04a4a,
  gold: 0xf2c14e,
  armor: 0x9fb4c8,
  burn: 0xff7a2a,
  flow: 0x45c6d4,
  ink2: 0x4b4f9c,
  panel: 0x231a1d,
  panelLight: 0x33262a,
  fog: 0x5a5560,
  blank: 0x0c090a,
  rot: 0x5b6b2a,
  wild: 0xc78bff,
  mirror: 0xd8e4ff,
  echo: 0xf0c75a,
};

export const HEX = (n: number) => '#' + n.toString(16).padStart(6, '0');

export const TYPE_COLOR: Record<TypeId, number> = {
  rock: 0xa39a88,
  paper: 0xece0c2,
  scissors: 0x8fb3c8,
  flame: 0xe8642c,
  tide: 0x2f9aa8,
};

export const RARITY_COLOR: Record<string, number> = {
  common: 0xd8d0bc,
  rare: 0x6fb7ff,
  mythic: 0xe0a0ff,
  cursed: 0xff6a5a,
};

export const textStyle = (size = 8, color: number = C.cream, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color: HEX(color),
  ...extra,
});
