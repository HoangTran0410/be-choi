import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cutDiag,
  cutGrid,
  cutKnobs,
  cutPie,
  cutStrips,
  cutWavy,
  EMOJI_SCALE,
  levelFor,
  makeCut,
  makeJigsawRound,
  PICTURE_BGS,
  PICTURES,
  polygonArea,
  renderPhotoPicture,
  renderPicture,
  scalePath,
  trayPieceWidth,
  type Cut,
  type CutPiece,
  type Level,
} from './logic';
import { mulberry32 } from '../../core/dom';

type Pt = [number, number];

/**
 * Flatten an absolute M/L/C/Z path into a polygon: lines keep their end points,
 * every cubic is sampled at `n` points. Only the commands the cuts emit.
 */
function flatten(path: string, n = 32): Pt[] {
  const tokens = path.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: Pt[] = [];
  let i = 0;
  const num = (): number => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i] as string)) out.push([num(), num()]);
    } else if (cmd === 'C') {
      while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i] as string)) {
        const from = out[out.length - 1] as Pt;
        const c1: Pt = [num(), num()];
        const c2: Pt = [num(), num()];
        const to: Pt = [num(), num()];
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const u = 1 - t;
          out.push([
            u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
            u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
          ]);
        }
      }
    } else if (cmd !== 'Z') {
      throw new Error(`unexpected command ${cmd}`);
    }
  }
  return out;
}

/** Invariants every cut must satisfy. */
function checkCut(cut: Cut, count: number): void {
  expect(cut.pieces.length).toBe(count);
  expect(cut.pieces.map((p) => p.id)).toEqual([...Array(count).keys()]);
  expect(cut.lines.startsWith('M')).toBe(true);
  for (const p of cut.pieces) {
    expect(p.path.startsWith('M')).toBe(true);
    expect(p.path.endsWith('Z')).toBe(true);
    expect(p.path.match(/M/g)?.length).toBe(1);
    const { x, y, w, h } = p.bbox;
    expect(x).toBeGreaterThanOrEqual(-1e-6);
    expect(y).toBeGreaterThanOrEqual(-1e-6);
    expect(x + w).toBeLessThanOrEqual(1 + 1e-6);
    expect(y + h).toBeLessThanOrEqual(1 + 1e-6);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    // The bbox is exact: it contains the flattened outline and is tight (sampling gets within 2e-3).
    const pts = flatten(p.path, 64);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(x - 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(y - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(x + w + 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(y + h + 1e-6);
    expect(Math.min(...xs)).toBeCloseTo(x, 2);
    expect(Math.min(...ys)).toBeCloseTo(y, 2);
    expect(Math.max(...xs)).toBeCloseTo(x + w, 2);
    expect(Math.max(...ys)).toBeCloseTo(y + h, 2);
    expect(p.cx).toBeGreaterThan(x);
    expect(p.cx).toBeLessThan(x + w);
    expect(p.cy).toBeGreaterThan(y);
    expect(p.cy).toBeLessThan(y + h);
  }
  // The pieces tile the square: shared edges cancel, so the flattened areas add up to exactly 1.
  const total = cut.pieces.reduce((s, p) => s + polygonArea(flatten(p.path)), 0);
  expect(Math.abs(total - 1)).toBeLessThan(1e-6);
}

/** Straight-line cuts only: polygons straight from the path. */
function polygon(p: CutPiece): Pt[] {
  expect(p.path.includes('C')).toBe(false);
  return flatten(p.path);
}

function unionCoversSquare(cut: Cut): void {
  expect(Math.min(...cut.pieces.map((p) => p.bbox.x))).toBeCloseTo(0, 9);
  expect(Math.min(...cut.pieces.map((p) => p.bbox.y))).toBeCloseTo(0, 9);
  expect(Math.max(...cut.pieces.map((p) => p.bbox.x + p.bbox.w))).toBeCloseTo(1, 9);
  expect(Math.max(...cut.pieces.map((p) => p.bbox.y + p.bbox.h))).toBeCloseTo(1, 9);
}

/** Enough of a 2d context for `renderPicture`: every call is a spy. */
function fake2d() {
  const gradient = { addColorStop: vi.fn() };
  return {
    gradient,
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    createRadialGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
  };
}

/** A stand-in `Image` (jsdom never loads one) that fires `load` or `error` on the next microtask. */
function fakeImage(ok: boolean, w = 40, h = 30) {
  return class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = w;
    height = h;
    set src(_url: string) {
      queueMicrotask(() => (ok ? this.onload : this.onerror)?.());
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('jigsaw polygonArea', () => {
  it('is the shoelace area, orientation-independent', () => {
    expect(
      polygonArea([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBe(1);
    expect(
      polygonArea([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ]),
    ).toBe(1);
    expect(
      polygonArea([
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
    ).toBeCloseTo(0.5, 12);
    expect(polygonArea([])).toBe(0);
  });
});

describe('jigsaw cutGrid / cutStrips', () => {
  it('cuts cols×rows rectangles in reading order with exact bboxes and centres', () => {
    for (const [cols, rows] of [
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
    ] as const) {
      const cut = cutGrid(cols, rows);
      expect(cut.style).toBe('grid');
      checkCut(cut, cols * rows);
      cut.pieces.forEach((p, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        expect(p.bbox.x).toBeCloseTo(c / cols, 9);
        expect(p.bbox.y).toBeCloseTo(r / rows, 9);
        expect(p.bbox.w).toBeCloseTo(1 / cols, 9);
        expect(p.bbox.h).toBeCloseTo(1 / rows, 9);
        expect(p.cx).toBeCloseTo((c + 0.5) / cols, 9);
        expect(p.cy).toBeCloseTo((r + 0.5) / rows, 9);
        expect(polygonArea(polygon(p))).toBeCloseTo(1 / (cols * rows), 5);
      });
      // One guide line per internal edge.
      expect(cut.lines.match(/M/g)?.length).toBe((rows - 1) * cols + (cols - 1) * rows);
    }
    expect(cutGrid(2, 2).pieces[0]?.path).toBe('M0 0L0.5 0L0.5 0.5L0 0.5Z');
    expect(cutGrid(2, 2).lines).toBe('M0 0.5L0.5 0.5M0.5 0.5L1 0.5M0.5 0L0.5 0.5M0.5 0.5L0.5 1');
  });

  it('strips: n bars, columns when vertical, rows otherwise', () => {
    const v = cutStrips(3, true);
    expect(v.style).toBe('strips');
    checkCut(v, 3);
    for (const p of v.pieces) {
      expect(p.bbox.w).toBeCloseTo(1 / 3, 9);
      expect(p.bbox.h).toBeCloseTo(1, 9);
    }
    const hz = cutStrips(4, false);
    expect(hz.style).toBe('strips');
    checkCut(hz, 4);
    hz.pieces.forEach((p, i) => {
      expect(p.bbox.w).toBeCloseTo(1, 9);
      expect(p.bbox.y).toBeCloseTo(i / 4, 9);
      expect(p.bbox.h).toBeCloseTo(0.25, 9);
    });
  });
});

describe('jigsaw cutDiag', () => {
  it('4 triangles from the two diagonals, 8 with the + as well', () => {
    const four = cutDiag(false);
    expect(four.style).toBe('diag');
    checkCut(four, 4);
    for (const p of four.pieces) expect(polygonArea(polygon(p))).toBeCloseTo(0.25, 9);
    // Top triangle: (0,0) (1,0) and the centre; its centroid is a third of the way down.
    expect(four.pieces[0]?.path).toBe('M0.5 0.5L0 0L1 0Z');
    expect(four.pieces[0]?.bbox).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
    expect(four.pieces[0]?.cx).toBeCloseTo(0.5, 9);
    expect(four.pieces[0]?.cy).toBeCloseTo(1 / 6, 9);
    expect(four.pieces[1]?.bbox).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(four.lines).toBe('M0.5 0.5L0 0M0.5 0.5L1 0M0.5 0.5L1 1M0.5 0.5L0 1');

    const eight = cutDiag(true);
    checkCut(eight, 8);
    for (const p of eight.pieces) {
      expect(polygonArea(polygon(p))).toBeCloseTo(0.125, 9);
      expect(polygon(p).length).toBe(3);
      expect(p.bbox.w).toBeCloseTo(0.5, 9);
      expect(p.bbox.h).toBeCloseTo(0.5, 9);
    }
    expect(eight.lines.match(/M/g)?.length).toBe(8);
  });
});

describe('jigsaw cutPie', () => {
  it('n wedges from the centre whose polygons walk the border corners and tile the square', () => {
    for (const n of [4, 5, 6, 8]) {
      const cut = cutPie(n);
      expect(cut.style).toBe('pie');
      checkCut(cut, n);
      // Every wedge starts at the centre and has the same angle: equal areas only for a circle, but
      // each one is a triangle or a quad (one corner at most between two boundary points at n ≥ 4).
      for (const p of cut.pieces) {
        const poly = polygon(p);
        expect(poly[0]).toEqual([0.5, 0.5]);
        expect(poly.length === 3 || poly.length === 4).toBe(true);
        expect(polygonArea(poly)).toBeGreaterThan(0.05);
      }
      expect(cut.lines.match(/M/g)?.length).toBe(n);
    }
    // Half a wedge off the axes: pie 8 is not diag 8, and quads hold the corners.
    const pie8 = cutPie(8);
    expect(pie8.pieces.filter((p) => polygon(p).length === 4).length).toBe(4);
    const corners = pie8.pieces.flatMap((p) => polygon(p).filter(([x, y]) => (x === 0 || x === 1) && (y === 0 || y === 1)));
    expect(corners.length).toBe(4);
  });

  it('rng nudges the start angle a little and is deterministic per seed', () => {
    const plain = cutPie(6);
    const a = cutPie(6, mulberry32(3));
    const b = cutPie(6, mulberry32(3));
    expect(a).toEqual(b);
    expect(a.lines).not.toBe(plain.lines);
    checkCut(a, 6);
    // Boundary points stay within half a wedge of their default position.
    const first = polygon(a.pieces[0] as CutPiece)[1] as Pt;
    const base = polygon(plain.pieces[0] as CutPiece)[1] as Pt;
    expect(Math.hypot(first[0] - base[0], first[1] - base[1])).toBeLessThan(0.3);
  });
});

describe('jigsaw cutKnobs / cutWavy', () => {
  const grids = [
    [2, 2],
    [3, 2],
    [3, 3],
    [4, 3],
  ] as const;

  it('knobs: one piece per cell, curved shared edges that tile the square, bboxes around the cells', () => {
    for (const [cols, rows] of grids) {
      const cut = cutKnobs(cols, rows, mulberry32(cols * 10 + rows));
      expect(cut.style).toBe('knobs');
      checkCut(cut, cols * rows);
      unionCoversSquare(cut);
      cut.pieces.forEach((p, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        // Contains its cell, sticks out by at most the tab depth (0.18 of the smaller cell side).
        const depth = 0.18 * Math.min(1 / cols, 1 / rows) + 1e-6;
        expect(p.bbox.x).toBeLessThanOrEqual(c / cols + 1e-9);
        expect(p.bbox.x).toBeGreaterThanOrEqual(c / cols - depth);
        expect(p.bbox.y).toBeLessThanOrEqual(r / rows + 1e-9);
        expect(p.bbox.y).toBeGreaterThanOrEqual(r / rows - depth);
        expect(p.bbox.x + p.bbox.w).toBeGreaterThanOrEqual((c + 1) / cols - 1e-9);
        expect(p.bbox.x + p.bbox.w).toBeLessThanOrEqual((c + 1) / cols + depth);
        expect(p.bbox.y + p.bbox.h).toBeGreaterThanOrEqual((r + 1) / rows - 1e-9);
        expect(p.bbox.y + p.bbox.h).toBeLessThanOrEqual((r + 1) / rows + depth);
        expect(p.cx).toBeCloseTo((c + 0.5) / cols, 9);
        expect(p.cy).toBeCloseTo((r + 0.5) / rows, 9);
        expect(p.path.includes('C')).toBe(true);
      });
      // Every internal edge carries a tab (4 cubics) and appears in the guide lines.
      expect(cut.lines.match(/M/g)?.length).toBe((rows - 1) * cols + (cols - 1) * rows);
      expect(cut.lines.match(/C/g)?.length).toBe(4 * ((rows - 1) * cols + (cols - 1) * rows));
    }
  });

  it('knobs: a tab sticks out of exactly one of the two neighbours', () => {
    const cut = cutKnobs(2, 1, mulberry32(1));
    const [left, right] = cut.pieces as [CutPiece, CutPiece];
    const leftOut = left.bbox.x + left.bbox.w > 0.5 + 1e-9;
    const rightOut = right.bbox.x < 0.5 - 1e-9;
    expect(leftOut !== rightOut).toBe(true);
    expect(Math.max(left.bbox.x + left.bbox.w - 0.5, 0.5 - right.bbox.x)).toBeCloseTo(0.18 * 0.5, 6);
  });

  it('wavy: gentle shared sine edges (two half-waves), amplitude 0.08 of the cell', () => {
    for (const [cols, rows] of grids) {
      const cut = cutWavy(cols, rows, mulberry32(cols + rows));
      expect(cut.style).toBe('wavy');
      checkCut(cut, cols * rows);
      unionCoversSquare(cut);
      const amp = 0.08 * Math.min(1 / cols, 1 / rows);
      cut.pieces.forEach((p, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        expect(p.bbox.x).toBeGreaterThanOrEqual(c / cols - amp - 1e-6);
        expect(p.bbox.x + p.bbox.w).toBeLessThanOrEqual((c + 1) / cols + amp + 1e-6);
        expect(p.bbox.y).toBeGreaterThanOrEqual(r / rows - amp - 1e-6);
        expect(p.bbox.y + p.bbox.h).toBeLessThanOrEqual((r + 1) / rows + amp + 1e-6);
        expect(p.cx).toBeCloseTo((c + 0.5) / cols, 9);
        expect(p.cy).toBeCloseTo((r + 0.5) / rows, 9);
      });
      expect(cut.lines.match(/C/g)?.length).toBe(2 * ((rows - 1) * cols + (cols - 1) * rows));
    }
    // An internal piece of a 3×3 sticks out by the amplitude on the sides where the wave bulges.
    const mid = cutWavy(3, 3, mulberry32(9)).pieces[4] as CutPiece;
    expect(mid.bbox.x).toBeCloseTo(1 / 3 - 0.08 / 3, 6);
    expect(mid.bbox.w).toBeCloseTo(1 / 3 + 0.16 / 3, 6);
  });

  it('is deterministic for a seed and varies between seeds (random tab sides)', () => {
    expect(cutKnobs(3, 3, mulberry32(5))).toEqual(cutKnobs(3, 3, mulberry32(5)));
    expect(cutWavy(3, 3, mulberry32(5))).toEqual(cutWavy(3, 3, mulberry32(5)));
    const knobs = new Set<string>();
    const waves = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      knobs.add(cutKnobs(3, 3, mulberry32(seed)).lines);
      waves.add(cutWavy(3, 3, mulberry32(seed)).lines);
    }
    expect(knobs.size).toBeGreaterThan(1);
    expect(waves.size).toBeGreaterThan(1);
    // The default rng also works.
    checkCut(cutKnobs(2, 2), 4);
    checkCut(cutWavy(2, 2), 4);
  });
});

describe('jigsaw levelFor / makeCut', () => {
  it('climbs the ladder for rounds 0–13', () => {
    const ladder: Level[] = [
      { style: 'grid', args: [2, 2] },
      { style: 'strips', args: [3, 0] },
      { style: 'diag', args: [4] },
      { style: 'grid', args: [3, 2] },
      { style: 'knobs', args: [2, 2] },
      { style: 'pie', args: [6] },
      { style: 'wavy', args: [3, 2] },
      { style: 'grid', args: [3, 3] },
      { style: 'knobs', args: [3, 2] },
      { style: 'diag', args: [8] },
      { style: 'pie', args: [8] },
      { style: 'knobs', args: [3, 3] },
      { style: 'wavy', args: [3, 3] },
      { style: 'grid', args: [4, 3] },
    ];
    ladder.forEach((level, round) => expect(levelFor(round, mulberry32(round))).toEqual(level));
    // A fresh copy every time: callers cannot damage the table.
    levelFor(0).args.push(99);
    expect(levelFor(0)).toEqual({ style: 'grid', args: [2, 2] });
  });

  it('from round 14 on picks at random among the hard levels', () => {
    const allowed = ['knobs 3,3', 'knobs 4,3', 'wavy 3,3', 'pie 8', 'grid 4,3', 'diag 8'];
    const seen = new Set<string>();
    for (let round = 14; round < 60; round++) {
      const level = levelFor(round, mulberry32(round));
      const key = `${level.style} ${level.args.join(',')}`;
      expect(allowed).toContain(key);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(2);
    const endless = levelFor(99);
    expect(allowed).toContain(`${endless.style} ${endless.args.join(',')}`);
  });

  it('makeCut builds the cut a level describes', () => {
    const rng = mulberry32(1);
    expect(makeCut({ style: 'grid', args: [4, 3] }).pieces.length).toBe(12);
    expect(makeCut({ style: 'strips', args: [3, 0] }).pieces[0]?.bbox.w).toBe(1);
    expect(makeCut({ style: 'strips', args: [3, 1] }).pieces[0]?.bbox.h).toBe(1);
    expect(makeCut({ style: 'diag', args: [4] }).pieces.length).toBe(4);
    expect(makeCut({ style: 'diag', args: [8] }).pieces.length).toBe(8);
    expect(makeCut({ style: 'pie', args: [6] }, rng).pieces.length).toBe(6);
    expect(makeCut({ style: 'knobs', args: [3, 2] }, rng).style).toBe('knobs');
    expect(makeCut({ style: 'knobs', args: [3, 2] }, rng).pieces.length).toBe(6);
    expect(makeCut({ style: 'wavy', args: [3, 3] }, rng).style).toBe('wavy');
    expect(makeCut({ style: 'wavy', args: [3, 3] }, rng).pieces.length).toBe(9);
    for (let round = 0; round < 20; round++)
      checkCut(
        makeCut(levelFor(round, mulberry32(round)), mulberry32(round)),
        makeCut(levelFor(round, mulberry32(round)), mulberry32(round)).pieces.length,
      );
  });
});

describe('jigsaw scalePath', () => {
  it('scales and translates M/L/C coordinates', () => {
    expect(scalePath('M0 0L1 0L1 1L0 1Z', 100, 50, 10, 20)).toBe('M10 20L110 20L110 70L10 70Z');
    expect(scalePath('M0 0C0.1 0.2 0.3 0.4 0.5 0.6Z', 10, 100)).toBe('M0 0C1 20 3 40 5 60Z');
    expect(scalePath('M0.5 0.5L0 0L1 0Z', 2, 2, -1, -1)).toBe('M0 0L-1 -1L1 -1Z');
  });

  it('scales arc radii, keeps rotation and flags, handles implicit repeats, negatives and exponents', () => {
    expect(scalePath('M0 0A1 2 30 0 1 0.5 0.5Z', 2, 4, 1, 1)).toBe('M1 1A2 8 30 0 1 2 3Z');
    expect(scalePath('A1 1 0 1 0 1 1', -2, -2)).toBe('A2 2 0 1 0 -2 -2');
    expect(scalePath('M0 0L1 1 2 2Z', 2, 2)).toBe('M0 0L2 2 4 4Z');
    expect(scalePath('M-0.5 1e-1Z', 2, 10)).toBe('M-1 1Z');
    expect(scalePath('M.5 .25Z', 4, 4)).toBe('M2 1Z');
    expect(scalePath('', 1, 1)).toBe('');
  });

  it('keeps the numbers tidy and rejects other commands', () => {
    expect(scalePath('M0.1 0.2Z', 3, 3)).toBe('M0.3 0.6Z');
    expect(scalePath('M0 0Z', 0, 0, -0, -0)).toBe('M0 0Z');
    expect(() => scalePath('M0 0H1Z', 1, 1)).toThrow(/unsupported/);
    expect(() => scalePath('m0 0Z', 1, 1)).toThrow(/unsupported/);
  });

  it('round-trips a knob piece into pixels local to its bbox', () => {
    const p = cutKnobs(2, 2, mulberry32(2)).pieces[0] as CutPiece;
    const size = 400;
    const local = scalePath(p.path, size, size, -p.bbox.x * size, -p.bbox.y * size);
    const pts = flatten(local, 64);
    expect(Math.min(...pts.map((q) => q[0]))).toBeCloseTo(0, 1);
    expect(Math.min(...pts.map((q) => q[1]))).toBeCloseTo(0, 1);
    expect(Math.max(...pts.map((q) => q[0]))).toBeCloseTo(p.bbox.w * size, 1);
    expect(Math.max(...pts.map((q) => q[1]))).toBeCloseTo(p.bbox.h * size, 1);
  });
});

describe('jigsaw makeJigsawRound', () => {
  it('cuts by the ladder, deals every piece once (shuffled) with a known picture and a pastel background', () => {
    for (const round of [0, 1, 2, 4, 5, 6, 13]) {
      const r = makeJigsawRound(round, mulberry32(7 + round));
      const level = levelFor(round);
      expect(r.cut.style).toBe(level.style);
      expect(r.cut.pieces.length).toBe(makeCut(level).pieces.length);
      expect(r.pieces.length).toBe(r.cut.pieces.length);
      expect([...r.pieces].sort((a, b) => a.id - b.id)).toEqual(r.cut.pieces);
      expect(new Set(r.pieces.map((p) => p.id)).size).toBe(r.cut.pieces.length);
      expect(PICTURES.some((i) => i.emoji === r.item.emoji)).toBe(true);
      expect(PICTURE_BGS).toContain(r.bg);
    }
    expect(PICTURE_BGS.length).toBe(6);
  });

  it('shuffles the pieces: not always in reading order, and different across seeds', () => {
    const orders = new Set<string>();
    let shuffled = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = makeJigsawRound(7, mulberry32(seed));
      const ids = r.pieces.map((p) => p.id).join(',');
      orders.add(ids);
      if (ids !== '0,1,2,3,4,5,6,7,8') shuffled++;
    }
    expect(shuffled).toBeGreaterThan(0);
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never picks the excluded picture', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(makeJigsawRound(0, mulberry32(seed), '🐶').item.emoji).not.toBe('🐶');
      expect(makeJigsawRound(1, mulberry32(seed), '🍎').item.emoji).not.toBe('🍎');
    }
  });

  it('is deterministic for a seed', () => {
    expect(makeJigsawRound(4, mulberry32(9))).toEqual(makeJigsawRound(4, mulberry32(9)));
    expect(makeJigsawRound(20, mulberry32(9))).toEqual(makeJigsawRound(20, mulberry32(9)));
  });
});

describe('jigsaw renderPicture', () => {
  it('returns null without a 2d context (jsdom) and never throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(renderPicture('🐶', 64, '#fde68a')).toBeNull();
  });

  it('paints a white→bg gradient and the centred emoji, then returns the PNG data URL', () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD');
    expect(renderPicture('🐶', 100, '#bae6fd')).toBe('data:image/png;base64,QUJD');
    expect(c.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(c.gradient.addColorStop).toHaveBeenCalledWith(0, '#fff');
    expect(c.gradient.addColorStop).toHaveBeenCalledWith(1, '#bae6fd');
    expect(c.font.startsWith(`${Math.round(100 * EMOJI_SCALE)}px`)).toBe(true);
    expect(c.textAlign).toBe('center');
    expect(c.textBaseline).toBe('middle');
    expect(c.shadowBlur).toBeGreaterThan(0);
    expect(c.fillText).toHaveBeenCalledWith('🐶', 50, expect.any(Number));
  });
});

describe('jigsaw renderPhotoPicture', () => {
  it('resolves null in jsdom (no 2d context) and never throws', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderPhotoPicture('data:image/jpeg;base64,', 64)).resolves.toBeNull();
  });

  it('resolves null when the image fails to load', async () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', fakeImage(false));
    await expect(renderPhotoPicture('data:image/jpeg;base64,', 100)).resolves.toBeNull();
    expect(c.drawImage).not.toHaveBeenCalled();
  });

  it('paints white, covers the square with the photo and returns a JPEG data URL', async () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,UEhP');
    vi.stubGlobal('Image', fakeImage(true, 200, 100));
    await expect(renderPhotoPicture('data:image/jpeg;base64,', 100)).resolves.toBe('data:image/jpeg;base64,UEhP');
    expect(c.fillStyle).toBe('#fff');
    expect(c.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    // A 200×100 photo covering a 100×100 square keeps its height and is centred horizontally.
    expect(c.drawImage).toHaveBeenCalledWith(expect.anything(), -50, 0, 200, 100);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });
});

describe('jigsaw trayPieceWidth', () => {
  it('keeps the slot size when everything fits in one row', () => {
    expect(trayPieceWidth(4, 100, 100, 500, 120, 10)).toBe(100);
  });
  it('shrinks so the pieces wrap into rows that fit the tray', () => {
    // 9 squares in 300×200: three per row would need 3 rows of 66.67.
    expect(trayPieceWidth(9, 100, 100, 300, 200, 0)).toBeCloseTo(200 / 3, 5);
    // Tall 3×2 cells (90×135) in a 270×300 column: 3 per row at 0.93 scale.
    const w = trayPieceWidth(6, 90, 135, 270, 300, 0);
    expect(w).toBeCloseTo(90, 5);
    expect(trayPieceWidth(6, 90, 135, 200, 300, 0)).toBeLessThan(90);
  });
  it('accounts for gaps and never exceeds the slot', () => {
    expect(trayPieceWidth(2, 100, 100, 190, 100, 10)).toBe(90);
    expect(trayPieceWidth(1, 50, 50, 1000, 1000, 10)).toBe(50);
  });
  it('is 0 for nothing to lay out', () => {
    expect(trayPieceWidth(0, 100, 100, 300, 300, 0)).toBe(0);
    expect(trayPieceWidth(3, 0, 100, 300, 300, 0)).toBe(0);
  });
});
