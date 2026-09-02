import { COLORS } from '../../core/content';
import { pick, shuffle, svgEl } from '../../core/dom';

export type ShapeId = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'hexagon' | 'diamond' | 'oval';

export interface ShapeDef {
  id: ShapeId;
  /** Vietnamese name, spoken when placed. */
  name: string;
  /** SVG path in a 100×100 box. */
  path: string;
}

export const SHAPES: readonly ShapeDef[] = [
  { id: 'circle', name: 'hình tròn', path: 'M50,5 A45,45 0 1,0 50,95 A45,45 0 1,0 50,5 Z' },
  { id: 'square', name: 'hình vuông', path: 'M10,10 H90 V90 H10 Z' },
  { id: 'triangle', name: 'hình tam giác', path: 'M50,8 L92,88 H8 Z' },
  {
    id: 'star',
    name: 'ngôi sao',
    path: 'M50,5 L60.6,35.4 L92.8,36.1 L67.1,55.6 L76.5,86.4 L50,68 L23.5,86.4 L32.9,55.6 L7.2,36.1 L39.4,35.4 Z',
  },
  {
    id: 'heart',
    name: 'trái tim',
    path: 'M50,88 C20,65 5,48 5,30 C5,15 17,7 28,7 C38,7 46,13 50,22 C54,13 62,7 72,7 C83,7 95,15 95,30 C95,48 80,65 50,88 Z',
  },
  { id: 'hexagon', name: 'hình lục giác', path: 'M95,50 L72.5,89 L27.5,89 L5,50 L27.5,11 L72.5,11 Z' },
  { id: 'diamond', name: 'hình thoi', path: 'M50,5 L92,50 L50,95 L8,50 Z' },
  { id: 'oval', name: 'hình bầu dục', path: 'M5,50 A45,30 0 1,0 95,50 A45,30 0 1,0 5,50 Z' },
];

export interface ShapePiece {
  shape: ShapeId;
  color: string;
}

export interface ShapeRound {
  /** Holes on the board, in display order. */
  targets: ShapePiece[];
  /** Pieces in the tray: a shuffled copy of `targets`. */
  tray: ShapePiece[];
}

/** Rounds 0 and 1 use 3 shapes, later rounds use 4. */
export function roundSize(roundIndex: number): number {
  return roundIndex < 2 ? 3 : 4;
}

export function makeShapeRound(roundIndex: number, rng: () => number = Math.random): ShapeRound {
  const n = roundSize(roundIndex);
  const shapes = pick(SHAPES, n, rng);
  const colors = pick(COLORS, n, rng);
  const targets = shapes.map((s, i) => ({ shape: s.id, color: colors[i]?.hex ?? '#f97316' }));
  return { targets, tray: shuffle(targets, rng) };
}

export function shapeDef(id: ShapeId): ShapeDef {
  const def = SHAPES.find((s) => s.id === id);
  if (!def) throw new Error(`unknown shape ${id}`);
  return def;
}

export function shapeSvg(shape: ShapeId, fill: string): SVGSVGElement {
  return svgEl(
    `<svg viewBox="0 0 100 100" class="shape-svg"><path d="${shapeDef(shape).path}" fill="${fill}" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linejoin="round"/></svg>`,
  );
}

export function holeSvg(shape: ShapeId): SVGSVGElement {
  return svgEl(
    `<svg viewBox="0 0 100 100" class="hole-svg"><path d="${shapeDef(shape).path}" fill="#3b2f2f" fill-opacity=".3" stroke="#3b2f2f" stroke-opacity=".35" stroke-width="3" stroke-dasharray="6 5" stroke-linejoin="round"/></svg>`,
  );
}
