import type { GameMeta, Skill } from '../core/types';

export type Age = 2 | 3 | 4 | 5 | 6;
export type AgeFilter = 0 | Age;

/** Every age a parent can pick (0 = show all). Older saves hold 0, 2, 3 or 4 and stay valid. */
export const AGE_CHOICES: readonly AgeFilter[] = [0, 2, 3, 4, 5, 6];

/** A saved value that is not one of the choices (hand-edited, or from a future build) shows everything. */
export function normalizeAge(v: unknown): AgeFilter {
  return AGE_CHOICES.includes(v as AgeFilter) ? (v as AgeFilter) : 0;
}

/** What each skill asks of a child, unless a game says otherwise. */
const SKILL_MIN_AGE: Partial<Record<Skill, Age>> = {
  memory: 3,
  counting: 3,
  logic: 3,
  sorting: 3,
};

/** Games that are easier or harder than their skill suggests. */
const GAME_MIN_AGE: Record<string, Age> = {
  pattern: 4,
  simon: 4,
  jigsaw: 3,
  bricks: 3,
  cooking: 3,
  shadows: 3,
  dressup: 3,
  build: 3,
  trace: 3,
  tubes: 5,
  letters: 4,
};

type AgeInfo = Pick<GameMeta, 'id' | 'skill' | 'minAge'>;

export function minAgeOf(g: AgeInfo): Age {
  return g.minAge ?? GAME_MIN_AGE[g.id] ?? SKILL_MIN_AGE[g.skill] ?? 2;
}

/** `age` 0 shows everything; otherwise games too hard for a younger child are left out. Simple games
 * are never hidden from older children (a six-year-old still likes bubbles). */
export function suitsAge(g: AgeInfo, age: AgeFilter): boolean {
  return age === 0 || minAgeOf(g) <= age;
}
