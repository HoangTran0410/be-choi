import { SAMPLES_PER_SEGMENT, advance, bezier, isHome, makePath, pointAt, sampleTrack, type Cubic, type Path, type Pt } from './logic';
import type { Fill, Stroke } from './shapes';

/** The three ways to draw a picture. */
export type Mode = 'follow' | 'dots' | 'color';
export const MODES: readonly Mode[] = ['follow', 'dots', 'color'];

/** Fraction of a fill's area that has to be rubbed before the whole region colours itself in. */
export const FILL_DONE = 0.7;

/* ------------------------------------------------------------------ layout */

export interface Box {
  x: number;
  y: number;
  size: number;
}

/** Room kept free for the mode buttons (a row at the bottom, or a column at the left in landscape). */
export const BAR_SPACE = 92;

/** The square the picture is drawn in, centred in what is left of a `w` × `h` stage once the mode bar has its room. */
export function fitBox(w: number, h: number, pad = 10): Box {
  const landscape = w > h;
  const availW = w - (landscape ? BAR_SPACE : 0);
  const availH = h - (landscape ? 0 : BAR_SPACE);
  const size = Math.max(100, Math.min(availW, availH) - pad * 2);
  return { x: (landscape ? BAR_SPACE : 0) + (availW - size) / 2, y: (availH - size) / 2, size };
}

export function toUnit(box: Box, px: Pt): Pt {
  return { x: (px.x - box.x) / box.size, y: (px.y - box.y) / box.size };
}

export function toPixels(box: Box, u: Pt): Pt {
  return { x: box.x + u.x * box.size, y: box.y + u.y * box.size };
}

/* ------------------------------------------------------------ follow mode */

/** A stroke as a dense polyline in unit coordinates. */
export function strokePath(stroke: Stroke): Path {
  return makePath(sampleTrack(stroke.segs));
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function lookaheadFor(path: Path, progress: number, tol: number): number {
  // A stroke nobody has touched only wakes up near its start; once begun the finger may skip ahead a little.
  return progress <= 0 ? tol * 1.2 : Math.max(path.total * 0.25, tol * 2);
}

function tryStroke(path: Path, progress: number, finger: Pt, tol: number): { next: number; d: number } | null {
  const next = advance(path, progress, finger, tol, lookaheadFor(path, progress, tol));
  const d = dist(pointAt(path, next), finger);
  if (next > progress) return { next, d };
  if (progress <= 0 && d <= tol) return { next, d };
  return null;
}

/**
 * Which stroke the finger moves, and how far it has got. The stroke already being drawn goes
 * first; otherwise the closest unfinished stroke that the finger is on wins. Null means the
 * finger is nowhere useful (and nothing happens).
 */
export function followTouch(
  paths: readonly Path[],
  progress: readonly number[],
  active: number,
  finger: Pt,
  tol: number,
): { index: number; progress: number } | null {
  const open = (i: number) => !isHome(paths[i]!, progress[i]!);
  if (active >= 0 && active < paths.length && open(active)) {
    const r = tryStroke(paths[active]!, progress[active]!, finger, tol);
    if (r && r.next > progress[active]!) return { index: active, progress: r.next };
  }
  let best: { index: number; progress: number } | null = null;
  let bestD = Infinity;
  for (let i = 0; i < paths.length; i++) {
    if (i === active || !open(i)) continue;
    const r = tryStroke(paths[i]!, progress[i]!, finger, tol);
    if (r && r.d < bestD) {
      bestD = r.d;
      best = { index: i, progress: r.next };
    }
  }
  return best;
}

/** The stretch of a path from its start to arc length `s`, as points. */
export function walked(path: Path, s: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < path.pts.length && path.cum[i]! <= s; i++) out.push(path.pts[i]!);
  out.push(pointAt(path, s));
  return out;
}

/* -------------------------------------------------------------- dots mode */

export interface DotStroke {
  path: Path;
  /** The dots, in the order they are joined. */
  pts: Pt[];
  /** Arc length of each dot along `path`. */
  s: number[];
  /** The stroke runs back to where it started (the last dot joins the first, with no dot of its own). */
  closed: boolean;
}

const STRAIGHT_EPS = 0.004;
const MIN_GAP = 0.02;

function distToLine(p: Pt, a: Pt, b: Pt): number {
  const len = dist(a, b);
  if (len < 1e-9) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

export function isStraight(c: Cubic): boolean {
  return distToLine(c[1], c[0], c[3]) < STRAIGHT_EPS && distToLine(c[2], c[0], c[3]) < STRAIGHT_EPS;
}

function segLength(c: Cubic): number {
  return dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]);
}

function dotsOne(stroke: Stroke, spacing: number): DotStroke {
  const segs = stroke.segs;
  const path = strokePath(stroke);
  const cand: { pt: Pt; idx: number }[] = [];
  segs.forEach((seg, i) => {
    cand.push({ pt: seg[0], idx: i * SAMPLES_PER_SEGMENT });
    if (isStraight(seg)) return;
    const m = Math.max(1, Math.min(4, Math.round(segLength(seg) / spacing)));
    for (let j = 1; j < m; j++) {
      const k = Math.round((j / m) * SAMPLES_PER_SEGMENT);
      cand.push({ pt: bezier(seg, k / SAMPLES_PER_SEGMENT), idx: i * SAMPLES_PER_SEGMENT + k });
    }
  });
  const last = segs[segs.length - 1]![3];
  const closed = dist(last, segs[0]![0]) < 1e-3 && segs.length > 1;
  if (!closed) cand.push({ pt: last, idx: segs.length * SAMPLES_PER_SEGMENT });
  const kept: { pt: Pt; idx: number }[] = [];
  for (const c of cand) {
    const prev = kept[kept.length - 1];
    if (prev && dist(prev.pt, c.pt) < MIN_GAP) {
      // Keep the end of an open stroke even when it crowds the previous dot.
      if (!closed && c.idx === segs.length * SAMPLES_PER_SEGMENT && kept.length > 1) kept[kept.length - 1] = c;
      continue;
    }
    kept.push(c);
  }
  if (closed && kept.length > 1 && dist(kept[kept.length - 1]!.pt, kept[0]!.pt) < MIN_GAP) kept.pop();
  if (kept.length < 2) kept.push({ pt: last, idx: segs.length * SAMPLES_PER_SEGMENT });
  return { path, pts: kept.map((k) => k.pt), s: kept.map((k) => path.cum[k.idx] ?? path.total), closed };
}

/**
 * Turn strokes into dots to join: the corners of straight runs, and evenly spaced points along
 * curves (thinned out if the picture would otherwise have more than `budget` dots).
 */
export function deriveDots(strokes: readonly Stroke[], budget = 80): DotStroke[] {
  let spacing = 0.11;
  let out = strokes.map((s) => dotsOne(s, spacing));
  for (let i = 0; i < 6 && out.reduce((n, d) => n + d.pts.length, 0) > budget; i++) {
    spacing *= 1.5;
    out = strokes.map((s) => dotsOne(s, spacing));
  }
  return out;
}

export function dotsDone(d: DotStroke, connected: number): boolean {
  return connected >= d.pts.length - 1;
}

/**
 * The dot the finger is on, if it is one that may be joined now: the next dot of a stroke that
 * has begun, or the first dot of one that has not. Only one dot can ever be joined by one touch,
 * and the stroke already being drawn goes first. Anything else does nothing.
 */
export function hitDot(
  dots: readonly DotStroke[],
  connected: readonly number[],
  active: number,
  finger: Pt,
  radius: number,
): { stroke: number; dot: number } | null {
  const check = (i: number): number => {
    const d = dots[i]!;
    if (dotsDone(d, connected[i]!)) return Infinity;
    const at = d.pts[connected[i]! + 1]!;
    const gap = dist(at, finger);
    return gap <= radius ? gap : Infinity;
  };
  if (active >= 0 && active < dots.length && check(active) < Infinity) return { stroke: active, dot: connected[active]! + 1 };
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < dots.length; i++) {
    if (i === active) continue;
    const g = check(i);
    if (g < bestD) {
      bestD = g;
      best = i;
    }
  }
  return best >= 0 ? { stroke: best, dot: connected[best]! + 1 } : null;
}

/** Index of the stroke to point the hint at: the one being drawn, else the first unfinished. */
export function nextUnfinished(done: readonly boolean[], active: number): number {
  if (active >= 0 && !done[active]) return active;
  return done.findIndex((d) => !d);
}

/* ------------------------------------------------------------- colour mode */

export interface FillGrid {
  /** Centres of the cells that lie inside the region (unit coordinates). */
  cells: Pt[];
  painted: boolean[];
  count: number;
  /** Side of one cell. */
  cell: number;
  done: boolean;
}

export function pointInPoly(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function makeFillGrid(fill: Fill, n = 14): FillGrid {
  const xs = fill.pts.map((q) => q.x);
  const ys = fill.pts.map((q) => q.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let cell = Math.max(x1 - x0, y1 - y0, 0.02) / n;
  let cells: Pt[] = [];
  for (let tries = 0; tries < 4; tries++) {
    cells = [];
    for (let y = y0 + cell / 2; y < y1; y += cell) for (let x = x0 + cell / 2; x < x1; x += cell) if (pointInPoly({ x, y }, fill.pts)) cells.push({ x, y });
    if (cells.length >= 12) break;
    cell /= 2;
  }
  if (cells.length === 0) cells = [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }];
  return { cells, painted: cells.map(() => false), count: 0, cell, done: false };
}

export function coverage(g: FillGrid): number {
  return g.cells.length === 0 ? 1 : g.count / g.cells.length;
}

/** Rub from `from` (or just a touch, when null) to `to` with a round brush; returns the cells newly painted. */
export function paintGrid(g: FillGrid, from: Pt | null, to: Pt, radius: number): number[] {
  const fresh: number[] = [];
  const len = from ? dist(from, to) : 0;
  const steps = Math.max(1, Math.ceil(len / (radius / 2)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const at = from ? { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t } : to;
    for (let i = 0; i < g.cells.length; i++) {
      if (g.painted[i]) continue;
      if (dist(g.cells[i]!, at) <= radius) {
        g.painted[i] = true;
        g.count++;
        fresh.push(i);
      }
    }
  }
  return fresh;
}

export function fillReady(g: FillGrid): boolean {
  return coverage(g) >= FILL_DONE;
}
