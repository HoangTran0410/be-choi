/**
 * Brick builder rules: a studded baseplate as a grid of cells, gravity that
 * drops a brick to the lowest supported row, and "build the model" targets.
 * Coordinates are grid cells; `y = 0` is the ground row and y grows upward.
 */

export interface Brick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface Board {
  cols: number;
  rows: number;
  bricks: Brick[];
}

export interface BrickSize {
  w: number;
  h: number;
}

/** The five templates in the tray: 1×1, 2×1, 3×1, 4×1 and 2×2. */
export const BRICK_SIZES: readonly BrickSize[] = [
  { w: 1, h: 1 },
  { w: 2, h: 1 },
  { w: 3, h: 1 },
  { w: 4, h: 1 },
  { w: 2, h: 2 },
];

const RED = '#ef4444';
const ORANGE = '#f97316';
const YELLOW = '#facc15';
const GREEN = '#22c55e';
const BLUE = '#3b82f6';
const PURPLE = '#a855f7';

/** Six bright LEGO-ish colours. */
export const BRICK_COLORS: readonly string[] = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE];

const COLOR_NAMES: Readonly<Record<string, string>> = {
  [RED]: 'màu đỏ',
  [ORANGE]: 'màu cam',
  [YELLOW]: 'màu vàng',
  [GREEN]: 'màu xanh lá',
  [BLUE]: 'màu xanh dương',
  [PURPLE]: 'màu tím',
};

/** Vietnamese name of a brick colour, spoken when the child picks it. */
export function colorName(color: string): string {
  return COLOR_NAMES[color] ?? 'màu';
}

/** Free mode never celebrates; one star after this many bricks placed in a session. */
export const FREE_STAR_AFTER = 30;

export const DEFAULT_COLS = 10;
export const DEFAULT_ROWS = 8;

export function emptyBoard(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): Board {
  return { cols, rows, bricks: [] };
}

export function cells(brick: Brick): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < brick.h; dy++) {
    for (let dx = 0; dx < brick.w; dx++) out.push({ x: brick.x + dx, y: brick.y + dy });
  }
  return out;
}

function overlaps(b: Brick, x: number, y: number, w: number, h: number): boolean {
  return b.x < x + w && x < b.x + b.w && b.y < y + h && y < b.y + b.h;
}

/** The brick that covers cell (x, y), if any. */
export function brickAt(board: Board, x: number, y: number, ignoreId?: number): Brick | undefined {
  return board.bricks.find((b) => b.id !== ignoreId && overlaps(b, x, y, 1, 1));
}

/** Inside the grid and not overlapping any brick (other than `ignoreId`). */
export function canPlace(board: Board, x: number, y: number, w: number, h: number, ignoreId?: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || w < 1 || h < 1) return false;
  if (x < 0 || y < 0 || x + w > board.cols || y + h > board.rows) return false;
  return !board.bricks.some((b) => b.id !== ignoreId && overlaps(b, x, y, w, h));
}

/** At least one cell directly under row `y` across [x, x + w) is occupied. */
function supported(board: Board, x: number, y: number, w: number, ignoreId?: number): boolean {
  for (let dx = 0; dx < w; dx++) if (brickAt(board, x + dx, y - 1, ignoreId)) return true;
  return false;
}

/**
 * Gravity: the lowest row where a `w × h` brick at column `x` fits and rests on
 * the ground or on at least one brick. `null` when nothing fits in that column.
 */
export function dropY(board: Board, x: number, w: number, h: number, ignoreId?: number): number | null {
  if (x < 0 || x + w > board.cols) return null;
  for (let y = 0; y + h <= board.rows; y++) {
    if (!canPlace(board, x, y, w, h, ignoreId)) continue;
    if (y === 0 || supported(board, x, y, w, ignoreId)) return y;
  }
  return null;
}

/** A new board with the brick added under a fresh id. Callers check `canPlace`/`dropY` first. */
export function place(board: Board, brick: Omit<Brick, 'id'>): Board {
  const id = board.bricks.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  return { ...board, bricks: [...board.bricks, { ...brick, id }] };
}

export function removeBrick(board: Board, id: number): Board {
  return { ...board, bricks: board.bricks.filter((b) => b.id !== id) };
}

/**
 * The same bricks on a `cols × rows` plate (rotation): shifted by `dx` columns,
 * re-dropped bottom-up so nothing floats, dropping the ones that no longer fit.
 */
export function refitBoard(board: Board, cols: number, rows: number, dx = 0): Board {
  let out = emptyBoard(cols, rows);
  const ordered = [...board.bricks].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const b of ordered) {
    const x = b.x + dx;
    const y = dropY(out, x, b.w, b.h);
    if (y === null) continue;
    out = place(out, { x, y, w: b.w, h: b.h, color: b.color });
  }
  return out;
}

export function serialize(board: Board): string {
  return JSON.stringify({ cols: board.cols, rows: board.rows, bricks: board.bricks });
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Parse a saved board; `null` for anything malformed (garbage, out-of-grid or overlapping bricks). */
export function deserialize(json: string): Board | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { cols, rows, bricks } = raw as Record<string, unknown>;
  if (!isInt(cols, 1, 64) || !isInt(rows, 1, 64) || !Array.isArray(bricks)) return null;
  const board = emptyBoard(cols, rows);
  const ids = new Set<number>();
  for (const item of bricks as unknown[]) {
    if (!item || typeof item !== 'object') return null;
    const { id, x, y, w, h, color } = item as Record<string, unknown>;
    if (!isInt(id, 1, 1e9) || ids.has(id)) return null;
    if (!isInt(x, 0, 63) || !isInt(y, 0, 63) || !isInt(w, 1, 64) || !isInt(h, 1, 64)) return null;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return null;
    if (!canPlace(board, x, y, w, h)) return null;
    ids.add(id);
    board.bricks.push({ id, x, y, w, h, color });
  }
  return board;
}

// ---- models ----

export interface ModelCell {
  x: number;
  y: number;
  color: string;
}

export interface Model {
  id: string;
  /** Vietnamese name, spoken when the model starts. */
  name: string;
  cells: ModelCell[];
}

const LEGEND: Readonly<Record<string, string>> = {
  R: RED,
  O: ORANGE,
  Y: YELLOW,
  G: GREEN,
  B: BLUE,
  P: PURPLE,
};

/** Rows are written top first; `.` is empty. Every other letter is a colour from LEGEND. */
function model(id: string, name: string, rows: readonly string[]): Model {
  const cells: ModelCell[] = [];
  rows.forEach((row, r) => {
    const y = rows.length - 1 - r;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? '.';
      if (ch === '.') continue;
      const color = LEGEND[ch];
      if (!color) throw new Error(`model ${id}: unknown colour ${ch}`);
      cells.push({ x, y, color });
    }
  });
  return { id, name, cells };
}

/**
 * Targets on the 10×8 plate. Each is at most 8 wide and 8 tall so it also fits
 * the 8×10 portrait plate, and every cell stands on the ground or on another
 * model cell so it can be built bottom-up with 1×1 bricks.
 */
export const MODELS: readonly Model[] = [
  model('tower', 'tháp cao', ['RR', 'YY', 'BB', 'GG']),
  model('stairs', 'cầu thang', ['..B', '.YB', 'RYB']),
  model('chair', 'cái ghế', ['B..', 'BBB', 'YYY']),
  model('worm', 'con sâu', ['R.....', 'RGYGYG']),
  model('hat', 'cái mũ', ['.PPP.', 'PPPPP']),
  model('flower', 'bông hoa', ['.R.', 'RYR', 'GGG', 'OOO']),
  model('car', 'ô tô', ['.RYYR.', 'RRRRRR', 'BBRRBB']),
  model('robot', 'rô-bốt', ['.R..', '.BB.', '.BB.', 'GGGG', 'YGGY']),
  model('duck', 'con vịt', ['..YYO', 'YYYYY', 'BBBBB']),
  model('boat', 'chiếc thuyền', ['..Y..', '..YY.', 'RRRRR', 'BBBBB']),
  model('tree', 'cái cây', ['..G..', '.GGG.', 'GGGGG', 'GGOGG']),
  model('train', 'tàu hoả', ['R.....', 'RR....', 'RRYYYY', 'BBBBBB']),
  model('bridge', 'cây cầu', ['Y.Y.Y.Y', 'OOOOOOO', 'GBBBBBG']),
  model('castle', 'lâu đài', ['Y.Y.Y', 'YYYYY', 'YYBYY', 'YYBYY']),
  model('house', 'ngôi nhà', ['.RRR.', 'RRRRR', 'YYBYY', 'YYBYY']),
];

/** Rounds 0–1 keep to the small models (≤ 8 cells). */
export const SMALL_MODEL_CELLS = 8;

export function modelFor(round: number, rng: () => number = Math.random, excludeId?: string): Model {
  const pool = round <= 1 ? MODELS.filter((m) => m.cells.length <= SMALL_MODEL_CELLS) : [...MODELS];
  const fresh = pool.filter((m) => m.id !== excludeId);
  const from = fresh.length ? fresh : pool.length ? pool : [...MODELS];
  const idx = Math.min(from.length - 1, Math.floor(rng() * from.length));
  return from[idx] as Model;
}

/** Width/height of the model's bounding box and its left edge. */
export function modelBounds(m: Model): { minX: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of m.cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, width: 0, height: 0 };
  return { minX, width: maxX - minX + 1, height: maxY + 1 };
}

/** Columns to shift the model right so it sits centred on a `cols`-wide plate. */
export function centerOffset(m: Model, cols: number): number {
  const { minX, width } = modelBounds(m);
  return Math.max(0, Math.floor((cols - width) / 2)) - minX;
}

/** The model shifted by `dx` columns (same id and name). */
export function shiftModel(m: Model, dx: number): Model {
  return { ...m, cells: m.cells.map((c) => ({ ...c, x: c.x + dx })) };
}

/** A model cell is done when a brick of the same colour covers it; extra bricks are fine. */
export function modelProgress(board: Board, m: Model): { done: number; total: number; complete: boolean } {
  let done = 0;
  for (const c of m.cells) {
    const b = brickAt(board, c.x, c.y);
    if (b && b.color === c.color) done++;
  }
  const total = m.cells.length;
  return { done, total, complete: total > 0 && done === total };
}

export interface Suggestion {
  x: number;
  w: number;
  h: number;
  color: string;
}

/**
 * The next brick that would help: for the lowest missing cell that gravity can
 * still reach, the largest template that lands on it while covering only cells
 * of that colour. Used for the idle hint. `null` once the model is complete or
 * nothing fits (a wrong-colour brick sits on every missing cell).
 */
export function nextBrick(board: Board, m: Model): Suggestion | null {
  const missing = m.cells
    .filter((c) => brickAt(board, c.x, c.y)?.color !== c.color)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const sizes = [...BRICK_SIZES].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const target of missing) {
    const wanted = new Set(m.cells.filter((c) => c.color === target.color).map((c) => `${c.x},${c.y}`));
    for (const { w, h } of sizes) {
      for (let x = target.x - w + 1; x <= target.x; x++) {
        const y = dropY(board, x, w, h);
        if (y === null || y > target.y || y + h <= target.y) continue;
        const covered = cells({ id: 0, x, y, w, h, color: target.color });
        if (covered.every((c) => wanted.has(`${c.x},${c.y}`))) return { x, w, h, color: target.color };
      }
    }
  }
  return null;
}
