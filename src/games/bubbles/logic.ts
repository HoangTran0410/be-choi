import { ANIMALS, type Item } from '../../core/content';
import { randInt } from '../../core/dom';

export interface BubbleSpec {
  /** Base diameter in px before scaling to the stage (60 … 140). */
  size: number;
  /** Horizontal position as a fraction of the stage width (0 … 1). */
  x: number;
  /** Hue for the bubble tint (0 … 359). */
  hue: number;
  /** Rise speed in px per second. */
  speed: number;
  /** About a quarter of bubbles carry an animal that is named when popped. */
  item: Item | null;
}

export const STAR_EVERY = 15;
export const MAX_ALIVE = 8;
export const SPAWN_MS = 900;

export function starEvery(): number {
  return STAR_EVERY;
}

export function makeBubble(rng: () => number = Math.random, animals: readonly Item[] = ANIMALS): BubbleSpec {
  const size = randInt(60, 140, rng);
  const x = rng();
  const hue = randInt(0, 359, rng);
  const speed = 70 + rng() * 80;
  const item = rng() < 0.25 ? (animals[randInt(0, animals.length - 1, rng)] ?? null) : null;
  return { size, x, hue, speed, item };
}

/** Smaller bubbles pop with a higher pitch. */
export function popPitch(size: number): number {
  return Math.min(2, Math.max(0.8, 140 / size));
}
