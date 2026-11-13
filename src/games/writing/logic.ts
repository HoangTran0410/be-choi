import { advance, bezier, makePath, pointAt, toleranceFor, type Cubic, type Path, type Pt } from '../trace/logic';
import { loadVersioned, saveVersioned } from '../../core/save';

export { toleranceFor, type Pt, type Path };

/**
 * Letters are written in "x-height units": x runs 0 … width, y runs 0 (x-height line, top of
 * a small letter) … 1 (baseline); an ascender reaches -0.5. `toPaper` maps that onto the unit
 * square of the 4-line paper (lines at .09 / .34 / .59 / .84, a small letter fills the two lower gaps).
 */
export const LINES = [0.09, 0.34, 0.59, 0.84] as const;
export const XH = 0.5;
const TOP = LINES[1];

export type Stroke = readonly Pt[];

const p = (x: number, y: number): Pt => ({ x, y });

function cubic(a: Pt, b: Pt, c: Pt, d: Pt, n = 24): Pt[] {
  const c4: Cubic = [a, b, c, d];
  return Array.from({ length: n + 1 }, (_, i) => bezier(c4, i / n));
}

/** Ellipse arc, angles in degrees on screen (0 = right, 90 = down). Decreasing angle = counter-clockwise. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Pt[] {
  const n = Math.max(8, Math.ceil(Math.abs(to - from) / 8));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return p(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  });
}

function line(a: Pt, b: Pt, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => p(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n));
}

/** Join pieces end to end (drop the duplicated joint). */
function join(...parts: Pt[][]): Pt[] {
  return parts.flatMap((part, i) => (i === 0 ? part : part.slice(1)));
}

export interface LetterDef {
  ch: string;
  /** How the letter sounds, written so the Vietnamese voice reads it right. */
  say: string;
  word: string;
  emoji: string;
  /** Width in x-height units. */
  width: number;
  strokes: readonly Stroke[];
}

// ---- shapes shared by several letters -----------------------------------------------------
const BOWL_W = 0.85;
const bowl = (): Pt[] => arc(BOWL_W / 2, 0.5, BOWL_W / 2, 0.5, -45, -405);
const bowlC = (): Pt[] => arc(BOWL_W / 2, 0.5, BOWL_W / 2, 0.5, -45, -320);
const stick = (x: number): Pt[] => line(p(x, 0), p(x, 1));
const caret = (cx: number): Pt[] => join(line(p(cx - 0.2, -0.08), p(cx, -0.3), 5), line(p(cx, -0.3), p(cx + 0.2, -0.08), 5));
const breve = (cx: number): Pt[] => cubic(p(cx - 0.22, -0.32), p(cx - 0.12, -0.05), p(cx + 0.12, -0.05), p(cx + 0.22, -0.32), 12);
const hook = (x: number): Pt[] => cubic(p(x - 0.05, 0.28), p(x + 0.1, 0.25), p(x + 0.18, 0.1), p(x + 0.18, -0.12), 10);
const uCup = (): Pt[] =>
  join(cubic(p(0.1, 0), p(0.1, 0.7), p(0.2, 1), p(0.4, 1)), cubic(p(0.4, 1), p(0.55, 1), p(0.7, 0.85), p(0.7, 0.1)));
const eBody = (): Pt[] => join(line(p(0, 0.5), p(BOWL_W, 0.5)), arc(BOWL_W / 2, 0.5, BOWL_W / 2, 0.5, 0, -320));

export const LETTERS: readonly LetterDef[] = [
  { ch: 'o', say: 'o', word: 'ong', emoji: '🐝', width: BOWL_W, strokes: [bowl()] },
  { ch: 'c', say: 'cờ', word: 'cá', emoji: '🐟', width: BOWL_W, strokes: [bowlC()] },
  { ch: 'a', say: 'a', word: 'áo', emoji: '👕', width: BOWL_W + 0.1, strokes: [bowl(), stick(0.95)] },
  {
    ch: 'i',
    say: 'i',
    word: 'im',
    emoji: '🤫',
    width: 0.5,
    strokes: [join(line(p(0.1, 0), p(0.1, 0.78)), cubic(p(0.1, 0.78), p(0.1, 1), p(0.3, 1.02), p(0.42, 0.88), 8)), [p(0.1, -0.3), p(0.1, -0.24)]],
  },
  {
    ch: 't',
    say: 'tờ',
    word: 'táo',
    emoji: '🍎',
    width: 0.8,
    strokes: [join(line(p(0.3, -0.4), p(0.3, 0.8)), cubic(p(0.3, 0.8), p(0.3, 1), p(0.5, 1.02), p(0.7, 0.88), 8)), line(p(0, 0.02), p(0.62, 0.02), 8)],
  },
  {
    ch: 'l',
    say: 'lờ',
    word: 'lá',
    emoji: '🍃',
    width: 0.8,
    strokes: [
      join(
        cubic(p(0.02, 0.9), p(0.1, 0.2), p(0.2, -0.5), p(0.36, -0.5)),
        cubic(p(0.36, -0.5), p(0.55, -0.5), p(0.42, 0.45), p(0.42, 0.85)),
        cubic(p(0.42, 0.85), p(0.42, 1), p(0.6, 1.02), p(0.76, 0.9), 8),
      ),
    ],
  },
  { ch: 'u', say: 'u', word: 'ủng', emoji: '🥾', width: 0.8, strokes: [uCup(), stick(0.7)] },
  { ch: 'e', say: 'e', word: 'em bé', emoji: '👶', width: BOWL_W, strokes: [eBody()] },
  {
    ch: 'n',
    say: 'nờ',
    word: 'nấm',
    emoji: '🍄',
    width: 0.8,
    strokes: [stick(0.1), join(cubic(p(0.1, 0.5), p(0.15, -0.08), p(0.68, -0.08), p(0.68, 0.6)), line(p(0.68, 0.6), p(0.68, 1), 8))],
  },
  {
    ch: 'm',
    say: 'mờ',
    word: 'mèo',
    emoji: '🐱',
    width: 1.3,
    strokes: [
      stick(0.1),
      join(cubic(p(0.1, 0.5), p(0.14, -0.08), p(0.55, -0.08), p(0.55, 0.6)), line(p(0.55, 0.6), p(0.55, 1), 8)),
      join(cubic(p(0.55, 0.5), p(0.59, -0.08), p(1, -0.08), p(1, 0.6)), line(p(1, 0.6), p(1, 1), 8)),
    ],
  },
  {
    ch: 'b',
    say: 'bờ',
    word: 'bò',
    emoji: '🐄',
    width: 0.95,
    strokes: [line(p(0.1, -0.5), p(0.1, 1), 24), arc(0.1 + 0.4, 0.5, 0.4, 0.5, 180, 540)],
  },
  { ch: 'đ', say: 'đờ', word: 'đèn', emoji: '💡', width: 1.1, strokes: [bowl(), line(p(0.95, -0.5), p(0.95, 1), 24), line(p(0.65, -0.28), p(1.25, -0.28), 8)] },
  { ch: 'ă', say: 'á', word: 'ăn cơm', emoji: '🍚', width: BOWL_W + 0.1, strokes: [bowl(), stick(0.95), breve(0.5)] },
  { ch: 'â', say: 'ớ', word: 'ấm trà', emoji: '🫖', width: BOWL_W + 0.1, strokes: [bowl(), stick(0.95), caret(0.5)] },
  { ch: 'ê', say: 'ê', word: 'ếch', emoji: '🐸', width: BOWL_W, strokes: [eBody(), caret(0.42)] },
  { ch: 'ô', say: 'ô', word: 'ô tô', emoji: '🚗', width: BOWL_W, strokes: [bowl(), caret(0.42)] },
  { ch: 'ơ', say: 'ơ', word: 'ớt', emoji: '🌶️', width: BOWL_W + 0.2, strokes: [bowl(), hook(0.85)] },
  { ch: 'ư', say: 'ư', word: 'ức gà', emoji: '🍗', width: 0.95, strokes: [uCup(), stick(0.7), hook(0.7)] },
];

export function letterIndex(ch: string): number {
  return LETTERS.findIndex((l) => l.ch === ch);
}

/** Letter-local point to the paper's unit square. */
export function toPaper(pt: Pt, width: number): Pt {
  return { x: 0.5 + (pt.x - width / 2) * XH, y: TOP + pt.y * XH };
}

export interface PlacedStroke {
  path: Path;
  /** Too short to drag along (a dot, a little hook): a touch near it counts. */
  tap: boolean;
}

/** Dots and little marks are touched, not dragged. */
export const TAP_LENGTH = 0.07;

export function placeStrokes(def: LetterDef): PlacedStroke[] {
  return def.strokes.map((s) => {
    const path = makePath(s.map((pt) => toPaper(pt, def.width)));
    return { path, tap: path.total < TAP_LENGTH };
  });
}

/** Width of the line the child follows, in paper units. */
export const ROAD = 0.075;

/** Finger tolerance in px: wide while a child is new to this, narrower once letters are known. */
export function levelFor(done: number): 1 | 2 | 3 {
  return done < 6 ? 1 : done < 12 ? 2 : 3;
}
export function tolFactor(level: number): number {
  return level <= 1 ? 1 : level === 2 ? 0.8 : 0.65;
}
export function tolPx(w: number, h: number, level: number): number {
  return Math.max(40, toleranceFor(w, h) * tolFactor(level));
}

export interface StrokeState {
  progress: number;
  done: boolean;
}

export function newStroke(): StrokeState {
  return { progress: 0, done: false };
}

/**
 * One finger sample on the current stroke. Moves only forward; a point nowhere near does nothing.
 * `tol` is in paper units. A press (`start`) must begin near the stroke's start.
 */
export function stepStroke(placed: PlacedStroke, st: StrokeState, finger: Pt, tol: number, start: boolean): { moved: boolean; done: boolean } {
  if (st.done) return { moved: false, done: true };
  const { path } = placed;
  if (placed.tap) {
    const mid = pointAt(path, path.total / 2);
    if (Math.hypot(mid.x - finger.x, mid.y - finger.y) <= tol * 1.1) {
      st.progress = path.total;
      st.done = true;
      return { moved: true, done: true };
    }
    return { moved: false, done: false };
  }
  if (start && st.progress === 0) {
    const a = path.pts[0]!;
    if (Math.hypot(a.x - finger.x, a.y - finger.y) > tol * 1.3) return { moved: false, done: false };
  }
  const next = advance(path, st.progress, finger, tol, tol * 2.5);
  const moved = next > st.progress;
  st.progress = next;
  if (path.total > 0 && next >= path.total * 0.93) {
    st.progress = path.total;
    st.done = true;
  }
  return { moved, done: st.done };
}

// ---- save ------------------------------------------------------------------------------------
export const SAVE_KEY = 'be-choi:writing';

export interface WritingSave {
  v: 1;
  /** Letters written through to the end at least once. */
  done: string[];
  last: string;
}

export function emptySave(): WritingSave {
  return { v: 1, done: [], last: LETTERS[0]!.ch };
}

export function loadSave(): WritingSave {
  const s = loadVersioned<WritingSave>(SAVE_KEY, {
    current: 1,
    validate: (d) => {
      const done = Array.isArray(d.done) ? (d.done as unknown[]).filter((c): c is string => typeof c === 'string' && letterIndex(c) >= 0) : [];
      const last = typeof d.last === 'string' && letterIndex(d.last) >= 0 ? d.last : LETTERS[0]!.ch;
      return { v: 1, done: [...new Set(done)], last };
    },
  });
  return s ?? emptySave();
}

export function persist(s: WritingSave): void {
  saveVersioned(SAVE_KEY, s, { current: 1 });
}

/** Next letter to offer after `ch`: the next one not yet written, else simply the next. */
export function nextLetter(ch: string, done: readonly string[]): string {
  const n = LETTERS.length;
  const i = Math.max(0, letterIndex(ch));
  for (let k = 1; k <= n; k++) {
    const c = LETTERS[(i + k) % n]!.ch;
    if (!done.includes(c)) return c;
  }
  return LETTERS[(i + 1) % n]!.ch;
}
