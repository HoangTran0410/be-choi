import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import {
  BRICK_COLORS,
  BRICK_SIZES,
  MODELS,
  SMALL_MODEL_CELLS,
  brickAt,
  canPlace,
  cells,
  centerOffset,
  colorName,
  deserialize,
  dropY,
  emptyBoard,
  modelBounds,
  modelFor,
  modelProgress,
  nextBrick,
  place,
  refitBoard,
  removeBrick,
  serialize,
  shiftModel,
  type Board,
} from './logic';

const RED = BRICK_COLORS[0] as string;
const BLUE = BRICK_COLORS[4] as string;

/** Drop a brick with gravity onto `board` (throws when it does not fit). */
function drop(board: Board, x: number, w: number, h: number, color = RED): Board {
  const y = dropY(board, x, w, h);
  if (y === null) throw new Error(`drop: ${w}×${h} does not fit at column ${x}`);
  return place(board, { x, y, w, h, color });
}

describe('bricks logic', () => {
  it('has the five template sizes and six colours with Vietnamese names', () => {
    expect(BRICK_SIZES).toEqual([
      { w: 1, h: 1 },
      { w: 2, h: 1 },
      { w: 3, h: 1 },
      { w: 4, h: 1 },
      { w: 2, h: 2 },
    ]);
    expect(BRICK_COLORS.length).toBe(6);
    expect(new Set(BRICK_COLORS).size).toBe(6);
    for (const c of BRICK_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colorName(c).startsWith('màu ')).toBe(true);
    }
    expect(colorName('#000000')).toBe('màu');
  });

  it('builds an empty 10×8 board by default and lists a brick’s cells', () => {
    expect(emptyBoard()).toEqual({ cols: 10, rows: 8, bricks: [] });
    expect(emptyBoard(8, 10)).toEqual({ cols: 8, rows: 10, bricks: [] });
    expect(cells({ id: 1, x: 2, y: 3, w: 2, h: 2, color: RED })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
    ]);
  });

  it('canPlace respects the grid bounds and existing bricks', () => {
    const empty = emptyBoard();
    expect(canPlace(empty, 0, 0, 1, 1)).toBe(true);
    expect(canPlace(empty, 9, 7, 1, 1)).toBe(true);
    expect(canPlace(empty, 6, 0, 4, 1)).toBe(true);
    expect(canPlace(empty, 7, 0, 4, 1)).toBe(false);
    expect(canPlace(empty, -1, 0, 1, 1)).toBe(false);
    expect(canPlace(empty, 0, -1, 1, 1)).toBe(false);
    expect(canPlace(empty, 0, 7, 2, 2)).toBe(false);
    expect(canPlace(empty, 0.5, 0, 1, 1)).toBe(false);

    const board = place(empty, { x: 2, y: 0, w: 2, h: 2, color: RED });
    expect(canPlace(board, 2, 0, 1, 1)).toBe(false);
    expect(canPlace(board, 3, 1, 1, 1)).toBe(false);
    expect(canPlace(board, 1, 0, 2, 1)).toBe(false);
    expect(canPlace(board, 0, 0, 2, 1)).toBe(true);
    expect(canPlace(board, 4, 0, 1, 1)).toBe(true);
    expect(canPlace(board, 2, 2, 2, 1)).toBe(true);
    // The brick itself is ignored when it is being moved.
    const id = board.bricks[0]?.id as number;
    expect(canPlace(board, 2, 0, 2, 2, id)).toBe(true);
    expect(canPlace(board, 3, 1, 1, 1, id)).toBe(true);
  });

  it('dropY lands on the ground, stacks, bridges only when supported, and is null when full', () => {
    let board = emptyBoard();
    expect(dropY(board, 0, 1, 1)).toBe(0);
    expect(dropY(board, 6, 4, 1)).toBe(0);
    expect(dropY(board, 7, 4, 1)).toBeNull();
    expect(dropY(board, -1, 1, 1)).toBeNull();

    board = drop(board, 0, 1, 1);
    expect(dropY(board, 0, 1, 1)).toBe(1);
    expect(dropY(board, 0, 2, 2)).toBe(1);
    expect(dropY(board, 1, 1, 1)).toBe(0);

    // A 4×1 across a gap: rests on the two 1×1 bricks at columns 0 and 3.
    board = drop(board, 3, 1, 1);
    expect(dropY(board, 0, 4, 1)).toBe(1);
    // A 2×1 in the gap between them falls to the ground.
    expect(dropY(board, 1, 2, 1)).toBe(0);
    // A floating brick (placed directly) does not catch what falls beside it.
    const floating = place(emptyBoard(), { x: 5, y: 3, w: 1, h: 1, color: RED });
    expect(dropY(floating, 4, 1, 1)).toBe(0);
    expect(dropY(floating, 5, 1, 1)).toBe(0);
    expect(dropY(floating, 5, 2, 1)).toBe(0);
    // ...but a brick over it rests on it once the lower rows are blocked.
    const tower = drop(drop(drop(emptyBoard(), 5, 1, 1), 5, 1, 1), 5, 1, 1);
    expect(dropY(tower, 5, 1, 1)).toBe(3);
    expect(dropY(tower, 4, 2, 1)).toBe(3);
    expect(dropY(tower, 4, 1, 1)).toBe(0);

    let full = emptyBoard();
    for (let i = 0; i < 8; i++) full = drop(full, 2, 1, 1);
    expect(full.bricks.length).toBe(8);
    expect(dropY(full, 2, 1, 1)).toBeNull();
    expect(dropY(full, 2, 2, 1)).toBeNull();
    expect(dropY(full, 1, 2, 1)).toBeNull();
    expect(dropY(full, 3, 1, 1)).toBe(0);
    // Moving the top brick of the full column: its own cells do not block it.
    const top = full.bricks[7] as { id: number };
    expect(dropY(full, 2, 1, 1, top.id)).toBe(7);
    let tall = emptyBoard();
    for (let i = 0; i < 7; i++) tall = drop(tall, 0, 1, 1);
    expect(dropY(tall, 0, 2, 2)).toBeNull();
  });

  it('place assigns fresh ids and never mutates; removeBrick drops by id', () => {
    const a = emptyBoard();
    const b = place(a, { x: 0, y: 0, w: 1, h: 1, color: RED });
    const c = place(b, { x: 1, y: 0, w: 2, h: 1, color: BLUE });
    expect(a.bricks.length).toBe(0);
    expect(b.bricks.length).toBe(1);
    expect(c.bricks.map((k) => k.id)).toEqual([1, 2]);
    const d = removeBrick(c, 1);
    expect(d.bricks.map((k) => k.id)).toEqual([2]);
    expect(c.bricks.length).toBe(2);
    // Ids keep growing past removed ones so no two live bricks ever share one.
    const e = place(d, { x: 5, y: 0, w: 1, h: 1, color: RED });
    expect(e.bricks.map((k) => k.id)).toEqual([2, 3]);
    expect(removeBrick(e, 99)).toEqual(e);
    expect(brickAt(e, 1, 0)?.id).toBe(2);
    expect(brickAt(e, 2, 0)?.id).toBe(2);
    expect(brickAt(e, 3, 0)).toBeUndefined();
    expect(brickAt(e, 1, 0, 2)).toBeUndefined();
  });

  it('serialize/deserialize round-trip, garbage and invalid boards give null', () => {
    let board = emptyBoard(8, 10);
    board = drop(board, 0, 2, 1);
    board = drop(board, 0, 2, 2, BLUE);
    board = drop(board, 5, 1, 1);
    const json = serialize(board);
    expect(typeof json).toBe('string');
    expect(deserialize(json)).toEqual(board);
    expect(deserialize(serialize(emptyBoard()))).toEqual(emptyBoard());

    for (const bad of [
      '',
      'null',
      '[]',
      '42',
      '{',
      '{"cols":10}',
      '{"cols":10,"rows":8}',
      '{"cols":0,"rows":8,"bricks":[]}',
      '{"cols":10,"rows":8,"bricks":{}}',
      '{"cols":10,"rows":8,"bricks":[null]}',
      '{"cols":10,"rows":8,"bricks":[{"id":1,"x":9,"y":0,"w":2,"h":1,"color":"#ef4444"}]}',
      '{"cols":10,"rows":8,"bricks":[{"id":1,"x":0,"y":0,"w":1,"h":1,"color":"red"}]}',
      '{"cols":10,"rows":8,"bricks":[{"id":1,"x":0.5,"y":0,"w":1,"h":1,"color":"#ef4444"}]}',
      '{"cols":10,"rows":8,"bricks":[{"id":1,"x":0,"y":0,"w":1,"h":1,"color":"#ef4444"},{"id":1,"x":3,"y":0,"w":1,"h":1,"color":"#ef4444"}]}',
      '{"cols":10,"rows":8,"bricks":[{"id":1,"x":0,"y":0,"w":2,"h":1,"color":"#ef4444"},{"id":2,"x":1,"y":0,"w":1,"h":1,"color":"#ef4444"}]}',
    ]) {
      expect(deserialize(bad), bad).toBeNull();
    }
  });

  it('refitBoard keeps what fits on the new plate, shifted and re-dropped bottom-up', () => {
    let board = emptyBoard(10, 8);
    board = drop(board, 0, 4, 1);
    board = drop(board, 0, 2, 2, BLUE);
    board = drop(board, 8, 2, 1);
    board = drop(board, 6, 4, 1);
    const fitted = refitBoard(board, 8, 10);
    expect(fitted.cols).toBe(8);
    expect(fitted.rows).toBe(10);
    // The 2×1 at column 8 and the 4×1 at column 6 fall off the narrower plate.
    expect(fitted.bricks.map((b) => [b.x, b.y, b.w, b.h])).toEqual([
      [0, 0, 4, 1],
      [0, 1, 2, 2],
    ]);
    const shifted = refitBoard(board, 10, 8, 1);
    // Shifted one column right the two on the right edge no longer fit.
    expect(shifted.bricks.map((b) => [b.x, b.y, b.w, b.h])).toEqual([
      [1, 0, 4, 1],
      [1, 1, 2, 2],
    ]);
    // A floating brick lands on the ground when refitted.
    const floating = place(emptyBoard(), { x: 3, y: 5, w: 1, h: 1, color: RED });
    expect(refitBoard(floating, 10, 8).bricks[0]?.y).toBe(0);
  });

  it('has ≥ 10 models with unique ids, Vietnamese names and buildable cells in the grid', () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(new Set(MODELS.map((m) => m.name)).size).toBe(MODELS.length);
    const named = [
      'tháp cao',
      'ngôi nhà',
      'cầu thang',
      'ô tô',
      'rô-bốt',
      'cái cây',
      'cây cầu',
      'lâu đài',
      'tàu hoả',
      'con vịt',
      'bông hoa',
      'chiếc thuyền',
    ];
    for (const n of named)
      expect(
        MODELS.some((m) => m.name === n),
        n,
      ).toBe(true);
    for (const m of MODELS) {
      expect(m.name).toMatch(/^[a-zà-ỹ\- ]+$/i);
      expect(m.cells.length).toBeGreaterThanOrEqual(6);
      expect(m.cells.length).toBeLessThanOrEqual(18);
      expect(new Set(m.cells.map((c) => c.color)).size).toBeLessThanOrEqual(4);
      const keys = new Set<string>();
      for (const c of m.cells) {
        expect(Number.isInteger(c.x) && c.x >= 0 && c.x < 10, `${m.id} x`).toBe(true);
        expect(Number.isInteger(c.y) && c.y >= 0 && c.y < 8, `${m.id} y`).toBe(true);
        expect(BRICK_COLORS.includes(c.color), `${m.id} colour`).toBe(true);
        keys.add(`${c.x},${c.y}`);
        // Bottom-up: on the ground or on another model cell.
        expect(c.y === 0 || m.cells.some((o) => o.x === c.x && o.y === c.y - 1), `${m.id} (${c.x},${c.y}) floats`).toBe(true);
      }
      expect(keys.size).toBe(m.cells.length);
      // Fits both the 10×8 landscape and the 8×10 portrait plate.
      const { width, height } = modelBounds(m);
      expect(width).toBeLessThanOrEqual(8);
      expect(height).toBeLessThanOrEqual(8);
    }
    expect(MODELS.filter((m) => m.cells.length <= SMALL_MODEL_CELLS).length).toBeGreaterThanOrEqual(4);
  });

  it('modelFor keeps the first two rounds small and never repeats the excluded model', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed);
      const a = modelFor(0, rng);
      expect(a.cells.length).toBeLessThanOrEqual(SMALL_MODEL_CELLS);
      expect(modelFor(1, rng).cells.length).toBeLessThanOrEqual(SMALL_MODEL_CELLS);
      expect(modelFor(0, rng, a.id).id).not.toBe(a.id);
      expect(modelFor(5, rng, 'house').id).not.toBe('house');
    }
    const seen = new Set<string>();
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) seen.add(modelFor(3, rng).id);
    expect(seen.size).toBe(MODELS.length);
    expect(modelFor(2, () => 0.999).id).toBe(MODELS[MODELS.length - 1]?.id);
  });

  it('centres a model on a plate and tracks progress by colour', () => {
    const house = MODELS.find((m) => m.id === 'house')!;
    expect(modelBounds(house)).toEqual({ minX: 0, width: 5, height: 4 });
    expect(centerOffset(house, 10)).toBe(2);
    expect(centerOffset(house, 8)).toBe(1);
    const target = shiftModel(house, centerOffset(house, 10));
    expect(target.id).toBe('house');
    expect(Math.min(...target.cells.map((c) => c.x))).toBe(2);
    expect(shiftModel(target, -2).cells).toEqual(house.cells);

    let board = emptyBoard();
    expect(modelProgress(board, target)).toEqual({ done: 0, total: house.cells.length, complete: false });
    const ordered = [...target.cells].sort((a, b) => a.y - b.y || a.x - b.x);
    // Wrong colour on the first cell: not counted.
    const first = ordered[0]!;
    board = drop(board, first.x, 1, 1, first.color === RED ? BLUE : RED);
    expect(modelProgress(board, target).done).toBe(0);
    board = emptyBoard();
    for (const c of ordered) board = drop(board, c.x, 1, 1, c.color);
    expect(modelProgress(board, target)).toEqual({ done: house.cells.length, total: house.cells.length, complete: true });
    // Extra bricks are allowed.
    board = drop(board, 0, 1, 1, BLUE);
    expect(modelProgress(board, target).complete).toBe(true);
    // Removing one cell's brick breaks it again.
    const last = ordered[ordered.length - 1]!;
    const id = brickAt(board, last.x, last.y)!.id;
    expect(modelProgress(removeBrick(board, id), target)).toEqual({
      done: house.cells.length - 1,
      total: house.cells.length,
      complete: false,
    });
  });

  it('nextBrick suggests the biggest template that only covers the wanted colour', () => {
    const tower = MODELS.find((m) => m.id === 'tower')!; // RR / YY / BB / GG, bottom row green
    let board = emptyBoard();
    const s1 = nextBrick(board, tower)!;
    expect(s1).toEqual({ x: 0, w: 2, h: 1, color: BRICK_COLORS[3] });
    board = place(board, { x: 0, y: 0, w: 2, h: 1, color: s1.color });
    const s2 = nextBrick(board, tower)!;
    expect(s2).toEqual({ x: 0, w: 2, h: 1, color: BLUE });
    // A 1×1 of the wrong colour in the way: the missing cell is still the target, nothing fits under it.
    const blocked = place(emptyBoard(), { x: 0, y: 0, w: 1, h: 1, color: RED });
    expect(nextBrick(blocked, tower)).toEqual({ x: 1, w: 1, h: 1, color: BRICK_COLORS[3] });
    // Complete model: nothing to suggest.
    let done = emptyBoard();
    for (const c of [...tower.cells].sort((a, b) => a.y - b.y)) done = drop(done, c.x, 1, 1, c.color);
    expect(nextBrick(done, tower)).toBeNull();
  });
});
