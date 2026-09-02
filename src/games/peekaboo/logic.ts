import { ANIMALS, type Item } from '../../core/content';
import { pick, randInt } from '../../core/dom';

/** Things an animal can hide behind: a bush, a box, a cloud, a door, a gift, a bucket. */
export const HIDERS: readonly string[] = ['🌳', '📦', '☁️', '🚪', '🎁', '🪣'];

export const STAR_EVERY = 6;
/** How long the animal stays out before hiding again. */
export const REVEAL_MS = 1600;

export interface Spot {
  hider: string;
  item: Item;
}

/** `n` spots with distinct hiders and distinct animals. Throws if `n > HIDERS.length`. */
export function makeSpots(n: number, rng: () => number = Math.random): Spot[] {
  const hiders = pick(HIDERS, n, rng);
  const items = pick(ANIMALS, n, rng);
  return hiders.map((hider, i) => {
    const item = items[i];
    if (!item) throw new Error('peekaboo: not enough animals');
    return { hider, item };
  });
}

/** A random animal that is not `current`. */
export function nextAnimal(current: Item, rng: () => number = Math.random): Item {
  const others = ANIMALS.filter((a) => a.emoji !== current.emoji);
  const next = others[randInt(0, others.length - 1, rng)];
  if (!next) throw new Error('peekaboo: no other animal');
  return next;
}
