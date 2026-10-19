import type { Cubic, Pt } from './logic';

/**
 * A picture the child draws is made of strokes (lines to follow) and fills (regions that get
 * colour once it is drawn). Everything is in a unit square, 0 … 1 on both axes, y pointing down;
 * the game fits that square into the stage.
 */
export interface Stroke {
  /** One continuous line, drawn from the first segment's start to the last one's end. */
  segs: readonly Cubic[];
  /** Colour of the ink once drawn. */
  color: string;
}

export interface Fill {
  /** Closed region (the last point joins back to the first). */
  pts: readonly Pt[];
  color: string;
}

export interface Picture {
  id: string;
  /** Vietnamese name, spoken when the picture appears. */
  name: string;
  icon: string;
  /** Pastel paper colour. */
  bg: string;
  strokes: readonly Stroke[];
  fills: readonly Fill[];
}

export const p = (x: number, y: number): Pt => ({ x, y });

/** A straight line as one cubic whose control points sit a third of the way along. */
export function line(a: Pt, b: Pt): Cubic[] {
  return [[a, p(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3), p(a.x + ((b.x - a.x) * 2) / 3, a.y + ((b.y - a.y) * 2) / 3), b]];
}

/** Straight lines joined end to end through `pts`. */
export function polyline(pts: readonly Pt[]): Cubic[] {
  const out: Cubic[] = [];
  for (let i = 1; i < pts.length; i++) out.push(...line(pts[i - 1]!, pts[i]!));
  return out;
}

/** Like `polyline`, but the last point runs back to the first. */
export function polygon(pts: readonly Pt[]): Cubic[] {
  return polyline([...pts, pts[0]!]);
}

/** Axis-aligned rectangle, starting at its top-left corner and running clockwise. */
export function rect(x: number, y: number, w: number, h: number): Cubic[] {
  return polygon([p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)]);
}

/** A circular arc from angle `a0` to `a1` (radians, 0 = right, positive = clockwise on screen), at most a full turn. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): Cubic[] {
  return ellipseArc(cx, cy, r, r, a0, a1);
}

export function ellipseArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Cubic[] {
  const out: Cubic[] = [];
  const sweep = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / n;
  const k = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < n; i++) {
    const s = a0 + step * i;
    const e = s + step;
    const [cs, sn] = [Math.cos(s), Math.sin(s)];
    const [ce, se] = [Math.cos(e), Math.sin(e)];
    out.push([
      p(cx + rx * cs, cy + ry * sn),
      p(cx + rx * (cs - k * sn), cy + ry * (sn + k * cs)),
      p(cx + rx * (ce + k * se), cy + ry * (se - k * ce)),
      p(cx + rx * ce, cy + ry * se),
    ]);
  }
  return out;
}

/** A closed circle starting at its top, running clockwise. */
export function circle(cx: number, cy: number, r: number): Cubic[] {
  return ellipseArc(cx, cy, r, r, -Math.PI / 2, (3 * Math.PI) / 2);
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): Cubic[] {
  return ellipseArc(cx, cy, rx, ry, -Math.PI / 2, (3 * Math.PI) / 2);
}

/** A gentle S-curve through `pts` (Catmull-Rom turned into cubics); good for waves, stems and smoke. */
export function smooth(pts: readonly Pt[]): Cubic[] {
  const out: Cubic[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    out.push([p1, p(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6), p(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6), p2]);
  }
  return out;
}

/** A filled-region helper: a regular polygon approximating a circle. */
export function discFill(cx: number, cy: number, r: number, color: string, sides = 28): Fill {
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push(p(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return { pts, color };
}

export function polyFill(pts: readonly Pt[], color: string): Fill {
  return { pts, color };
}

export function rectFill(x: number, y: number, w: number, h: number, color: string): Fill {
  return polyFill([p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)], color);
}

/** The first and last points of a stroke. */
export function strokeEnds(s: Stroke): [Pt, Pt] {
  return [s.segs[0]![0], s.segs[s.segs.length - 1]![3]];
}
