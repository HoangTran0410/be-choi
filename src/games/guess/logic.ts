import { INSTRUMENTS, instOf, type InstDef, type InstId } from '../show/logic';

/** How many pictures to choose from: two to begin with (right for a two or three year old), more as the child gets them right. */
export function choiceCount(streak: number): number {
  if (streak >= 8) return 4;
  if (streak >= 3) return 3;
  return 2;
}

/**
 * The streak after a round. A round got right at once adds one; a round that needed a second try
 * only eases it back by one (never to a "lose" state, never below 0).
 */
export function nextStreak(streak: number, mistakes: number): number {
  return mistakes === 0 ? streak + 1 : Math.max(0, streak - 1);
}

/** The target for a round: any instrument but the one just heard. */
export function pickTarget(prev: InstId | null, rng: () => number = Math.random): InstId {
  const pool = INSTRUMENTS.filter((i) => i.id !== prev);
  return (pool[Math.floor(rng() * pool.length)] as InstDef).id;
}

/**
 * Pictures for a round: the target plus `n - 1` others, in random order. When `alike` is set (a child
 * who is doing well) the others come from the same family first, so the ear has to do the work.
 */
export function pickChoices(target: InstId, n: number, alike: boolean, rng: () => number = Math.random): InstId[] {
  const t = instOf(target);
  const others = INSTRUMENTS.filter((i) => i.id !== target);
  const shuffled = others
    .map((i) => ({ i, k: rng() + (alike && i.family === t.family ? -1 : 0) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.i.id);
  const chosen: InstId[] = [target, ...shuffled.slice(0, Math.max(1, n - 1))];
  return chosen
    .map((id) => ({ id, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.id);
}

/** Notes of the phrase used as the "mystery sound": the opening of the tune, long enough to hear the timbre. */
export const CLUE_NOTES = 5;
