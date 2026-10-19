/** Plants, rocks, ornaments and bubbles: the furniture of the tank, and how it reacts to a poke. */
import type { Tank } from './logic';

// ---- scenery ----

export interface Plant {
  x: number;
  /** Height in px. */
  h: number;
  /** Half-width at the base, px. */
  w: number;
  hue: number;
  sway: number;
  phase: number;
  blades: number;
  /** Seconds left of being thrashed about by a finger or a passing fish. */
  shake: number;
}

export function makePlants(tank: Tank, rng: () => number = Math.random): Plant[] {
  const n = Math.max(4, Math.round(tank.w / 110));
  return Array.from({ length: n }, (_, i) => ({
    x: tank.w * ((i + 0.5 + (rng() - 0.5) * 0.6) / n),
    h: tank.unit * (1.5 + rng() * 2.2),
    w: tank.unit * (0.07 + rng() * 0.06),
    hue: 120 + rng() * 60,
    sway: 0.2 + rng() * 0.35,
    phase: rng() * Math.PI * 2,
    blades: 3 + Math.floor(rng() * 3),
    shake: 0,
  }));
}

export interface Rock {
  x: number;
  r: number;
  squash: number;
  tint: number;
}

export function makeRocks(tank: Tank, rng: () => number = Math.random): Rock[] {
  const n = Math.max(3, Math.round(tank.w / 190));
  return Array.from({ length: n }, () => ({
    x: tank.w * rng(),
    r: tank.unit * (0.18 + rng() * 0.3),
    squash: 0.45 + rng() * 0.3,
    tint: rng(),
  }));
}

/** Things that sit in the tank and never move: the furniture. */
export type DecorKind = 'boulder' | 'castle' | 'arch' | 'chest' | 'hoop' | 'anemone' | 'weed';

export interface Decor {
  kind: DecorKind;
  x: number;
  /** Size in tank units. */
  size: number;
  /** Which parallax layer it belongs to. */
  layer: 'far' | 'mid' | 'near';
  phase: number;
  hue: number;
  /** Seconds left of reacting to being poked: a wobble, a curl, a puff of bubbles. */
  poke: number;
  /** The chest is the one that stays how the child left it. */
  open: boolean;
}

/** Ornaments, laid out in slots across the sand so nothing lands on anything else. */
export function makeDecor(tank: Tank, rng: () => number = Math.random): Decor[] {
  const roomy = tank.w > 640;
  const plan: { kind: DecorKind; size: number; layer: Decor['layer'] }[] = [
    { kind: 'boulder', size: 1.1, layer: 'far' },
    { kind: 'castle', size: 2.4, layer: 'far' },
    { kind: 'arch', size: 1.9, layer: 'far' },
    { kind: 'anemone', size: 0.8, layer: 'mid' },
    { kind: 'chest', size: 0.95, layer: 'mid' },
    ...(roomy
      ? ([
          { kind: 'hoop', size: 1.3, layer: 'mid' },
          { kind: 'anemone', size: 0.7, layer: 'mid' },
        ] as const)
      : []),
    { kind: 'boulder', size: 1.5, layer: 'near' },
    { kind: 'weed', size: 2.6, layer: 'near' },
  ];
  // A narrow tank gets smaller ornaments rather than fewer of them, and every one
  // is pulled far enough from the glass to stand there whole.
  const shrink = Math.max(0.55, Math.min(1, tank.w / 720));
  const slot = tank.w / plan.length;
  let corner = 0;
  return plan.map((item, i) => {
    const size = item.size * shrink;
    const half = size * tank.unit * 0.8;
    // Foreground pieces frame the picture from the corners; in the middle they
    // would spend their time standing in front of whichever fish the child wants.
    const want = item.layer === 'near' ? tank.w * (corner++ % 2 === 0 ? 0.97 : 0.03) : slot * (i + 0.5) + (rng() - 0.5) * slot * 0.35;
    return {
      kind: item.kind,
      size,
      layer: item.layer,
      x: item.layer === 'near' ? want : Math.max(half, Math.min(tank.w - half, want)),
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
export function decorReach(d: Decor, tank: Tank): number {
  return Math.max(tank.unit * 0.6, d.size * tank.unit * 0.7);
}

/** The ornament under `(x, y)`, if any. Nearest first, so overlapping pieces behave. */
export function decorAt(decor: readonly Decor[], x: number, y: number, tank: Tank): Decor | null {
  let best: Decor | null = null;
  let bestAway = Infinity;
  for (const d of decor) {
    const base = tank.floor - d.size * tank.unit * 0.4;
    const away = Math.hypot(d.x - x, base - y);
    if (away < decorReach(d, tank) && away < bestAway) {
      bestAway = away;
      best = d;
    }
  }
  return best;
}

/** The plant under `(x, y)`, if any. */
export function plantAt(plants: readonly Plant[], x: number, y: number, tank: Tank): Plant | null {
  let best: Plant | null = null;
  let bestAway = Infinity;
  for (const plant of plants) {
    if (y < tank.floor - plant.h * 1.1) continue;
    const away = Math.abs(plant.x - x);
    if (away < Math.max(tank.unit * 0.45, plant.w * 3) && away < bestAway) {
      bestAway = away;
      best = plant;
    }
  }
  return best;
}

/** What a poke does, so `index.ts` only has to draw the result. */
export function pokeDecor(d: Decor): void {
  d.poke = POKE_SECONDS;
  if (d.kind === 'chest') d.open = !d.open;
}

/** Let every reaction die away by `dt`. */
export function settleScenery(plants: readonly Plant[], decor: readonly Decor[], dt: number): void {
  for (const plant of plants) plant.shake = Math.max(0, plant.shake - dt);
  for (const d of decor) d.poke = Math.max(0, d.poke - dt);
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
  rise: number;
  wobble: number;
}

export function makeBubble(x: number, y: number, tank: Tank, rng: () => number = Math.random): Bubble {
  return {
    x,
    y,
    r: tank.unit * (0.04 + rng() * 0.07),
    rise: tank.unit * (0.7 + rng() * 0.8),
    wobble: rng() * Math.PI * 2,
  };
}
