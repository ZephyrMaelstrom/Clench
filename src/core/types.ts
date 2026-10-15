// The five Typings. Each type beats exactly two others and loses to the other two.

export const TYPES = ['rock', 'paper', 'scissors', 'flame', 'tide'] as const;
export type TypeId = (typeof TYPES)[number];

export const BEATS: Record<TypeId, readonly TypeId[]> = {
  rock: ['scissors', 'flame'],
  paper: ['rock', 'tide'],
  scissors: ['paper', 'tide'],
  flame: ['paper', 'scissors'],
  tide: ['flame', 'rock'],
};

/** Flavour verbs for each winning matchup (used by the reveal animation). */
export const MATCHUP_VERB: Record<string, string> = {
  'rock>scissors': 'BLUNTS',
  'rock>flame': 'SMOTHERS',
  'paper>rock': 'COVERS',
  'paper>tide': 'SOAKS UP',
  'scissors>paper': 'CUTS',
  'scissors>tide': 'CLEAVES',
  'flame>paper': 'BURNS',
  'flame>scissors': 'MELTS',
  'tide>flame': 'DOUSES',
  'tide>rock': 'ERODES',
};

export function beats(a: TypeId, b: TypeId): boolean {
  return BEATS[a].includes(b);
}

/** Types that beat `t`. */
export function countersOf(t: TypeId): TypeId[] {
  return TYPES.filter((x) => beats(x, t));
}

/** Next type around the cycle (used by Riptide). */
export function nextType(t: TypeId): TypeId {
  return TYPES[(TYPES.indexOf(t) + 1) % TYPES.length];
}

export const TYPE_NAME: Record<TypeId, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
  flame: 'Flame',
  tide: 'Tide',
};
