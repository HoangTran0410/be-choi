/** Misting: drops of water on the glass and soil. */
import type { Vivarium } from './logic';

// ---- misting ----

/**
 * A drop of water. Most of them are falling — they cross the box in well under a
 * second and draw as a streak, which is the only thing that reads as rain; a
 * handful catch on the glass instead and creep down it long after the shower has
 * passed, which is the only thing that reads as glass.
 */
export interface Drop {
  x: number;
  y: number;
  r: number;
  /** How fast it goes down, px per second. */
  fall: number;
  /** How long a tail it draws behind it. 0 for a bead sitting on the glass. */
  streak: number;
  /** Seconds of life left. */
  life: number;
}

/** How long the glass stays wet after one press of the spray. */
export const MIST_SECONDS = 6;
/** How many drops one press puts in the air. */
export const DROPS_PER_MIST = 44;
/** About how many of them cling to the glass rather than falling through. */
export const MIST_CLINGS = 0.3;

export function makeDrops(viv: Vivarium, n = DROPS_PER_MIST, rng: () => number = Math.random): Drop[] {
  return Array.from({ length: n }, () => {
    const clings = rng() < MIST_CLINGS;
    // Fast enough to be rain and not beads sliding down a window — a drop crosses
    // the box in about a second — but stacked up a long way above the lid so they
    // arrive over the next second and a half. All at one height it is a curtain
    // dropping past the camera, and gone before a child has looked up.
    const fall = clings ? viv.unit * (0.15 + rng() * 0.5) : viv.unit * (6 + rng() * 3);
    return {
      x: viv.w * rng(),
      y: clings ? viv.h * rng() * 0.85 : -viv.h * (0.05 + rng() * 1.6),
      r: viv.unit * (clings ? 0.018 + rng() * 0.035 : 0.014 + rng() * 0.02),
      fall,
      streak: clings ? 0 : fall * (0.05 + rng() * 0.04),
      life: clings ? MIST_SECONDS * (0.6 + rng() * 0.9) : MIST_SECONDS,
    };
  });
}

/** Bring the drops down by `dt`, and take away the ones that have gone. */
export function stepDrops(drops: Drop[], dt: number, viv: Vivarium): void {
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i]!;
    drop.life -= dt;
    drop.y += drop.fall * dt;
    // A falling drop is finished when it reaches the soil; a bead on the glass
    // stays until it dries.
    if (drop.life <= 0 || (drop.streak > 0 && drop.y > viv.front)) drops.splice(i, 1);
  }
}
