export interface Pt {
  x: number;
  y: number;
}

/** A cubic Bézier: start, two control points, end (all normalized 0 … 1). */
export type Cubic = readonly [Pt, Pt, Pt, Pt];

const p = (x: number, y: number): Pt => ({ x, y });

/** Hand-made gentle curves, each running from the bee (bottom) to the hive (top). */
export const TRACKS: readonly (readonly Cubic[])[] = [
  [[p(0.2, 0.86), p(0.1, 0.45), p(0.5, 0.1), p(0.82, 0.16)]],
  [[p(0.2, 0.88), p(0.2, 0.5), p(0.8, 0.55), p(0.8, 0.14)]],
  [[p(0.8, 0.88), p(0.1, 0.75), p(0.1, 0.25), p(0.8, 0.12)]],
  [
    [p(0.15, 0.88), p(0.15, 0.6), p(0.5, 0.72), p(0.5, 0.5)],
    [p(0.5, 0.5), p(0.5, 0.28), p(0.85, 0.4), p(0.85, 0.12)],
  ],
  [
    [p(0.5, 0.9), p(0.95, 0.82), p(0.92, 0.4), p(0.55, 0.46)],
    [p(0.55, 0.46), p(0.2, 0.52), p(0.25, 0.12), p(0.62, 0.12)],
  ],
];

export const SAMPLES_PER_SEGMENT = 48;
/** Progress (fraction of the whole length) at which the bee counts as home. */
export const DONE_FRACTION = 0.96;

export function bezier(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}

/** Dense polyline along a track (normalized coordinates). */
export function sampleTrack(segments: readonly Cubic[], perSegment = SAMPLES_PER_SEGMENT): Pt[] {
  const out: Pt[] = [];
  segments.forEach((seg, si) => {
    for (let i = si === 0 ? 0 : 1; i <= perSegment; i++) out.push(bezier(seg, i / perSegment));
  });
  return out;
}

/** Map a normalized point into a `w` × `h` box with a margin; `landscape` swaps the axes so tracks run left to right. */
export function toBox(pt: Pt, w: number, h: number, landscape: boolean, margin = 0.08): Pt {
  const nx = landscape ? 1 - pt.y : pt.x;
  const ny = landscape ? pt.x : pt.y;
  return { x: (margin + nx * (1 - 2 * margin)) * w, y: (margin + ny * (1 - 2 * margin)) * h };
}

/** Cumulative arc length at every point of a polyline. */
export function cumulative(pts: readonly Pt[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return out;
}

export interface Path {
  pts: Pt[];
  cum: number[];
  total: number;
}

export function makePath(pts: Pt[]): Path {
  const cum = cumulative(pts);
  return { pts, cum, total: cum[cum.length - 1] ?? 0 };
}

/** Point at arc length `s` along the path (clamped). */
export function pointAt(path: Path, s: number): Pt {
  const { pts, cum } = path;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return pts[0]!;
  if (s >= path.total) return pts[pts.length - 1]!;
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < s) i++;
  const span = cum[i]! - cum[i - 1]!;
  const t = span === 0 ? 0 : (s - cum[i - 1]!) / span;
  return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * t };
}

/**
 * Where the bee is after the finger touched `finger`. The finger only ever moves the bee
 * forward, and only when it is within `tolerance` of the stretch of path just ahead of the
 * bee (up to `lookahead` long). Anywhere else it does nothing: there is no wrong place.
 */
export function advance(path: Path, progress: number, finger: Pt, tolerance: number, lookahead: number): number {
  let best = progress;
  let bestDist = Infinity;
  const limit = progress + lookahead;
  for (let i = 0; i < path.pts.length; i++) {
    const s = path.cum[i]!;
    if (s < progress - tolerance * 0.5 || s > limit) continue;
    const d = Math.hypot(path.pts[i]!.x - finger.x, path.pts[i]!.y - finger.y);
    if (d <= tolerance && d < bestDist) {
      bestDist = d;
      best = Math.max(progress, s);
    }
  }
  return best;
}

/** Generous tolerance: a fat finger-width of at least 56 px, 14% of the short side. */
export function toleranceFor(w: number, h: number): number {
  return Math.max(56, Math.min(w, h) * 0.14);
}

export function isHome(path: Path, progress: number): boolean {
  return path.total > 0 && progress >= path.total * DONE_FRACTION;
}
