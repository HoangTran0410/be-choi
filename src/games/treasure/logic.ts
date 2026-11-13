import { mulberry32 } from '../../core/dom';
import { loadVersioned, saveVersioned } from '../../core/save';

export type Dir = 'up' | 'down' | 'left' | 'right';
/** `again` = do the move before it two more times (🔁×2). */
export type Tile = Dir | 'again';
export interface Cell {
  r: number;
  c: number;
}

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
export const DELTA: Record<Dir, Cell> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};
/** What the teacher says on each step (trái / phải are the point). */
export const SAY: Record<Tile, string> = {
  up: 'lên',
  down: 'xuống',
  left: 'sang trái',
  right: 'sang phải',
  again: 'lặp lại hai lần',
};
export const ARROW: Record<Tile, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️', again: '🔁' };
export const MAX_SLOTS = 8;

export interface Level {
  k: number;
  size: number;
  start: Cell;
  chest: Cell;
  rocks: Cell[];
  stars: Cell[];
  tiles: Tile[];
  maxSteps: number;
  solution: Tile[];
}

const same = (a: Cell, b: Cell): boolean => a.r === b.r && a.c === b.c;
const has = (list: readonly Cell[], c: Cell): boolean => list.some((x) => same(x, c));
const inside = (size: number, c: Cell): boolean => c.r >= 0 && c.c >= 0 && c.r < size && c.c < size;

export type MoveKind = 'move' | 'wall' | 'rock';
export interface Move {
  /** Index of the tray tile that caused it. */
  tile: number;
  from: Cell;
  to: Cell;
  kind: MoveKind;
  dir: Dir;
  /** Index into level.stars picked up by arriving here. */
  star?: number;
}
export interface Run {
  moves: Move[];
  outcome: 'win' | 'bump' | 'short';
  at: Cell;
}

type World = Pick<Level, 'size' | 'chest' | 'rocks' | 'stars'>;

function stepOnce(w: World, from: Cell, dir: Dir): { to: Cell; kind: MoveKind } {
  const to = { r: from.r + DELTA[dir].r, c: from.c + DELTA[dir].c };
  if (!inside(w.size, to)) return { to, kind: 'wall' };
  if (has(w.rocks, to)) return { to, kind: 'rock' };
  return { to, kind: 'move' };
}

/** Run a program. Stops at once on a bump or on reaching the chest with every star. Never "loses". */
export function simulate(level: World & { start: Cell }, program: readonly Tile[]): Run {
  const moves: Move[] = [];
  const got = new Set<number>();
  let at = level.start;
  let last: Dir | null = null;
  for (let i = 0; i < program.length; i++) {
    const t = program[i]!;
    let dirs: Dir[];
    if (t === 'again') dirs = last ? [last, last] : [];
    else {
      dirs = [t];
      last = t;
    }
    for (const dir of dirs) {
      const { to, kind } = stepOnce(level, at, dir);
      if (kind !== 'move') {
        moves.push({ tile: i, from: at, to, kind, dir });
        return { moves, outcome: 'bump', at };
      }
      const mv: Move = { tile: i, from: at, to, kind, dir };
      const si = level.stars.findIndex((s) => same(s, to));
      if (si >= 0 && !got.has(si)) {
        got.add(si);
        mv.star = si;
      }
      moves.push(mv);
      at = to;
      if (same(at, level.chest) && got.size === level.stars.length) return { moves, outcome: 'win', at };
    }
  }
  return { moves, outcome: 'short', at };
}

/**
 * Shortest program (BFS over position, stars taken, last move) using only `tiles`,
 * or null if none within `maxDepth` tiles.
 */
export function solve(level: World & { start: Cell; tiles: readonly Tile[] }, maxDepth = MAX_SLOTS): Tile[] | null {
  interface Node {
    at: Cell;
    mask: number;
    last: Dir | null;
    prog: Tile[];
  }
  const all = (1 << level.stars.length) - 1;
  const key = (n: Node) => `${n.at.r},${n.at.c},${n.mask},${n.last ?? ''}`;
  let frontier: Node[] = [{ at: level.start, mask: 0, last: null, prog: [] }];
  const seen = new Set(frontier.map(key));
  if (all === 0 && same(level.start, level.chest)) return [];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: Node[] = [];
    for (const n of frontier) {
      for (const t of level.tiles) {
        let dirs: Dir[];
        let last = n.last;
        if (t === 'again') {
          if (!n.last) continue;
          dirs = [n.last, n.last];
        } else {
          dirs = [t];
          last = t;
        }
        let at = n.at;
        let mask = n.mask;
        let ok = true;
        let won = false;
        for (const d of dirs) {
          const s = stepOnce(level, at, d);
          if (s.kind !== 'move') {
            ok = false;
            break;
          }
          at = s.to;
          const si = level.stars.findIndex((q) => same(q, at));
          if (si >= 0) mask |= 1 << si;
          if (same(at, level.chest) && mask === all) {
            won = true;
            break;
          }
        }
        if (!ok) continue;
        const prog = [...n.prog, t];
        if (won) return prog;
        const m: Node = { at, mask, last, prog };
        const k = key(m);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(m);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return null;
}

// ---- level generator ---------------------------------------------------------------------------
export type Kind = 'straight' | 'turn' | 'rocks' | 'stars' | 'repeat';

export function kindFor(k: number, rng: () => number): Kind {
  if (k < 2) return 'straight';
  if (k < 4) return 'turn';
  if (k < 6) return 'rocks';
  if (k < 8) return 'stars';
  if (k === 8) return 'repeat';
  return (['rocks', 'stars', 'repeat'] as const)[Math.floor(rng() * 3)]!;
}

export function sizeFor(k: number): number {
  return k < 4 ? 3 : k < 9 ? 4 : 5;
}

const pick = <T>(rng: () => number, a: readonly T[]): T => a[Math.floor(rng() * a.length)]!;
const rcell = (rng: () => number, size: number): Cell => ({ r: Math.floor(rng() * size), c: Math.floor(rng() * size) });
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

function candidate(k: number, kind: Kind, size: number, rng: () => number): Level | null {
  const start = rcell(rng, size);
  let chest = rcell(rng, size);
  const rocks: Cell[] = [];
  const stars: Cell[] = [];
  let tiles: Tile[] = [...DIRS];
  if (kind === 'straight') {
    const dist = k === 0 ? 1 : 2;
    const dir = pick(rng, DIRS);
    chest = { r: start.r + DELTA[dir].r * dist, c: start.c + DELTA[dir].c * dist };
    if (!inside(size, chest)) return null;
    // Few tiles on the first levels: the right one and one other.
    tiles = [dir, pick(rng, DIRS.filter((d) => d !== dir))];
    tiles.sort((a, b) => DIRS.indexOf(a as Dir) - DIRS.indexOf(b as Dir));
  } else if (kind === 'turn') {
    if (start.r === chest.r || start.c === chest.c) return null;
    const d = manhattan(start, chest);
    if (d < 2 || d > 4) return null;
  } else {
    if (manhattan(start, chest) < 2) return null;
    const free = (c: Cell) => !same(c, start) && !same(c, chest) && !has(rocks, c) && !has(stars, c);
    const nRocks = kind === 'rocks' ? (k < 5 ? 1 : 2) : kind === 'stars' ? (k < 7 ? 0 : 1) : 1;
    const nStars = kind === 'stars' ? (k < 7 ? 1 : 2) : 0;
    for (let i = 0; i < nRocks; i++) {
      const c = rcell(rng, size);
      if (!free(c)) return null;
      rocks.push(c);
    }
    for (let i = 0; i < nStars; i++) {
      const c = rcell(rng, size);
      if (!free(c)) return null;
      stars.push(c);
    }
    if (kind === 'repeat') tiles = [...DIRS, 'again'];
  }
  const world = { size, start, chest, rocks, stars, tiles };
  const sol = solve(world);
  if (!sol) return null;
  let maxSteps = Math.min(MAX_SLOTS, sol.length + (kind === 'straight' ? 2 : 1));
  if (kind === 'rocks' && sol.length <= manhattan(start, chest)) return null;
  if (kind === 'stars' && sol.length <= manhattan(start, chest)) return null;
  if (kind === 'repeat') {
    const plain = solve({ ...world, tiles: DIRS }, sol.length);
    if (plain || !sol.includes('again')) return null;
    maxSteps = sol.length;
  }
  if (sol.length > MAX_SLOTS) return null;
  return { k, size, start, chest, rocks, stars, tiles, maxSteps, solution: sol };
}

/** Level `k` (0-based), always solvable, the same every time for the same `k`. */
export function generateLevel(k: number): Level {
  const rng = mulberry32(k * 7919 + 13);
  const kind = kindFor(k, rng);
  const size = sizeFor(k);
  for (let i = 0; i < 400; i++) {
    const lv = candidate(k, kind, size, rng);
    if (lv) return lv;
  }
  // A solved-by-hand fallback so the game can never get stuck.
  const world = { size, start: { r: size - 1, c: 0 }, chest: { r: size - 1, c: 1 }, rocks: [], stars: [], tiles: [...DIRS] as Tile[] };
  return { k, ...world, maxSteps: 3, solution: ['right'] };
}

/** Which tray slots still follow the shortest program: the next tile to point at (null when off track). */
export function nextHint(level: Level, tray: readonly Tile[]): Tile | null {
  for (let i = 0; i < tray.length; i++) if (tray[i] !== level.solution[i]) return null;
  return level.solution[tray.length] ?? null;
}

// ---- save --------------------------------------------------------------------------------------
export const SAVE_KEY = 'be-choi:treasure';
export interface TreasureSave {
  v: 1;
  /** Next level to play (0-based). */
  level: number;
}

export function loadSave(): TreasureSave {
  return (
    loadVersioned<TreasureSave>(SAVE_KEY, {
      current: 1,
      validate: (d) => (typeof d.level === 'number' && Number.isInteger(d.level) && d.level >= 0 ? { v: 1, level: Math.min(d.level, 10_000) } : null),
    }) ?? { v: 1, level: 0 }
  );
}

export function persist(s: TreasureSave): void {
  saveVersioned(SAVE_KEY, s, { current: 1 });
}
