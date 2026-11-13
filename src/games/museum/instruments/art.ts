/**
 * Small helpers for the realistic drawings: multi-stop gradients, wood grain,
 * chrome and soft shadows. Everything is static SVG (no filters), so it is cheap
 * on a low-end phone; the only blur is a `feGaussianBlur` that callers skip when
 * `soft` is false.
 */
import { r1 } from './svg';

export type Stop = [offset: number, color: string, opacity?: number];

const stops = (s: Stop[]): string =>
  s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');

/** A linear gradient from (x1,y1) to (x2,y2) as fractions of the shape's box. */
export function lg(id: string, s: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
}

/** A radial gradient; (cx,cy) is the middle, (fx,fy) the bright spot. */
export function rg(id: string, s: Stop[], cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy): string {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${stops(s)}</radialGradient>`;
}

/** Brushed chrome: dark-light-dark bands, for hoops, lugs, frets and stands. */
export function chromeGrad(id: string, across: 'x' | 'y' = 'y'): string {
  return lg(
    id,
    [
      [0, '#6b7280'],
      [0.18, '#f8fafc'],
      [0.4, '#9ca3af'],
      [0.62, '#e5e7eb'],
      [0.85, '#6b7280'],
      [1, '#d1d5db'],
    ],
    0,
    0,
    across === 'x' ? 1 : 0,
    across === 'y' ? 1 : 0,
  );
}

/** Gold brass (cymbals). */
export function brassGrad(id: string): string {
  return rg(
    id,
    [
      [0, '#fff4b8'],
      [0.35, '#f5c542'],
      [0.7, '#c98d12'],
      [1, '#8a5a0b'],
    ],
    0.5,
    0.5,
    0.6,
    0.38,
    0.32,
  );
}

/** A soft shadow ellipse on the floor under something (no filter: stacked translucent ellipses). */
export function groundShadow(cx: number, cy: number, rx: number, ry: number, a = 0.22): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.18;
    out += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx * k)}" ry="${r1(ry * k)}" fill="#000" opacity="${r1((a / 4) * 100) / 100}"/>`;
  }
  return out;
}

/** Deterministic 0…1 from an integer, so grain looks the same every render. */
export function rnd(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
