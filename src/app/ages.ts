import type { GameMeta, Skill } from '../core/types';

export type AgeFilter = 0 | 2 | 3 | 4;

/** What each skill asks of a child, unless a game says otherwise. */
const SKILL_MIN_AGE: Partial<Record<Skill, 2 | 3 | 4>> = {
  memory: 3,
  counting: 3,
  logic: 3,
  sorting: 3,
};

/** Games that are easier or harder than their skill suggests. */
const GAME_MIN_AGE: Record<string, 2 | 3 | 4> = {
  pattern: 4,
  simon: 4,
  jigsaw: 3,
  bricks: 3,
  cooking: 3,
  shadows: 3,
};

type AgeInfo = Pick<GameMeta, 'id' | 'skill' | 'minAge'>;

export function minAgeOf(g: AgeInfo): 2 | 3 | 4 {
  return g.minAge ?? GAME_MIN_AGE[g.id] ?? SKILL_MIN_AGE[g.skill] ?? 2;
}

/** `age` 0 shows everything; otherwise games meant for older children are left out. */
export function suitsAge(g: AgeInfo, age: AgeFilter): boolean {
  return age === 0 || minAgeOf(g) <= age;
}
