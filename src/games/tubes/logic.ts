import { COLORS, type ColorDef } from '../../core/content';
import { shuffle } from '../../core/dom';
import type { Pt, RectLike } from '../../core/drag';

/**
 * Ball sort: tubes of coloured balls, one ball moved at a time, until every tube
 * holds a single colour. The rule here is the forgiving one — a ball goes into
 * *any* tube that still has room, whatever colour is already in it. A two-year-old
 * cannot read a dead end, so there are none: every board stays solvable no matter
 * how it is shuffled around.
 */

/** Empty tubes the child gets to work in. Two the whole way up: room to be wrong. */
export const SPARE_TUBES = 2;

/** Colours in play × balls per colour, as the levels climb. The last rung repeats forever. */
const LADDER: readonly (readonly [colors: number, height: number])[] = [
  [2, 3],
  [3, 3],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 4],
  [6, 5],
];

export interface Level {
  /** Distinct colours, one per full tube once the board is solved. */
  colors: number;
  /** Balls of each colour — also how many fit in one tube. */
  height: number;
  /** Tubes on the board: the full ones plus `SPARE_TUBES` empties. */
  tubes: number;
}

/**
 * The colours enter the game most-different-first, so the two in the first level
 * are red and blue and never red and pink. Always the same order, too: the board
 * a child learns on today is the board that greets them tomorrow.
 */
const PALETTE: readonly string[] = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink'];

export function paletteFor(colors: number): ColorDef[] {
  return PALETTE.slice(0, colors).map((id) => COLORS.find((c) => c.id === id)!);
}

export function levelSetup(index: number): Level {
  const rung = LADDER[Math.min(Math.max(index, 0), LADDER.length - 1)]!;
  const [colors, height] = rung;
  return { colors, height, tubes: colors + SPARE_TUBES };
}

/** Tubes bottom first: `board[i][0]` rests on the floor of tube `i`, the last entry is on top. */
export type Board = string[][];

export interface Deal {
  level: Level;
  /** The colours this round is played with, one per full tube. */
  palette: ColorDef[];
  tubes: Board;
}

/** A tube nobody needs to touch again: full, and all one colour. */
export function isTubeDone(tube: readonly string[], height: number): boolean {
  return tube.length === height && tube.every((c) => c === tube[0]);
}

/** Every tube is empty or finished — the round is won. */
export function isSolved(tubes: readonly (readonly string[])[], height: number): boolean {
  return tubes.every((t) => t.length === 0 || isTubeDone(t, height));
}

/** Any ball may go anywhere there is still room; only a tube cannot pour into itself. */
export function canMove(tubes: readonly (readonly string[])[], from: number, to: number, height: number): boolean {
  const src = tubes[from];
  const dst = tubes[to];
  if (!src || !dst || from === to) return false;
  return src.length > 0 && dst.length < height;
}

export function dealLevel(index: number, rng: () => number = Math.random): Deal {
  const level = levelSetup(index);
  const palette = paletteFor(level.colors);
  const bag = palette.flatMap((c) => Array.from({ length: level.height }, () => c.id));
  let tubes: Board = [];
  // A tube that is finished before the child touches it is a tube of the puzzle
  // given away for free: shuffle again.
  for (let tries = 0; tries < 20; tries++) {
    const mixed = shuffle(bag, rng);
    tubes = [];
    for (let i = 0; i < level.colors; i++) tubes.push(mixed.slice(i * level.height, (i + 1) * level.height));
    for (let i = 0; i < SPARE_TUBES; i++) tubes.push([]);
    if (!tubes.some((t) => isTubeDone(t, level.height))) break;
  }
  return { level, palette, tubes };
}

export interface Move {
  from: number;
  to: number;
}

/**
 * A move worth showing when the child has gone quiet: put a ball on top of its
 * own colour (the biggest such pile first), else into an empty tube, else
 * anywhere legal. Pass `only` to look for moves out of one tube — the one whose
 * ball is already lifted out and waiting in the child's hand.
 */
export function suggestMove(tubes: readonly (readonly string[])[], height: number, only: number | null = null): Move | null {
  let best: Move | null = null;
  let bestPile = -1;
  let empty: Move | null = null;
  let any: Move | null = null;
  for (let from = 0; from < tubes.length; from++) {
    if (only !== null && from !== only) continue;
    const src = tubes[from]!;
    if (!src.length || isTubeDone(src, height)) continue;
    const ball = src[src.length - 1]!;
    /** A tube holding nothing but this colour gains nothing by moving to an empty one. */
    const pure = src.every((c) => c === ball);
    for (let to = 0; to < tubes.length; to++) {
      if (!canMove(tubes, from, to, height)) continue;
      const dst = tubes[to]!;
      any ??= { from, to };
      if (!dst.length) {
        if (!empty && !pure) empty = { from, to };
        continue;
      }
      if (dst[dst.length - 1] !== ball) continue;
      const pile = dst.filter((c) => c === ball).length;
      if (pile > bestPile) {
        bestPile = pile;
        best = { from, to };
      }
    }
  }
  return best ?? empty ?? any;
}

/** How many ball widths one tube takes across, glass and the gap to its neighbour included. */
const TUBE_W = 1.6;
/** Ball heights a tube needs on top of its balls: the rim, plus headroom for a lifted ball. */
const TUBE_H = 1.15;
/** The gap between two rows of tubes, in ball heights. */
const GAP_Y = 0.35;
/** Floor left under the bottom row so the glass looks centred, not dropped. */
const PAD_Y = 0.55;
/** Two rows of tubes at most: three would leave the balls too small to see. */
export const MAX_ROWS = 2;

export interface Layout {
  rows: number;
  cols: number;
  /** Ball diameter in px. */
  ball: number;
}

/** The tube grid, and the ball size, that fills a `w` × `h` area best. */
export function bestLayout(tubes: number, height: number, w: number, h: number): Layout {
  let best: Layout = { rows: 1, cols: Math.max(tubes, 1), ball: 0 };
  for (let rows = 1; rows <= Math.min(MAX_ROWS, Math.max(tubes, 1)); rows++) {
    const cols = Math.ceil(tubes / rows);
    const tall = rows * (height + TUBE_H) + (rows - 1) * GAP_Y + PAD_Y;
    const ball = Math.floor(Math.min(w / (cols * TUBE_W), h / tall));
    if (ball > best.ball) best = { rows, cols, ball };
  }
  return best;
}

/** Index of the tube nearest `p`, or -1 when even the nearest is further than `slack` away. */
export function tubeAt(p: Pt, rects: readonly RectLike[], slack: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width));
    const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height));
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= slack ? best : -1;
}
