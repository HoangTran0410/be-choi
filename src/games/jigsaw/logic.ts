import { ANIMALS, FRUITS, VEHICLES, type Item } from '../../core/content';
import { randInt, shuffle } from '../../core/dom';
import { drawCover, loadImage } from '../../core/photos';

/* ---------------------------------------------------------------------------
 * Cut library. Every generator works in the unit square (0..1) and returns
 * pieces as absolute SVG paths (M/L/C/Z) plus one path with all the cut lines.
 * ------------------------------------------------------------------------- */

export type CutStyle = 'grid' | 'strips' | 'diag' | 'pie' | 'knobs' | 'wavy';

export interface CutPiece {
  /** Unique within a cut, `0..n-1`. */
  id: number;
  /** SVG path in unit-square coordinates: absolute M/L/C/Z, starts with `M`, ends with `Z`. */
  path: string;
  /** Bounding box of the path in unit-square coordinates. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Centroid: polygon centroid for polygon cuts, the cell centre for knobs/wavy. */
  cx: number;
  cy: number;
}

export interface Cut {
  style: CutStyle;
  pieces: CutPiece[];
  /** One SVG path with every cut line, for the dashed guide on the board. */
  lines: string;
}

export interface Level {
  style: CutStyle;
  args: number[];
}

type Pt = [number, number];

/** A path segment ending at `p`: a line when `c` is absent, a cubic bezier otherwise. */
interface Seg {
  c?: [Pt, Pt];
  p: Pt;
}

/** A curve from `a` to `b` made of segments; neighbouring pieces share one (one of them reversed). */
interface Edge {
  a: Pt;
  b: Pt;
  segs: Seg[];
}

/** Numbers in paths: 6 decimals, no `-0`, no float noise. */
function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return String(r === 0 ? 0 : r);
}

function pt(p: Pt): string {
  return `${fmt(p[0])} ${fmt(p[1])}`;
}

function segStr(s: Seg): string {
  return s.c ? `C${pt(s.c[0])} ${pt(s.c[1])} ${pt(s.p)}` : `L${pt(s.p)}`;
}

/** Walk `edge` backwards: from `b` to `a`, control points swapped. */
function reverse(edge: Edge): Edge {
  const segs: Seg[] = [];
  for (let i = edge.segs.length - 1; i >= 0; i--) {
    const s = edge.segs[i] as Seg;
    const prev = i > 0 ? (edge.segs[i - 1] as Seg).p : edge.a;
    segs.push(s.c ? { c: [s.c[1], s.c[0]], p: prev } : { p: prev });
  }
  return { a: edge.b, b: edge.a, segs };
}

function straight(a: Pt, b: Pt): Edge {
  return { a, b, segs: [{ p: b }] };
}

/**
 * Bend a template into an edge: template points `(u, v)` map to
 * `a + u·(b − a) + v·depth`, so `u` runs along the edge and `v` across it.
 */
function bend(a: Pt, b: Pt, depth: Pt, template: Seg[]): Edge {
  const map = ([u, v]: Pt): Pt => [a[0] + u * (b[0] - a[0]) + v * depth[0], a[1] + u * (b[1] - a[1]) + v * depth[1]];
  return {
    a,
    b,
    segs: template.map((s) => (s.c ? { c: [map(s.c[0]), map(s.c[1])], p: map(s.p) } : { p: map(s.p) })),
  };
}

/** Coordinates of a cubic bezier at `t`. */
function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Values of `t` in (0, 1) where a cubic's coordinate is extreme. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  // Derivative / 3 = (a − 2b + c)t² + 2(b − a)t + a with a = p1−p0, b = p2−p1, c = p3−p2.
  const a = p1 - p0;
  const b = p2 - p1;
  const c = p3 - p2;
  const qa = a - 2 * b + c;
  const qb = 2 * (b - a);
  const out: number[] = [];
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) > 1e-12) out.push(-a / qb);
  } else {
    const disc = qb * qb - 4 * qa * a;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      out.push((-qb + s) / (2 * qa), (-qb - s) / (2 * qa));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of a closed path given as consecutive edges (exact, bezier extrema included). */
function bboxOf(edges: Edge[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const addX = (x: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  };
  const addY = (y: number): void => {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const e of edges) {
    let from = e.a;
    addX(from[0]);
    addY(from[1]);
    for (const s of e.segs) {
      addX(s.p[0]);
      addY(s.p[1]);
      if (s.c) {
        const [c1, c2] = s.c;
        for (const t of cubicExtrema(from[0], c1[0], c2[0], s.p[0])) addX(cubicAt(from[0], c1[0], c2[0], s.p[0], t));
        for (const t of cubicExtrema(from[1], c1[1], c2[1], s.p[1])) addY(cubicAt(from[1], c1[1], c2[1], s.p[1], t));
      }
      from = s.p;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Shoelace area (absolute). */
export function polygonArea(points: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] as Pt;
    const [x2, y2] = points[(i + 1) % points.length] as Pt;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function polygonCentroid(points: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] as Pt;
    const [x2, y2] = points[(i + 1) % points.length] as Pt;
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function polygonPiece(id: number, points: Pt[]): CutPiece {
  const path = `M${pt(points[0] as Pt)}${points
    .slice(1)
    .map((p) => `L${pt(p)}`)
    .join('')}Z`;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const [cx, cy] = polygonCentroid(points);
  return { id, path, bbox: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, cx, cy };
}

/* ---- grid family: grid, knobs, wavy ---- */

/**
 * Knob tab in (u, v): shoulders at u = 0.5 ± 0.175 (0.35 of the edge), a neck
 * narrower than the head, the top at v = 1 (scaled to the depth by `bend`).
 */
const KNOB_TEMPLATE: Seg[] = [
  { p: [0.325, 0] },
  { c: [[0.37, 0], [0.4, 0.1]], p: [0.4, 0.25] },
  { c: [[0.4, 0.5], [0.2, 1]], p: [0.5, 1] },
  { c: [[0.8, 1], [0.6, 0.5]], p: [0.6, 0.25] },
  { c: [[0.6, 0.1], [0.63, 0]], p: [0.675, 0] },
  { p: [1, 0] },
];

/** Two half-waves in (u, v) whose peaks reach v = ±1 (a cubic with both handles at 4/3 peaks at 1). */
const WAVE_TEMPLATE: Seg[] = [
  { c: [[1 / 6, 4 / 3], [1 / 3, 4 / 3]], p: [0.5, 0] },
  { c: [[2 / 3, -4 / 3], [5 / 6, -4 / 3]], p: [1, 0] },
];

/** Knob depth as a fraction of the (smaller) cell side. */
const KNOB_DEPTH = 0.18;
/** Wave amplitude as a fraction of the (smaller) cell side. */
const WAVE_AMPLITUDE = 0.08;

/**
 * Cut `cols`×`rows` cells whose internal edges are shaped by `shape` (straight
 * when absent). Pieces are in reading order; every internal edge is generated
 * once and used by both neighbours, so they match exactly.
 */
function gridCut(
  style: CutStyle,
  cols: number,
  rows: number,
  shape?: (a: Pt, b: Pt, normal: Pt, along: number, across: number) => Edge,
): Cut {
  const cw = 1 / cols;
  const ch = 1 / rows;
  const at = (c: number, r: number): Pt => [c * cw, r * ch];
  // hor[r][c]: edge on top of cell (r, c), left → right. ver[r][c]: edge left of cell (r, c), top → bottom.
  const hor: Edge[][] = [];
  const ver: Edge[][] = [];
  for (let r = 0; r <= rows; r++) {
    hor.push([]);
    for (let c = 0; c < cols; c++) {
      const a = at(c, r);
      const b = at(c + 1, r);
      const internal = r > 0 && r < rows && shape;
      (hor[r] as Edge[]).push(internal ? shape(a, b, [0, 1], cw, ch) : straight(a, b));
    }
  }
  for (let r = 0; r < rows; r++) {
    ver.push([]);
    for (let c = 0; c <= cols; c++) {
      const a = at(c, r);
      const b = at(c, r + 1);
      const internal = c > 0 && c < cols && shape;
      (ver[r] as Edge[]).push(internal ? shape(a, b, [1, 0], ch, cw) : straight(a, b));
    }
  }
  const edge = (grid: Edge[][], r: number, c: number): Edge => {
    const e = grid[r]?.[c];
    if (!e) throw new Error('jigsaw: missing edge');
    return e;
  };
  const pieces: CutPiece[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edges = [edge(hor, r, c), edge(ver, r, c + 1), reverse(edge(hor, r + 1, c)), reverse(edge(ver, r, c))];
      const start = at(c, r);
      const segs = edges.flatMap((e) => e.segs);
      // The last edge ends with a straight run back to the start: `Z` closes that.
      const last = segs[segs.length - 1];
      if (last && !last.c && last.p[0] === start[0] && last.p[1] === start[1]) segs.pop();
      const path = `M${pt(start)}${segs.map(segStr).join('')}Z`;
      pieces.push({ id: pieces.length, path, bbox: bboxOf(edges), cx: (c + 0.5) * cw, cy: (r + 0.5) * ch });
    }
  }
  let lines = '';
  for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) lines += lineOf(edge(hor, r, c));
  for (let c = 1; c < cols; c++) for (let r = 0; r < rows; r++) lines += lineOf(edge(ver, r, c));
  return { style, pieces, lines };
}

function lineOf(e: Edge): string {
  return `M${pt(e.a)}${e.segs.map(segStr).join('')}`;
}

/** `cols`×`rows` rectangles. */
export function cutGrid(cols: number, rows: number): Cut {
  return gridCut('grid', cols, rows);
}

/** `n` bars: columns when `vertical`, rows otherwise. */
export function cutStrips(n: number, vertical: boolean): Cut {
  return vertical ? gridCut('strips', n, 1) : gridCut('strips', 1, n);
}

/**
 * Classic jigsaw: every internal edge gets a tab pointing to a random side
 * (`rng`). Tab width ≈ 0.35 of the edge, depth ≈ 0.18 of the smaller cell side.
 */
export function cutKnobs(cols: number, rows: number, rng: () => number = Math.random): Cut {
  return gridCut('knobs', cols, rows, (a, b, normal, along, across) => {
    const side = rng() < 0.5 ? -1 : 1;
    const depth = KNOB_DEPTH * Math.min(along, across) * side;
    return bend(a, b, [normal[0] * depth, normal[1] * depth], KNOB_TEMPLATE);
  });
}

/** Grid whose internal edges are gentle sine waves (two half-waves, amplitude ≈ 0.08 of the cell). */
export function cutWavy(cols: number, rows: number, rng: () => number = Math.random): Cut {
  return gridCut('wavy', cols, rows, (a, b, normal, along, across) => {
    const side = rng() < 0.5 ? -1 : 1;
    const amp = WAVE_AMPLITUDE * Math.min(along, across) * side;
    return bend(a, b, [normal[0] * amp, normal[1] * amp], WAVE_TEMPLATE);
  });
}

/* ---- wedge family: diag, pie ---- */

/**
 * Perimeter parameter `t ∈ [0, 4)`: top edge left→right (0..1), right edge
 * top→bottom (1..2), bottom edge right→left (2..3), left edge bottom→top (3..4).
 */
function perimeterPoint(t: number): Pt {
  const s = ((t % 4) + 4) % 4;
  if (s < 1) return [s, 0];
  if (s < 2) return [1, s - 1];
  if (s < 3) return [3 - s, 1];
  return [0, 4 - s];
}

/** Where the ray from the centre at angle `theta` (screen coordinates, clockwise) leaves the square. */
function perimeterAt(theta: number): number {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const k = 0.5 / Math.max(Math.abs(dx), Math.abs(dy));
  const x = 0.5 + k * dx;
  const y = 0.5 + k * dy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 + y : 4 - y;
  return dy > 0 ? 3 - x : x;
}

/** Wedges from the centre to boundary points `ts` (perimeter parameters, increasing, cyclic). */
function wedges(style: CutStyle, ts: number[]): Cut {
  const centre: Pt = [0.5, 0.5];
  const pieces: CutPiece[] = [];
  let lines = '';
  for (let i = 0; i < ts.length; i++) {
    const t0 = ts[i] as number;
    let t1 = ts[(i + 1) % ts.length] as number;
    if (t1 <= t0) t1 += 4;
    const points: Pt[] = [centre, perimeterPoint(t0)];
    // Corners strictly between the two boundary points, walking clockwise.
    for (let k = Math.floor(t0) + 1; k < t1; k++) points.push(perimeterPoint(k));
    points.push(perimeterPoint(t1));
    pieces.push(polygonPiece(i, points));
    lines += `M${pt(centre)}L${pt(perimeterPoint(t0))}`;
  }
  return { style, pieces, lines };
}

/** 4 triangles from the two diagonals; `eight` also cuts by the + for 8 triangles. */
export function cutDiag(eight: boolean): Cut {
  const ts = eight ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 1, 2, 3];
  return wedges('diag', ts);
}

/**
 * `n` wedges from the centre to the border, evenly spaced in angle and started
 * half a wedge off the axes (so it never coincides with `cutDiag`); `rng`
 * nudges the start angle a little.
 */
export function cutPie(n: number, rng?: () => number): Cut {
  const step = (2 * Math.PI) / n;
  const start = step / 2 + (rng ? (rng() - 0.5) * step * 0.5 : 0);
  const ts: number[] = [];
  for (let i = 0; i < n; i++) ts.push(perimeterAt(start + i * step));
  return wedges('pie', ts);
}

/* ---- ladder ---- */

const LADDER: readonly Level[] = [
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

/** Past the ladder: one of these at random. */
const ENDLESS: readonly Level[] = [
  { style: 'knobs', args: [3, 3] },
  { style: 'knobs', args: [4, 3] },
  { style: 'wavy', args: [3, 3] },
  { style: 'pie', args: [8] },
  { style: 'grid', args: [4, 3] },
  { style: 'diag', args: [8] },
];

/**
 * Difficulty ladder: 0 grid 2×2 · 1 strips 3 · 2 diag 4 · 3 grid 3×2 · 4 knobs 2×2 ·
 * 5 pie 6 · 6 wavy 3×2 · 7 grid 3×3 · 8 knobs 3×2 · 9 diag 8 · 10 pie 8 ·
 * 11 knobs 3×3 · 12 wavy 3×3 · 13 grid 4×3 · 14+ a random pick from `ENDLESS`.
 */
export function levelFor(round: number, rng: () => number = Math.random): Level {
  const level = LADDER[round] ?? ENDLESS[randInt(0, ENDLESS.length - 1, rng)] ?? (LADDER[0] as Level);
  return { style: level.style, args: [...level.args] };
}

export function makeCut(level: Level, rng: () => number = Math.random): Cut {
  const [a, b] = level.args;
  switch (level.style) {
    case 'grid':
      return cutGrid(a ?? 2, b ?? 2);
    case 'strips':
      return cutStrips(a ?? 3, (b ?? 0) !== 0);
    case 'diag':
      return cutDiag(a === 8);
    case 'pie':
      return cutPie(a ?? 6, rng);
    case 'knobs':
      return cutKnobs(a ?? 2, b ?? 2, rng);
    case 'wavy':
      return cutWavy(a ?? 2, b ?? 2, rng);
  }
}

/**
 * Rewrite the numbers of an absolute M/L/C/A/Z path: `x → x·sx + dx`,
 * `y → y·sy + dy` (arc radii scale, flags and rotation are kept). Used to turn
 * a unit-square piece into pixels, local to its bounding box.
 */
export function scalePath(path: string, sx: number, sy: number, dx = 0, dy = 0): string {
  const tokens = path.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let out = '';
  const isNum = (): boolean => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i] as string);
  const num = (): number => Number(tokens[i++]);
  const xy = (): string => `${fmt(num() * sx + dx)} ${fmt(num() * sy + dy)}`;
  while (i < tokens.length) {
    const cmd = tokens[i++] as string;
    const parts: string[] = [];
    switch (cmd) {
      case 'M':
      case 'L':
        while (isNum()) parts.push(xy());
        break;
      case 'C':
        while (isNum()) parts.push(`${xy()} ${xy()} ${xy()}`);
        break;
      case 'A':
        while (isNum()) {
          const rx = fmt(num() * Math.abs(sx));
          const ry = fmt(num() * Math.abs(sy));
          const rot = fmt(num());
          const large = fmt(num());
          const sweep = fmt(num());
          parts.push(`${rx} ${ry} ${rot} ${large} ${sweep} ${xy()}`);
        }
        break;
      case 'Z':
        break;
      default:
        throw new Error(`scalePath: unsupported command ${cmd}`);
    }
    out += cmd + parts.join(' ');
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Rounds and pictures.
 * ------------------------------------------------------------------------- */

export interface JigsawRound {
  item: Item;
  /** Pastel picture background, one of `PICTURE_BGS`. */
  bg: string;
  cut: Cut;
  /** Tray order (shuffled): every piece of `cut` exactly once. */
  pieces: CutPiece[];
}

export const PICTURE_BGS: readonly string[] = ['#fecaca', '#fde68a', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8'];

/** Everything that can be a picture: animals, vehicles and fruits. */
export const PICTURES: readonly Item[] = [...ANIMALS, ...VEHICLES, ...FRUITS];

/** Fraction of the picture side taken by the emoji. */
export const EMOJI_SCALE = 0.72;

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export function makeJigsawRound(round: number, rng: () => number = Math.random, excludeEmoji?: string): JigsawRound {
  const pool = PICTURES.filter((i) => i.emoji !== excludeEmoji);
  const item = pool[randInt(0, pool.length - 1, rng)];
  if (!item) throw new Error('jigsaw: nothing to draw');
  const bg = PICTURE_BGS[randInt(0, PICTURE_BGS.length - 1, rng)] ?? '#fde68a';
  const cut = makeCut(levelFor(round, rng), rng);
  return { item, bg, cut, pieces: shuffle(cut.pieces, rng) };
}

/**
 * Paint the picture on an offscreen `size`×`size` canvas: a radial gradient from
 * white to `bg` with the emoji centred on it, and return it as a PNG data URL.
 * `null` when no 2d context is available (jsdom).
 */
export function renderPicture(emoji: string, size: number, bg: string): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const mid = size / 2;
  const g = c.createRadialGradient(mid, mid * 0.9, size * 0.05, mid, mid, size * 0.72);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, bg);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  // Solid fill: with a gradient fillStyle WebKit renders the emoji as a flat mask, not in colour.
  c.fillStyle = '#000';
  c.font = `${Math.round(size * EMOJI_SCALE)}px ${EMOJI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0, 0, 0, 0.22)';
  c.shadowBlur = size * 0.04;
  c.shadowOffsetY = size * 0.02;
  c.fillText(emoji, mid, mid + size * 0.02);
  return canvas.toDataURL('image/png');
}

/**
 * Paint a family photo on a square `size`×`size` canvas (white behind, cropped
 * like `object-fit: cover`) and return it as a JPEG data URL. `null` when there
 * is no 2d context or the image cannot be decoded; never throws. The context is
 * checked before the image is requested: jsdom fires neither load nor error.
 */
export async function renderPhotoPicture(url: string, size: number): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return null;
  try {
    const img = await loadImage(url);
    c.fillStyle = '#fff';
    c.fillRect(0, 0, size, size);
    drawCover(c, img, size, size);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}

/**
 * Width of a tray piece: the largest scale (≤ 1) of a `slotW`×`slotH` cell so
 * that `n` such pieces, wrapped into rows with `gap` between them, fit inside a
 * `trayW`×`trayH` box. The height follows from the cell's aspect ratio.
 */
export function trayPieceWidth(n: number, slotW: number, slotH: number, trayW: number, trayH: number, gap: number): number {
  if (n <= 0 || slotW <= 0 || slotH <= 0) return 0;
  let best = 0;
  for (let perRow = 1; perRow <= n; perRow++) {
    const rows = Math.ceil(n / perRow);
    const wMax = (trayW - (perRow - 1) * gap) / perRow;
    const hMax = (trayH - (rows - 1) * gap) / rows;
    const s = Math.min(1, wMax / slotW, hMax / slotH);
    if (s > best) best = s;
  }
  return slotW * best;
}
