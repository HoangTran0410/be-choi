/** Static data and tiny pure helpers for the ambience scene: sky palettes, colour maths, random picks. */
import type { Sky } from './logic';

export type RGB = [number, number, number];
export interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue?: number;
  spin?: number;
  a?: number;
  emoji?: string;
}

export const SKIES: Record<Sky | 'day', [RGB, RGB]> = {
  day: [
    [125, 211, 252],
    [224, 242, 254],
  ],
  dawn: [
    [244, 114, 182],
    [253, 230, 138],
  ],
  storm: [
    [71, 85, 105],
    [148, 163, 184],
  ],
  night: [
    [11, 16, 38],
    [49, 46, 129],
  ],
  deep: [
    [14, 116, 144],
    [8, 51, 68],
  ],
  space: [
    [6, 4, 20],
    [46, 16, 101],
  ],
  winter: [
    [148, 163, 184],
    [226, 232, 240],
  ],
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;
