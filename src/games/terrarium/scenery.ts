/** Plants, pebbles and ornaments: the furniture of the box, and how it reacts to a poke. */
import { bankScale } from './logic';
import type { Creature, Food, Vivarium } from './logic';

// ---- scenery ----

export interface Plant {
  x: number;
  /** Where it is planted in the soil bank, so it sorts with the animals. */
  y: number;
  /** Height in px. */
  h: number;
  /** Half-width at the base, px. */
  w: number;
  hue: number;
  sway: number;
  phase: number;
  blades: number;
  /** Seconds left of being pushed about by a finger or a passing animal. */
  shake: number;
}

export function makePlants(viv: Vivarium, rng: () => number = Math.random): Plant[] {
  const n = Math.max(6, Math.round(viv.w / 85));
  return Array.from({ length: n }, (_, i) => ({
    x: viv.w * ((i + 0.5 + (rng() - 0.5) * 0.6) / n),
    y: viv.floor + (viv.front - viv.floor) * (0.1 + rng() * 0.55),
    h: viv.unit * (0.9 + rng() * 1.6),
    w: viv.unit * (0.06 + rng() * 0.05),
    hue: 90 + rng() * 60,
    sway: 0.15 + rng() * 0.25,
    phase: rng() * Math.PI * 2,
    blades: 3 + Math.floor(rng() * 3),
    shake: 0,
  }));
}

export interface Pebble {
  x: number;
  y: number;
  r: number;
  squash: number;
  tint: number;
}

export function makePebbles(viv: Vivarium, rng: () => number = Math.random): Pebble[] {
  const n = Math.max(5, Math.round(viv.w / 90));
  return Array.from({ length: n }, () => ({
    x: viv.w * rng(),
    y: viv.floor + (viv.front - viv.floor) * rng(),
    r: viv.unit * (0.06 + rng() * 0.13),
    squash: 0.45 + rng() * 0.3,
    tint: rng(),
  }));
}

/** Things that sit in the box and never move on their own: the furniture. */
export type DecorKind = 'rock' | 'log' | 'branch' | 'cave' | 'dish' | 'flower' | 'leaf' | 'moss';

export interface Decor {
  kind: DecorKind;
  x: number;
  /** Where in the soil bank it stands, for drawing order. */
  y: number;
  /** Size in box units. */
  size: number;
  phase: number;
  hue: number;
  /** Seconds left of reacting to being poked: a wobble, a ripple, a puff of petals. */
  poke: number;
  /** The water dish is the one that stays how the child left it. */
  open: boolean;
}

/**
 * Ornaments, laid out in slots across the soil so nothing lands on anything else.
 *
 * `layer` only says where a piece is *put*: back of the bank, middle, or right
 * up against the glass. Nothing keeps it there — the child can drag any of them
 * anywhere in the soil, and from then on how it draws comes from where it stands.
 */
export function makeDecor(viv: Vivarium, rng: () => number = Math.random): Decor[] {
  const roomy = viv.w > 640;
  const plan: { kind: DecorKind; size: number; layer: 'far' | 'mid' | 'near' }[] = [
    { kind: 'rock', size: 1.1, layer: 'far' },
    { kind: 'log', size: 2.2, layer: 'far' },
    { kind: 'branch', size: 2, layer: 'far' },
    { kind: 'moss', size: 0.9, layer: 'mid' },
    { kind: 'dish', size: 0.95, layer: 'mid' },
    ...(roomy
      ? ([
          { kind: 'cave', size: 1.35, layer: 'mid' },
          { kind: 'flower', size: 0.75, layer: 'mid' },
        ] as const)
      : []),
    { kind: 'flower', size: 0.85, layer: 'near' },
    { kind: 'leaf', size: 2.4, layer: 'near' },
  ];
  // A narrow box gets smaller ornaments rather than fewer of them, and every one
  // is pulled far enough from the glass to stand there whole.
  const shrink = Math.max(0.55, Math.min(1, viv.w / 720));
  const slot = viv.w / plan.length;
  let corner = 0;
  return plan.map((item, i) => {
    const size = item.size * shrink;
    const half = size * viv.unit * 0.8;
    // Foreground pieces frame the picture from the corners; in the middle they
    // would spend their time standing in front of whichever animal the child wants.
    const want = item.layer === 'near' ? viv.w * (corner++ % 2 === 0 ? 0.96 : 0.04) : slot * (i + 0.5) + (rng() - 0.5) * slot * 0.35;
    // Far pieces still stand on the soil, not against the back wall: right on the
    // line the cork behind them is the same brown they are, and they vanish.
    const depth = item.layer === 'far' ? 0.2 : item.layer === 'mid' ? 0.5 : 0.9;
    return {
      kind: item.kind,
      size,
      x: item.layer === 'near' ? want : Math.max(half, Math.min(viv.w - half, want)),
      y: viv.floor + (viv.front - viv.floor) * depth,
      phase: rng() * Math.PI * 2,
      hue: rng(),
      poke: 0,
      open: false,
    };
  });
}

/** How long an ornament keeps reacting after it is touched. */
export const POKE_SECONDS = 1.1;
/** How long a plant keeps waving after it is brushed. */
export const SHAKE_SECONDS = 1.6;

/** Radius, in px, within which a tap counts as touching this ornament. */
export function decorReach(d: Decor, viv: Vivarium): number {
  // Scaled with the bank, like the drawing is: a finger has to land on what it
  // can see, not on where the thing would have been at life size.
  return Math.max(viv.unit * 0.6, d.size * viv.unit * 0.7) * bankScale(d.y, viv);
}

/** The ornament under `(x, y)`, if any. Nearest first, so overlapping pieces behave. */
export function decorAt(decor: readonly Decor[], x: number, y: number, viv: Vivarium): Decor | null {
  let best: Decor | null = null;
  let bestAway = Infinity;
  for (const d of decor) {
    const away = Math.hypot(d.x - x, d.y - d.size * viv.unit * 0.35 * bankScale(d.y, viv) - y);
    if (away < decorReach(d, viv) && away < bestAway) {
      bestAway = away;
      best = d;
    }
  }
  return best;
}

/** The plant under `(x, y)`, if any. */
export function plantAt(plants: readonly Plant[], x: number, y: number, viv: Vivarium): Plant | null {
  let best: Plant | null = null;
  let bestAway = Infinity;
  for (const plant of plants) {
    const grown = bankScale(plant.y, viv);
    if (y < plant.y - plant.h * 1.15 * grown) continue;
    const away = Math.abs(plant.x - x);
    if (away < Math.max(viv.unit * 0.45, plant.w * 3) * grown && away < bestAway) {
      bestAway = away;
      best = plant;
    }
  }
  return best;
}

/** What a poke does, so `index.ts` only has to draw the result. */
export function pokeDecor(d: Decor): void {
  d.poke = POKE_SECONDS;
  if (d.kind === 'dish') d.open = !d.open;
}

/** Let every reaction die away by `dt`. */
export function settleScenery(plants: readonly Plant[], decor: readonly Decor[], dt: number): void {
  for (const plant of plants) plant.shake = Math.max(0, plant.shake - dt);
  for (const d of decor) d.poke = Math.max(0, d.poke - dt);
}

/**
 * One thing standing in the soil bank. `k` says which list `i` indexes:
 * 0 a plant, 1 an ornament, 2 an animal, 3 a piece of food.
 */
export interface Layer {
  y: number;
  k: 0 | 1 | 2 | 3;
  i: number;
}

/**
 * Everything in the bank, back to front.
 *
 * Depth in this box is one number — how far down the bank a thing stands — and
 * it settles both who is drawn over whom and how big they draw. There are no
 * fixed foreground and background sets: the child can drag a fern from the back
 * of the box to the front, and when they do it has to come out in front of the
 * log it used to be behind, because that is the whole of what moving something
 * forward means.
 *
 * Everything sorts by how deep in the box it is, which for anything not standing
 * on the soil is not the same as how high up the screen it is — see `sortY`.
 * Anything in a hand, on the cork, or in the air at the child is not in the box's
 * depth at all, and the caller draws those either side of this list.
 */
export function bankOrder(
  out: Layer[],
  viv: Vivarium,
  plants: readonly Plant[],
  decor: readonly Decor[],
  creatures: readonly Creature[],
  foods: readonly Food[],
): Layer[] {
  out.length = 0;
  plants.forEach((plant, i) => out.push({ y: plant.y, k: 0, i }));
  decor.forEach((d, i) => out.push({ y: d.y, k: 1, i }));
  creatures.forEach((cr, i) => {
    if (cr.held || cr.flight > 0 || cr.surface === 'back') return;
    out.push({ y: cr.sortY(viv), k: 2, i });
  });
  foods.forEach((food, i) => {
    if (!food.eaten) out.push({ y: food.y, k: 3, i });
  });
  out.sort((a, b) => a.y - b.y);
  return out;
}
