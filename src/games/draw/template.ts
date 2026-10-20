/**
 * "Vẽ theo mẫu": how much of a faint template the child's own lines have covered.
 * Pure — no DOM. Nothing here can be wrong: lines far from the template just don't
 * count, and the template only ever gets brighter.
 */
import { makePath, pointAt, sampleTrack, type Pt } from '../trace/logic';
import type { Picture } from '../trace/shapes';

/** Distance between the sample points along a stroke (unit coordinates). */
export const SPACING = 0.03;
/** Share of a stroke that has to be covered for it to count as drawn. */
export const STROKE_DONE = 0.8;

export interface TemplateStroke {
  samples: Pt[];
  lit: boolean[];
  litCount: number;
  color: string;
  done: boolean;
}

export interface TemplateState {
  strokes: TemplateStroke[];
}

export function makeTemplate(pic: Picture, spacing = SPACING): TemplateState {
  return {
    strokes: pic.strokes.map((s) => {
      const path = makePath(sampleTrack(s.segs));
      const n = Math.max(2, Math.ceil(path.total / spacing));
      const samples: Pt[] = [];
      for (let i = 0; i <= n; i++) samples.push(pointAt(path, (path.total * i) / n));
      return { samples, lit: samples.map(() => false), litCount: 0, color: s.color, done: false };
    }),
  };
}

/** Squared distance from `p` to the segment a–b. */
export function distToSegment2(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const qx = a.x + t * dx - p.x;
  const qy = a.y + t * dy - p.y;
  return qx * qx + qy * qy;
}

export interface Touched {
  /** Sample points newly lit. */
  lit: number;
  /** Indexes of strokes that just reached STROKE_DONE. */
  finished: number[];
}

/** The child drew from `from` (null: a dot) to `to`: light every sample within `tol` of that line. */
export function touchTemplate(tpl: TemplateState, from: Pt | null, to: Pt, tol: number): Touched {
  const a = from ?? to;
  const tol2 = tol * tol;
  let lit = 0;
  const finished: number[] = [];
  tpl.strokes.forEach((s, i) => {
    let added = 0;
    for (let k = 0; k < s.samples.length; k++) {
      if (s.lit[k]) continue;
      if (distToSegment2(s.samples[k]!, a, to) <= tol2) {
        s.lit[k] = true;
        added++;
      }
    }
    if (!added) return;
    s.litCount += added;
    lit += added;
    if (!s.done && s.litCount / s.samples.length >= STROKE_DONE) {
      s.done = true;
      finished.push(i);
    }
  });
  return { lit, finished };
}

export function strokeCoverage(s: TemplateStroke): number {
  return s.samples.length === 0 ? 1 : s.litCount / s.samples.length;
}

/** 0 … 1: how bright a stroke of the template is (faint until half covered, full when drawn). */
export function brightness(s: TemplateStroke): number {
  if (s.done) return 1;
  return Math.min(1, strokeCoverage(s) / STROKE_DONE);
}

export function drawnCount(tpl: TemplateState): number {
  return tpl.strokes.filter((s) => s.done).length;
}

export function templateDone(tpl: TemplateState): boolean {
  return tpl.strokes.length > 0 && tpl.strokes.every((s) => s.done);
}

/** Share of strokes drawn, 0 … 1: how much of the colour-in help to show. */
export function progressOf(tpl: TemplateState): number {
  return tpl.strokes.length === 0 ? 1 : drawnCount(tpl) / tpl.strokes.length;
}

/** Index of the stroke to point at: the one nearest to done that is not, else the first unfinished. */
export function nextToDraw(tpl: TemplateState): number {
  let best = -1;
  let bestCov = -1;
  tpl.strokes.forEach((s, i) => {
    if (s.done) return;
    const c = strokeCoverage(s);
    if (c > bestCov) {
      bestCov = c;
      best = i;
    }
  });
  return best;
}

/** Finish everything (used when the picture is revealed). */
export function completeAll(tpl: TemplateState): void {
  for (const s of tpl.strokes) {
    s.lit.fill(true);
    s.litCount = s.samples.length;
    s.done = true;
  }
}
