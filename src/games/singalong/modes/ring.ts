/**
 * The glowing ring of the bird game: keep the bird inside it by singing one steady
 * note. Heights are screen fractions (0 = top, 1 = bottom), like the bird's own.
 * Nothing is lost by missing: the meter only drains a little, slower than it fills.
 */
export interface Ring {
  /** Centre height. */
  y: number;
  /** Half the ring's height. */
  r: number;
  /** Seconds the bird has stayed inside, banked. */
  held: number;
  /** Seconds needed to light the ring up for good. */
  goal: number;
  /** Rings completed. */
  done: number;
}

export const RING_MIN_Y = 0.2;
export const RING_MAX_Y = 0.62;
export const RING_R = 0.14;
export const RING_GOAL_S = 2.5;
/** How fast the meter drains while the bird is outside, relative to how fast it fills. */
export const DRAIN = 0.4;

export function makeRing(y = 0.4): Ring {
  return { y, r: RING_R, held: 0, goal: RING_GOAL_S, done: 0 };
}

export function inRing(ring: Ring, birdY: number): boolean {
  return Math.abs(birdY - ring.y) <= ring.r;
}

/** A new height that is clearly somewhere else, so the bird has to move. */
export function nextRingY(prev: number, rng: () => number = Math.random): number {
  const span = RING_MAX_Y - RING_MIN_Y;
  const y = RING_MIN_Y + rng() * span;
  if (Math.abs(y - prev) >= 0.15) return y;
  return prev + 0.18 <= RING_MAX_Y ? prev + 0.18 : prev - 0.18;
}

export interface RingStep {
  inside: boolean;
  /** The ring just filled up. */
  completed: boolean;
}

export function stepRing(ring: Ring, birdY: number, dt: number, rng: () => number = Math.random): RingStep {
  const inside = inRing(ring, birdY);
  ring.held = inside ? ring.held + dt : Math.max(0, ring.held - dt * DRAIN);
  if (ring.held >= ring.goal) {
    ring.done++;
    ring.held = 0;
    ring.y = nextRingY(ring.y, rng);
    return { inside, completed: true };
  }
  return { inside, completed: false };
}
