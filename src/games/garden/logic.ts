/**
 * The garden, with no DOM in sight: what can be grown, how far along each plot
 * is, and where the insects are going. `index.ts` only draws it.
 *
 * A plot is a tiny state machine with one verb. Tap bare soil and the chosen
 * seed goes in; tap the seedling and it gets a drink; tap it once it is ripe and
 * it goes in the basket. One gesture for the whole cycle, which is about as much
 * as a two-year-old wants to hold in their head.
 */
import { randInt } from '../../core/dom';

export type PlantKind = 'flower' | 'fruit' | 'root';
/** How the grown thing is drawn. A red circle is not a strawberry. */
export type FruitShape = 'ball' | 'berry' | 'cob' | 'pumpkin' | 'carrot';

export interface Seed {
  id: string;
  /** Shown on the tray button. */
  emoji: string;
  /** Vietnamese name of the grown plant, spoken when it is planted and picked. */
  name: string;
  /** Said when it finishes growing. */
  ripe: string;
  kind: PlantKind;
  /** Stem height when fully grown, in ground units. */
  height: number;
  stem: string;
  leaf: string;
  /** Petal or fruit colour. */
  bloom: string;
  /** Middle of a flower, or the highlight on a fruit. */
  heart: string;
  petals: number;
  /** How many fruits hang on it, and how big they are relative to a unit. */
  fruits: number;
  fruitR: number;
  /** Ignored by flowers. */
  shape: FruitShape;
}

export const SEEDS: readonly Seed[] = [
  {
    id: 'sunflower', emoji: '🌻', name: 'hoa hướng dương', ripe: 'Hoa hướng dương nở rồi!',
    kind: 'flower', height: 3.2, stem: '#4d7c0f', leaf: '#65a30d', bloom: '#facc15', heart: '#78350f',
    petals: 12, fruits: 0, fruitR: 0, shape: 'ball',
  },
  {
    id: 'rose', emoji: '🌹', name: 'hoa hồng', ripe: 'Hoa hồng nở rồi!',
    kind: 'flower', height: 2.2, stem: '#3f6212', leaf: '#4d7c0f', bloom: '#f43f5e', heart: '#fda4af',
    petals: 8, fruits: 0, fruitR: 0, shape: 'ball',
  },
  {
    id: 'daisy', emoji: '🌼', name: 'hoa cúc', ripe: 'Hoa cúc nở rồi!',
    kind: 'flower', height: 2, stem: '#4d7c0f', leaf: '#65a30d', bloom: '#f472b6', heart: '#fde047',
    petals: 10, fruits: 0, fruitR: 0, shape: 'ball',
  },
  {
    id: 'tomato', emoji: '🍅', name: 'quả cà chua', ripe: 'Cà chua chín rồi!',
    kind: 'fruit', height: 2.1, stem: '#4d7c0f', leaf: '#65a30d', bloom: '#ef4444', heart: '#fca5a5',
    petals: 0, fruits: 3, fruitR: 0.22, shape: 'ball',
  },
  {
    id: 'strawberry', emoji: '🍓', name: 'quả dâu', ripe: 'Dâu chín rồi!',
    kind: 'fruit', height: 1.2, stem: '#4d7c0f', leaf: '#84cc16', bloom: '#e11d48', heart: '#fecdd3',
    petals: 0, fruits: 4, fruitR: 0.19, shape: 'berry',
  },
  {
    id: 'pumpkin', emoji: '🎃', name: 'quả bí ngô', ripe: 'Bí ngô to rồi!',
    kind: 'fruit', height: 0.4, stem: '#4d7c0f', leaf: '#65a30d', bloom: '#f97316', heart: '#fdba74',
    petals: 0, fruits: 1, fruitR: 0.62, shape: 'pumpkin',
  },
  {
    id: 'carrot', emoji: '🥕', name: 'củ cà rốt', ripe: 'Cà rốt to rồi!',
    kind: 'root', height: 0.55, stem: '#4d7c0f', leaf: '#65a30d', bloom: '#f97316', heart: '#fb923c',
    petals: 0, fruits: 1, fruitR: 0.42, shape: 'carrot',
  },
  {
    id: 'corn', emoji: '🌽', name: 'bắp ngô', ripe: 'Ngô chín rồi!',
    kind: 'fruit', height: 3, stem: '#65a30d', leaf: '#84cc16', bloom: '#fbbf24', heart: '#fde68a',
    petals: 0, fruits: 2, fruitR: 0.26, shape: 'cob',
  },
];

export function seedById(id: string): Seed | undefined {
  return SEEDS.find((s) => s.id === id);
}

/** Drinks of water between a seed going in and the plant being ready. */
export const WATER_STEPS = 4;
/** A star every this many things picked. */
export const HARVEST_FOR_STAR = 3;
/** How long the watering can stays over a plant. */
export const WATER_MS = 800;
/** How fast the drawn plant catches up with the drinks it has had, per second. */
export const GROW_RATE = 0.9;

export interface Plot {
  /** Across the bed, 0…1. */
  at: number;
  seed: Seed | null;
  /** Drinks so far. `WATER_STEPS` means ready. */
  water: number;
  /** What is drawn: eases up to `water / WATER_STEPS` so growing is something you see. */
  grown: number;
  /** Seconds left of the watering-can animation. */
  watering: number;
  /** Its own phase, so a row of plants does not sway in lockstep. */
  sway: number;
}

export function makePlots(n: number, rng: () => number = Math.random): Plot[] {
  return Array.from({ length: n }, (_, i) => ({
    // Inset from the edges, leaving the bottom-left corner for the basket.
    at: n < 2 ? 0.5 : 0.24 + (i * 0.64) / (n - 1),
    seed: null,
    water: 0,
    grown: 0,
    watering: 0,
    sway: rng() * Math.PI * 2,
  }));
}

/** How many plots fit: a phone gets fewer, so every one of them stays tappable. */
export function plotCount(w: number, unit: number): number {
  return Math.max(3, Math.min(6, Math.floor(w / (unit * 1.5))));
}

export const isEmpty = (plot: Plot): boolean => plot.seed === null;
export const isRipe = (plot: Plot): boolean => plot.seed !== null && plot.water >= WATER_STEPS;

/** What a tap on this plot would do right now. */
export type PlotAction = 'plant' | 'water' | 'harvest';

export function actionFor(plot: Plot): PlotAction {
  if (isEmpty(plot)) return 'plant';
  return isRipe(plot) ? 'harvest' : 'water';
}

export function plant(plot: Plot, seed: Seed): void {
  plot.seed = seed;
  plot.water = 0;
  plot.grown = 0;
  plot.watering = 0;
}

/** Give it a drink. Returns true on the drink that finishes it off. */
export function water(plot: Plot): boolean {
  if (plot.seed === null || isRipe(plot)) return false;
  plot.water++;
  plot.watering = WATER_MS / 1000;
  return isRipe(plot);
}

/** Take what grew, leaving bare soil. `null` if there was nothing ready. */
export function harvest(plot: Plot): Seed | null {
  if (!isRipe(plot)) return null;
  const seed = plot.seed;
  plot.seed = null;
  plot.water = 0;
  plot.grown = 0;
  plot.watering = 0;
  return seed;
}

/** Ease the drawn plant towards the number of drinks it has had. */
export function settle(plot: Plot, dt: number): void {
  const step = Math.min(0.05, Math.max(0, dt));
  plot.watering = Math.max(0, plot.watering - step);
  const want = plot.seed === null ? 0 : plot.water / WATER_STEPS;
  plot.grown += (want - plot.grown) * Math.min(1, GROW_RATE * step * 4);
}

// ---- the day going round ----

/** One whole day, in seconds. Long enough to be a change, short enough to see one. */
export const DAY_SECONDS = 150;

/** Where in the day it is: 0 is sunrise, 0.5 is sunset, 0.75 is the middle of the night. */
export function dayPhase(clock: number): number {
  // Start mid-morning, so opening the game is not a sunrise every time.
  return ((clock / DAY_SECONDS) % 1 + 0.15) % 1;
}

/** 1 in broad daylight, 0 in the dead of night. */
export function daylight(clock: number): number {
  // Weighted towards daytime: the fireflies are lovely, but a toddler should not
  // have to wait through a long night to see the garden again.
  const phase = dayPhase(clock);
  if (phase < 0.06) return phase / 0.06;
  if (phase < 0.5) return 1;
  if (phase < 0.62) return 1 - (phase - 0.5) / 0.12;
  if (phase < 0.82) return 0;
  return (phase - 0.82) / 0.18;
}

const SKY_KEYS: readonly { at: number; stops: readonly [string, string, string] }[] = [
  { at: 0, stops: ['#f472b6', '#fdba74', '#fef3c7'] },
  { at: 0.12, stops: ['#7dd3fc', '#bae6fd', '#fef9c3'] },
  { at: 0.42, stops: ['#38bdf8', '#bae6fd', '#fef9c3'] },
  { at: 0.52, stops: ['#fb923c', '#fdba74', '#fef3c7'] },
  { at: 0.62, stops: ['#312e81', '#6d28d9', '#f472b6'] },
  { at: 0.75, stops: ['#020617', '#0f172a', '#1e293b'] },
  { at: 0.95, stops: ['#1e1b4b', '#4c1d95', '#7c3aed'] },
  { at: 1, stops: ['#f472b6', '#fdba74', '#fef3c7'] },
];

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (x: number, y: number): number => Math.round(x + (y - x) * t);
  return `rgb(${to(ar, br)},${to(ag, bg)},${to(ab, bb)})`;
}

/** Sky colours top, middle and horizon for right now. */
export function skyStops(clock: number): [string, string, string] {
  const phase = dayPhase(clock);
  let lo = SKY_KEYS[0]!;
  let hi = SKY_KEYS[SKY_KEYS.length - 1]!;
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (phase >= SKY_KEYS[i]!.at && phase <= SKY_KEYS[i + 1]!.at) {
      lo = SKY_KEYS[i]!;
      hi = SKY_KEYS[i + 1]!;
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = Math.max(0, Math.min(1, (phase - lo.at) / span));
  return [mixHex(lo.stops[0], hi.stops[0], t), mixHex(lo.stops[1], hi.stops[1], t), mixHex(lo.stops[2], hi.stops[2], t)];
}

/** Where the sun (or, at night, the moon) is, on an arc across the sky. */
export function skyBody(clock: number, field: Field): { x: number; y: number; moon: boolean } {
  const phase = dayPhase(clock);
  const moon = phase >= 0.5;
  // Each of them crosses the sky over its own half of the day.
  const along = moon ? (phase - 0.5) * 2 : phase * 2;
  return {
    x: field.w * (0.08 + along * 0.84),
    y: field.ground - Math.sin(along * Math.PI) * field.ground * 0.78 - field.unit * 0.2,
    moon,
  };
}

// ---- what flies about ----

export type BugKind = 'butterfly' | 'bee' | 'ladybug';

export interface Bug {
  kind: BugKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** Where it is heading. */
  tx: number;
  ty: number;
  hue: number;
  /** Seconds left of bolting away from a finger. */
  dash: number;
}

export interface Field {
  w: number;
  h: number;
  /** y of the top of the soil. */
  ground: number;
  unit: number;
}

export function makeField(w: number, h: number): Field {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  return { w: width, h: height, ground: height * 0.78, unit: Math.min(width, height) / 6.5 };
}

export function makeBugs(field: Field, rng: () => number = Math.random): Bug[] {
  const kinds: BugKind[] = ['butterfly', 'butterfly', 'bee', 'ladybug'];
  return kinds.map((kind) => ({
    kind,
    x: field.w * rng(),
    y: kind === 'ladybug' ? field.ground : field.ground * (0.3 + rng() * 0.5),
    vx: 0,
    vy: 0,
    phase: rng() * Math.PI * 2,
    tx: field.w * rng(),
    ty: field.ground * (0.3 + rng() * 0.5),
    hue: rng(),
    dash: 0,
  }));
}

/** Fly on. `blooms` are the open flowers worth visiting. */
export function stepBug(
  bug: Bug,
  dt: number,
  field: Field,
  blooms: readonly { x: number; y: number }[],
  rng: () => number = Math.random,
): void {
  const step = Math.min(0.05, Math.max(0, dt));
  bug.dash = Math.max(0, bug.dash - step);
  const hurry = bug.dash > 0 ? 2.6 : 1;
  bug.phase += step * (bug.kind === 'bee' ? 14 : bug.kind === 'butterfly' ? 7 : 4) * hurry;

  if (bug.kind === 'ladybug') {
    const speed = field.unit * 0.6 * hurry;
    if (Math.abs(bug.vx) < speed * 0.5) bug.vx = (rng() < 0.5 ? -1 : 1) * speed;
    bug.x += bug.vx * step;
    const margin = field.unit * 0.4;
    if (bug.x < margin) {
      bug.x = margin;
      bug.vx = Math.abs(bug.vx);
    }
    if (bug.x > field.w - margin) {
      bug.x = field.w - margin;
      bug.vx = -Math.abs(bug.vx);
    }
    bug.y = field.ground + field.unit * 0.12;
    return;
  }

  // A flower to sit over if there is one, otherwise anywhere in the air.
  if (Math.hypot(bug.tx - bug.x, bug.ty - bug.y) < field.unit * 0.5) {
    const bloom = blooms.length ? blooms[randInt(0, blooms.length - 1, rng)] : undefined;
    if (bloom && rng() < 0.75) {
      bug.tx = bloom.x;
      bug.ty = bloom.y - field.unit * 0.35;
    } else {
      bug.tx = field.w * (0.05 + rng() * 0.9);
      bug.ty = field.ground * (0.2 + rng() * 0.6);
    }
  }
  const speed = field.unit * (bug.kind === 'bee' ? 2.2 : 1.4) * hurry;
  const dx = bug.tx - bug.x;
  const dy = bug.ty - bug.y;
  const away = Math.hypot(dx, dy) || 1;
  bug.vx += ((dx / away) * speed - bug.vx) * Math.min(1, 3 * step);
  bug.vy += ((dy / away) * speed - bug.vy) * Math.min(1, 3 * step);
  bug.x += bug.vx * step;
  // Butterflies bob: the flap is what lifts them, so they never fly a straight line.
  bug.y += bug.vy * step + Math.sin(bug.phase) * field.unit * (bug.kind === 'butterfly' ? 0.9 : 0.25) * step;
  bug.x = Math.max(0, Math.min(field.w, bug.x));
  bug.y = Math.max(field.h * 0.05, Math.min(field.ground - field.unit * 0.1, bug.y));
}

/** Vietnamese name, spoken when the child catches one. */
export const BUG_NAMES: Readonly<Record<BugKind, string>> = {
  butterfly: 'con bướm',
  bee: 'con ong',
  ladybug: 'con bọ rùa',
};

/** A generous hit box; toddler fingers, not a mouse. */
export function hitsBug(bug: Bug, x: number, y: number, field: Field): boolean {
  return Math.hypot(bug.x - x, bug.y - y) < Math.max(field.unit * 0.55, 26);
}

/** Send it off in a hurry, away from the finger. */
export function shooBug(bug: Bug, x: number, y: number, field: Field): void {
  const dx = bug.x - x || 1;
  const dy = bug.y - y || -1;
  const away = Math.hypot(dx, dy) || 1;
  bug.dash = 1.4;
  if (bug.kind === 'ladybug') {
    bug.vx = Math.sign(dx) * field.unit * 1.6;
    return;
  }
  bug.tx = Math.max(0, Math.min(field.w, bug.x + (dx / away) * field.unit * 4));
  bug.ty = Math.max(field.h * 0.06, bug.y + (dy / away) * field.unit * 2.5 - field.unit);
}

// ---- scenery ----

export interface Cloud {
  x: number;
  y: number;
  r: number;
  drift: number;
}

export function makeClouds(field: Field, rng: () => number = Math.random): Cloud[] {
  const n = Math.max(2, Math.round(field.w / 260));
  return Array.from({ length: n }, () => ({
    x: field.w * rng(),
    y: field.h * (0.05 + rng() * 0.16),
    r: field.unit * (0.4 + rng() * 0.35),
    drift: field.unit * (0.08 + rng() * 0.12),
  }));
}

export interface Tuft {
  x: number;
  h: number;
  hue: number;
  phase: number;
}

export function makeTufts(field: Field, rng: () => number = Math.random): Tuft[] {
  const n = Math.max(8, Math.round(field.w / 34));
  return Array.from({ length: n }, () => ({
    x: field.w * rng(),
    h: field.unit * (0.3 + rng() * 0.34),
    hue: 90 + rng() * 40,
    phase: rng() * Math.PI * 2,
  }));
}
