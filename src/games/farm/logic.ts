import type { FxKind } from '../../core/audio';
import { mulberry32 } from '../../core/dom';

/** The yard, in pixels. Everything else is measured in `unit`s. */
export interface Yard {
  w: number;
  h: number;
  unit: number;
  /** Top of the grass: the fence and the barn stand on this line. */
  horizon: number;
  /** Where the animals may walk: between these two lines. */
  near: number;
  /** Middle of the pond, and how wide it is. */
  pondX: number;
  pondR: number;
}

export function makeYard(w: number, h: number): Yard {
  const unit = Math.min(w, h) / 7;
  const horizon = h * 0.34;
  return { w, h, unit, horizon, near: h * 0.94, pondX: w * 0.78, pondR: Math.min(w * 0.22, unit * 1.5) };
}

export type Gait = 'walk' | 'peck' | 'hop';

export interface Species {
  id: string;
  name: string;
  /** How the child hears it. */
  voice: FxKind;
  /** Body and a second colour for patches, ears and the like. */
  coat: string;
  spot: string;
  /** Body length in units. */
  size: number;
  /** Units per second when it is going somewhere. */
  speed: number;
  legs: 2 | 4;
  gait: Gait;
  /** Only hens lay. */
  lays: boolean;
  /** Ducks belong on the pond. */
  swims: boolean;
}

export const SPECIES: readonly Species[] = [
  {
    id: 'chicken',
    name: 'con gà',
    voice: 'chirp',
    coat: '#fef3c7',
    spot: '#ef4444',
    size: 0.5,
    speed: 1.5,
    legs: 2,
    gait: 'peck',
    lays: true,
    swims: false,
  },
  {
    id: 'duck',
    name: 'con vịt',
    voice: 'quack',
    coat: '#fafaf9',
    spot: '#f59e0b',
    size: 0.55,
    speed: 1.2,
    legs: 2,
    gait: 'walk',
    lays: false,
    swims: true,
  },
  {
    id: 'cow',
    name: 'con bò',
    voice: 'moo',
    coat: '#fafaf9',
    spot: '#44403c',
    size: 1.35,
    speed: 0.7,
    legs: 4,
    gait: 'walk',
    lays: false,
    swims: false,
  },
  {
    id: 'pig',
    name: 'con heo',
    voice: 'pig',
    coat: '#f9a8d4',
    spot: '#f472b6',
    size: 1,
    speed: 0.9,
    legs: 4,
    gait: 'walk',
    lays: false,
    swims: false,
  },
  {
    id: 'sheep',
    name: 'con cừu',
    voice: 'sheep',
    coat: '#f8fafc',
    spot: '#4b5563',
    size: 0.9,
    speed: 0.8,
    legs: 4,
    gait: 'walk',
    lays: false,
    swims: false,
  },
  {
    id: 'horse',
    name: 'con ngựa',
    voice: 'kazoo',
    coat: '#b45309',
    spot: '#78350f',
    size: 1.4,
    speed: 1.4,
    legs: 4,
    gait: 'walk',
    lays: false,
    swims: false,
  },
  {
    id: 'rabbit',
    name: 'con thỏ',
    voice: 'sparkle',
    coat: '#e7e5e4',
    spot: '#fbcfe8',
    size: 0.55,
    speed: 1.6,
    legs: 4,
    gait: 'hop',
    lays: false,
    swims: false,
  },
  {
    id: 'goat',
    name: 'con dê',
    voice: 'sheep',
    coat: '#d6d3d1',
    spot: '#57534e',
    size: 0.85,
    speed: 1,
    legs: 4,
    gait: 'walk',
    lays: false,
    swims: false,
  },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}

/** Who is out in the yard: every kind once, plus a second hen, so there is plenty to see. */
export function stocking(): Species[] {
  const hen = SPECIES[0]!;
  return [...SPECIES, hen];
}

export const GRAIN_PER_FEED = 9;
export const EGGS_FOR_STAR = 3;
export const TAPS_FOR_STAR = 6;
/** A hen lays somewhere between these two, in seconds. */
export const LAY_MIN_S = 7;
export const LAY_MAX_S = 16;
export const MAX_EGGS = 5;
/** Close enough to eat a grain, in units. */
export const BITE = 0.35;

export interface Grain {
  x: number;
  y: number;
  /** Still falling: 1 … 0. */
  drop: number;
  eaten: boolean;
}

export interface Egg {
  x: number;
  y: number;
  /** Grows in when it is laid, so it does not just appear. */
  age: number;
}

/** Scatter feed over the grass, never on the pond and never off the sides. */
export function makeGrain(yard: Yard, n: number, rng: () => number = Math.random): Grain[] {
  const out: Grain[] = [];
  for (let i = 0; i < n; i++) {
    const x = yard.unit * 0.6 + rng() * (yard.w - yard.unit * 1.2);
    const y = yard.horizon + yard.unit * 0.4 + rng() * (yard.near - yard.horizon - yard.unit * 0.6);
    if (onPond(yard, x, y)) continue;
    out.push({ x, y, drop: 1, eaten: false });
  }
  return out;
}

/** Is (x, y) in the water? The pond is drawn as a squashed circle on the grass. */
export function onPond(yard: Yard, x: number, y: number): boolean {
  const dx = (x - yard.pondX) / yard.pondR;
  const dy = (y - pondY(yard)) / (yard.pondR * 0.42);
  return dx * dx + dy * dy < 1;
}

export function pondY(yard: Yard): number {
  return yard.horizon + (yard.near - yard.horizon) * 0.35;
}

/**
 * How far up the animal is standing, 0 at the fence and 1 at the front of the yard.
 * Things further back are drawn smaller and earlier, which is all the depth needed.
 */
export function depth(yard: Yard, y: number): number {
  return Math.min(1, Math.max(0, (y - yard.horizon) / Math.max(1, yard.near - yard.horizon)));
}

/** Scale of an animal standing at `y`: half size at the fence, full size at the front. */
export function scaleAt(yard: Yard, y: number): number {
  return 0.62 + depth(yard, y) * 0.55;
}

/**
 * The gait cycle lives in `core/creature` now that the terrarium walks on it too.
 * Re-exported here so the yard's own code and tests still ask this file for it.
 */
export { walkFoot } from '../../core/creature';

export interface Animal {
  species: Species;
  x: number;
  y: number;
  /** -1 facing left, 1 facing right. */
  dir: number;
  /** Where it is walking to, or null when it is standing about. */
  goal: { x: number; y: number } | null;
  /** Walk cycle, in strides. */
  phase: number;
  /** Seconds left of standing still, pecking or chewing. */
  rest: number;
  /** Bounces when it is talked to or fed. */
  happy: number;
  /** Seconds until this hen lays. */
  layIn: number;
}

export function makeAnimals(yard: Yard, rng: () => number = Math.random): Animal[] {
  const herd = stocking();
  return herd.map((species, i) => {
    // Spread out along the yard, and never standing in the water unless it swims.
    let x = yard.unit * 0.7 + ((i + 0.5) / herd.length) * (yard.w - yard.unit * 1.4);
    let y = yard.horizon + yard.unit * 0.5 + rng() * (yard.near - yard.horizon - yard.unit * 0.9);
    for (let tries = 0; tries < 8 && onPond(yard, x, y) !== species.swims; tries++) {
      y = yard.horizon + yard.unit * 0.5 + rng() * (yard.near - yard.horizon - yard.unit * 0.9);
      if (species.swims) x = yard.pondX + (rng() - 0.5) * yard.pondR;
    }
    if (species.swims) {
      x = yard.pondX + (rng() - 0.5) * yard.pondR;
      y = pondY(yard) + (rng() - 0.5) * yard.pondR * 0.3;
    }
    const animal: Animal = {
      species,
      x,
      y,
      dir: rng() < 0.5 ? -1 : 1,
      goal: null,
      phase: rng(),
      rest: rng() * 2,
      happy: 0,
      layIn: LAY_MIN_S + rng() * (LAY_MAX_S - LAY_MIN_S),
    };
    return animal;
  });
}

/** Somewhere sensible to wander to: on the water for a duck, on the grass for the rest. */
export function roam(animal: Animal, yard: Yard, rng: () => number = Math.random): { x: number; y: number } {
  for (let tries = 0; tries < 8; tries++) {
    const x = yard.unit * 0.6 + rng() * (yard.w - yard.unit * 1.2);
    const y = yard.horizon + yard.unit * 0.4 + rng() * (yard.near - yard.horizon - yard.unit * 0.6);
    if (animal.species.swims === onPond(yard, x, y)) return { x, y };
  }
  return animal.species.swims ? { x: yard.pondX, y: pondY(yard) } : { x: animal.x, y: animal.y };
}

/** The grain this animal would go for, if any is within reach of the kind of thing it eats. */
export function nearestGrain(animal: Animal, grains: readonly Grain[], yard: Yard): Grain | null {
  let best: Grain | null = null;
  let bestD = Infinity;
  for (const grain of grains) {
    if (grain.eaten || grain.drop > 0) continue;
    if (animal.species.swims !== onPond(yard, grain.x, grain.y)) continue;
    const d = Math.hypot(grain.x - animal.x, grain.y - animal.y);
    if (d < bestD) {
      bestD = d;
      best = grain;
    }
  }
  return best;
}

/**
 * Move one animal on by `dt`. Returns the grain it just ate, if it ate one.
 * Everything stays inside the yard, and only ducks end up on the pond.
 */
export function stepAnimal(
  animal: Animal,
  dt: number,
  yard: Yard,
  grains: readonly Grain[],
  rng: () => number = Math.random,
): Grain | null {
  animal.happy = Math.max(0, animal.happy - dt);
  const food = nearestGrain(animal, grains, yard);
  if (food) animal.goal = { x: food.x, y: food.y };
  else if (animal.rest > 0) {
    animal.rest -= dt;
    animal.phase += dt * 0.6;
    return null;
  }
  if (!animal.goal) {
    animal.goal = roam(animal, yard, rng);
    return null;
  }
  const dx = animal.goal.x - animal.x;
  const dy = animal.goal.y - animal.y;
  const dist = Math.hypot(dx, dy);
  const speed = animal.species.speed * yard.unit;
  if (food && dist < yard.unit * BITE) {
    animal.goal = null;
    animal.rest = 0.6 + rng() * 0.6;
    animal.happy = 1;
    return food;
  }
  if (dist < yard.unit * 0.12) {
    animal.goal = null;
    animal.rest = 0.8 + rng() * 2.4;
    return null;
  }
  const stepX = (dx / dist) * speed * dt;
  const stepY = (dy / dist) * speed * dt;
  animal.x = Math.min(yard.w - yard.unit * 0.4, Math.max(yard.unit * 0.4, animal.x + stepX));
  animal.y = Math.min(yard.near, Math.max(yard.horizon + yard.unit * 0.3, animal.y + stepY));
  if (Math.abs(dx) > yard.unit * 0.1) animal.dir = dx < 0 ? -1 : 1;
  animal.phase += Math.hypot(stepX, stepY) / (yard.unit * animal.species.size * 0.6);
  return null;
}

/** Big enough for a toddler's finger, and only over the animal itself. */
export function hitsAnimal(animal: Animal, x: number, y: number, yard: Yard): boolean {
  const r = yard.unit * animal.species.size * scaleAt(yard, animal.y) * 0.6;
  return Math.hypot(x - animal.x, y - animal.y) < Math.max(r, yard.unit * 0.4);
}

export function hitsEgg(egg: Egg, x: number, y: number, yard: Yard): boolean {
  return Math.hypot(x - egg.x, y - egg.y) < yard.unit * 0.45;
}

/** A hen counting down to her next egg. Returns the egg when one is due. */
export function tickLaying(animal: Animal, dt: number, eggs: readonly Egg[], rng: () => number = Math.random): Egg | null {
  if (!animal.species.lays) return null;
  animal.layIn -= dt;
  if (animal.layIn > 0 || eggs.length >= MAX_EGGS) return null;
  animal.layIn = LAY_MIN_S + rng() * (LAY_MAX_S - LAY_MIN_S);
  return { x: animal.x, y: animal.y, age: 0 };
}

/** Fixed scenery: fence posts, flowers and tufts of grass that never move. */
export interface Scenery {
  posts: number[];
  tufts: { x: number; y: number; seed: number }[];
}

export function makeScenery(yard: Yard, rng: () => number = mulberry32(7)): Scenery {
  const posts: number[] = [];
  const gap = yard.unit * 0.75;
  for (let x = gap * 0.5; x < yard.w + gap; x += gap) posts.push(x);
  const tufts = Array.from({ length: Math.round(yard.w / (yard.unit * 0.55)) + 8 }, () => {
    const x = rng() * yard.w;
    const y = yard.horizon + rng() * (yard.near - yard.horizon + yard.unit * 0.4);
    return { x, y, seed: rng() };
  }).filter((t) => !onPond(yard, t.x, t.y));
  return { posts, tufts };
}
