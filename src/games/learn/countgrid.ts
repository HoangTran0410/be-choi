/**
 * Where to put n countable pictures inside a box of w × h pixels so that they always fit.
 *
 * Pictures sit in rows of up to five (like a ten-frame / abacus), so a child can see "five and
 * three more" instead of counting a heap. Up to five there is a single row (or two short rows
 * when the box is nearly square); beyond five every row of five gets a border and the rows are
 * stacked or set side by side, whichever makes the pictures biggest. The cell size comes out of
 * the box, so more pictures simply means smaller (but still whole) pictures: nothing overflows.
 *
 * Pure maths, no DOM. The CSS in style.css (`.lv-group`) draws exactly this arrangement from the
 * numbers below: cells are `cell` px, `GAP * cell` apart inside a row, rows have `PAD * cell`
 * padding when bordered, and rows are `ROW_GAP * cell` apart.
 */

/** Space between pictures in a row, in cells. */
export const GAP = 0.06;
/** Padding inside a bordered row, in cells. */
export const PAD = 0.14;
/** Space between rows, in cells. */
export const ROW_GAP = 0.2;
/** Most pictures in one row. */
export const PER_ROW = 5;

export interface CountLayout {
  n: number;
  /** Size of one picture's square, px. */
  cell: number;
  /** Pictures in each row, in order (every row but the last is full). */
  rows: number[];
  /** How many rows sit side by side. */
  rowsAcross: number;
  /** How many rows sit one below another. */
  rowsDown: number;
  /** Rows have a border (more than one row of five). */
  framed: boolean;
  /** Padding inside a framed row, px. */
  pad: number;
  gap: number;
  rowGap: number;
  /** Bounding box of the whole arrangement, px (never larger than the box asked for). */
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cell used when the box has no size yet (not laid out, or a test without a browser). */
export const FALLBACK_BOX = { w: 220, h: 120 };

function build(n: number, perRow: number, across: number, w: number, h: number, maxCell: number): CountLayout {
  const rows: number[] = [];
  for (let left = n; left > 0; left -= perRow) rows.push(Math.min(perRow, left));
  const framed = n > PER_ROW;
  const pad = framed ? PAD : 0;
  const down = Math.ceil(rows.length / across);
  const rowW = perRow + GAP * (perRow - 1) + 2 * pad;
  const rowH = 1 + 2 * pad;
  const unitsW = across * rowW + (across - 1) * ROW_GAP;
  const unitsH = down * rowH + (down - 1) * ROW_GAP;
  const cell = Math.max(1, Math.floor(Math.min(w / unitsW, h / unitsH, maxCell)));
  const r = (u: number): number => u * cell;
  return {
    n,
    cell,
    rows,
    rowsAcross: across,
    rowsDown: down,
    framed,
    pad: r(pad),
    gap: r(GAP),
    rowGap: r(ROW_GAP),
    width: r(unitsW),
    height: r(unitsH),
  };
}

/** The biggest arrangement of n pictures that fits in w × h px (cells never exceed `maxCell`). */
export function countLayout(n: number, w: number, h: number, maxCell = 96): CountLayout {
  const count = Math.max(0, Math.floor(n));
  const bw = Math.max(1, w);
  const bh = Math.max(1, h);
  if (count === 0) return build(0, PER_ROW, 1, bw, bh, maxCell);
  const candidates: CountLayout[] = [];
  if (count <= PER_ROW) {
    candidates.push(build(count, count, 1, bw, bh, maxCell));
    if (count >= 4) candidates.push(build(count, Math.ceil(count / 2), 1, bw, bh, maxCell));
  } else {
    const total = Math.ceil(count / PER_ROW);
    for (let across = 1; across <= total; across++) candidates.push(build(count, PER_ROW, across, bw, bh, maxCell));
  }
  // Biggest picture wins; on a tie the tidier (earlier) arrangement stays.
  return candidates.reduce((best, c) => (c.cell > best.cell ? c : best));
}

/** Position of every picture inside the layout's own box (0,0 at its top-left corner). For tests and anything that wants to place things itself. */
export function cellRects(l: CountLayout): Rect[] {
  const out: Rect[] = [];
  const perRow = l.rows[0] ?? 0;
  const rowW = perRow * l.cell + (perRow - 1) * l.gap + 2 * l.pad;
  const rowH = l.cell + 2 * l.pad;
  l.rows.forEach((count, ri) => {
    const rx = (ri % l.rowsAcross) * (rowW + l.rowGap);
    const ry = Math.floor(ri / l.rowsAcross) * (rowH + l.rowGap);
    for (let i = 0; i < count; i++) out.push({ x: rx + l.pad + i * (l.cell + l.gap), y: ry + l.pad, w: l.cell, h: l.cell });
  });
  return out;
}
