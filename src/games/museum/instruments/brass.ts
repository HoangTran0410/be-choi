/**
 * Shared bits for the metal and lacquer drawings (brass, chrome, bronze): gradients that
 * run across or along an instrument whatever way it lies, layered tube strokes that read
 * as a shiny cylinder, rivets and screws. Static SVG only - no filters - so it is cheap.
 */
import { lg, type Stop } from './art';
import { r1 } from './svg';

/** Gradient direction across (thickness) and along (length) the instrument. */
export function dirs(portrait: boolean): { across: [number, number, number, number]; along: [number, number, number, number] } {
  return portrait ? { across: [0, 0, 1, 0], along: [0, 0, 0, 1] } : { across: [0, 0, 0, 1], along: [0, 0, 1, 0] };
}

export const across = (id: string, portrait: boolean, s: Stop[]): string => lg(id, s, ...dirs(portrait).across);
export const along = (id: string, portrait: boolean, s: Stop[]): string => lg(id, s, ...dirs(portrait).along);

/** Lacquered brass seen on a cylinder: dark edge, warm body, a hot specular stripe, a bounce light. */
export const BRASS: Stop[] = [
  [0, '#6b3f06'],
  [0.12, '#c98d12'],
  [0.3, '#f9d86a'],
  [0.38, '#fff7cc'],
  [0.46, '#f5c542'],
  [0.7, '#c98d12'],
  [0.88, '#e7b43a'],
  [1, '#6b3f06'],
];

/** Polished silver / nickel. */
export const SILVER: Stop[] = [
  [0, '#5b6472'],
  [0.14, '#cbd5e1'],
  [0.3, '#ffffff'],
  [0.42, '#e2e8f0'],
  [0.66, '#94a3b8'],
  [0.86, '#d5dde8'],
  [1, '#556070'],
];

/** Hammered bronze, a little redder than brass. */
export const BRONZE: Stop[] = [
  [0, '#fde7a0'],
  [0.35, '#d89a3a'],
  [0.7, '#a85f1c'],
  [1, '#5e300c'],
];

export type Tone = [dark: string, mid: string, light: string, spec: string];
export const BRASS_TONE: Tone = ['#7a4a08', '#d79b1c', '#f7d160', '#fffbe0'];
export const SILVER_TONE: Tone = ['#4b5563', '#9aa5b4', '#dbe3ec', '#ffffff'];

/**
 * A bent pipe as layered strokes: a dark outline, the body, a lighter core and a thin
 * specular line on top, so a plain path looks like a lacquered tube.
 */
export function tubeStroke(d: string, w: number, tone: Tone = BRASS_TONE): string {
  const L = (width: number, col: string, off = 0) =>
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r1(width)}" stroke-linecap="round" stroke-linejoin="round"${off ? ` transform="translate(0 ${off})"` : ''}/>`;
  return L(w, tone[0]) + L(w * 0.82, tone[1]) + L(w * 0.5, tone[2]) + L(w * 0.16, tone[3]);
}

/** A tiny screw / rivet head. */
export function rivet(cx: number, cy: number, r: number, light = '#f1f5f9', dark = '#6b7280'): string {
  return (
    `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${dark}"/>` +
    `<circle cx="${r1(cx - r * 0.15)}" cy="${r1(cy - r * 0.15)}" r="${r1(r * 0.78)}" fill="${light}"/>` +
    `<line x1="${r1(cx - r * 0.5)}" y1="${r1(cy + r * 0.3)}" x2="${r1(cx + r * 0.5)}" y2="${r1(cy - r * 0.3)}" stroke="${dark}" stroke-width="${r1(Math.max(0.7, r * 0.22))}"/>`
  );
}
