/**
 * The vegetable patch, with no DOM in sight.
 *
 * A plot goes seed -> sprout -> plant -> ripe. Every step but the last needs one
 * drink, and only a watered plot grows. Nothing ever wilts or dies: a plot that is
 * not watered simply waits, thirsty, for as long as it takes. The sun speeds growth
 * up, night slows it down (but never stops it) and rain does the watering.
 */

export interface Crop {
  id: string;
  /** What is picked, and what is shown on the seed packet. */
  emoji: string;
  /** Vietnamese name, spoken when planted and picked. */
  name: string;
  /** Seconds one growth step takes in full sun (after its drink). */
  stageSec: number;
  /** How many are picked from one ripe plot. */
  yield: number;
  /** Farm level at which the seed arrives. */
  level: number;
}

export const CROPS: readonly Crop[] = [
  { id: 'carrot', emoji: '🥕', name: 'cà rốt', stageSec: 6, yield: 2, level: 1 },
  { id: 'corn', emoji: '🌽', name: 'bắp ngô', stageSec: 7, yield: 2, level: 1 },
  { id: 'tomato', emoji: '🍅', name: 'cà chua', stageSec: 6, yield: 2, level: 1 },
  { id: 'strawberry', emoji: '🍓', name: 'dâu tây', stageSec: 6, yield: 3, level: 2 },
  { id: 'broccoli', emoji: '🥦', name: 'súp lơ', stageSec: 7, yield: 2, level: 3 },
  { id: 'pumpkin', emoji: '🎃', name: 'bí ngô', stageSec: 9, yield: 1, level: 4 },
  { id: 'eggplant', emoji: '🍆', name: 'cà tím', stageSec: 8, yield: 2, level: 5 },
  { id: 'watermelon', emoji: '🍉', name: 'dưa hấu', stageSec: 10, yield: 1, level: 6 },
  { id: 'sunflower', emoji: '🌻', name: 'hoa hướng dương', stageSec: 7, yield: 2, level: 7 },
];

export function cropById(id: string): Crop | undefined {
  return CROPS.find((c) => c.id === id);
}

/** Crops whose seeds the child has by `level`. */
export function cropsAt(level: number): Crop[] {
  return CROPS.filter((c) => c.level <= level);
}

/** 0 seed, 1 sprout, 2 plant, 3 ripe. */
export const RIPE = 3;
/** What each stage looks like and is called, in the order a plant grows. */
export const STAGE_EMOJI = ['🟤', '🌱', '🌿'] as const;
export const STAGE_NAME = ['hạt giống', 'mầm non', 'cây con', 'chín rồi'] as const;

export interface Plot {
  crop: string | null;
  stage: number;
  /** Has had its drink and is growing towards the next stage. */
  wet: boolean;
  /** 0 … 1 of the way to the next stage while wet. */
  prog: number;
}

export function emptyPlot(): Plot {
  return { crop: null, stage: 0, wet: false, prog: 0 };
}

export const isEmpty = (p: Plot): boolean => p.crop === null;
export const isRipe = (p: Plot): boolean => p.crop !== null && p.stage >= RIPE;
export const isThirsty = (p: Plot): boolean => p.crop !== null && p.stage < RIPE && !p.wet;

export type PlotAction = 'plant' | 'water' | 'harvest' | 'wait';

/** What a tap on this plot does. Growing and already watered is `wait` (only a happy sound). */
export function actionFor(p: Plot): PlotAction {
  if (isEmpty(p)) return 'plant';
  if (isRipe(p)) return 'harvest';
  return isThirsty(p) ? 'water' : 'wait';
}

export function plant(p: Plot, crop: Crop): boolean {
  if (!isEmpty(p)) return false;
  p.crop = crop.id;
  p.stage = 0;
  p.wet = false;
  p.prog = 0;
  return true;
}

export function water(p: Plot): boolean {
  if (!isThirsty(p)) return false;
  p.wet = true;
  p.prog = 0;
  return true;
}

/** Pick a ripe plot: returns what and how many, and leaves bare soil. */
export function harvest(p: Plot): { crop: Crop; n: number } | null {
  if (!isRipe(p)) return null;
  const crop = cropById(p.crop!);
  Object.assign(p, emptyPlot());
  return crop ? { crop, n: crop.yield } : null;
}

/** How fast things grow: slow but never stopped at night, quick at noon, quicker in rain. */
export function growthRate(light: number, raining: boolean): number {
  const l = Math.min(1, Math.max(0, light));
  return (0.4 + 0.6 * l) * (raining ? 1.25 : 1);
}

/** Grow one plot. Returns true when it reached a new stage. */
export function tickPlot(p: Plot, dt: number, rate: number): boolean {
  if (p.crop === null || !p.wet || p.stage >= RIPE) return false;
  const crop = cropById(p.crop);
  if (!crop) return false;
  p.prog += (Math.max(0, dt) * rate) / crop.stageSec;
  if (p.prog < 1) return false;
  p.stage++;
  p.prog = 0;
  p.wet = false;
  return true;
}

/** Rain gives every thirsty plot its drink. Returns how many it watered. */
export function rain(plots: readonly Plot[]): number {
  let n = 0;
  for (const p of plots) if (water(p)) n++;
  return n;
}

/** What to draw on the plot. */
export function plotEmoji(p: Plot): string {
  if (p.crop === null) return '';
  if (p.stage >= RIPE) return cropById(p.crop)?.emoji ?? '';
  return STAGE_EMOJI[Math.min(p.stage, STAGE_EMOJI.length - 1)] ?? '';
}

/** How many plots the farm has at `level`. */
export function plotCountFor(level: number): number {
  if (level >= 7) return 12;
  if (level >= 5) return 10;
  if (level >= 3) return 8;
  return 6;
}
