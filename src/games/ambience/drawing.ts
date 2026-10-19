/** A child's crayon drawing that sketches itself onto the sky. */
import { rand } from './scene-data';
import { doodle, type Pt } from './doodles';
import type { Ctx } from './context';

/**
 * Crayon drawing: a child's picture draws itself — a sun, a house, a fish, a
 * stick figure, a scribble (doodles.ts) — a stroke at a time with the crayon at
 * the tip, the line wobbling as a small hand's does. It stays a moment, fades,
 * and another picture in another colour starts somewhere else.
 */
export interface Drawn {
  strokes: { pts: Pt[]; hue: number }[];
  /** Points in all strokes together: how far the crayon has to go. */
  total: number;
  /** Seconds the drawing takes. */
  draw: number;
  life: number;
  width: number;
  cx: number;
  cy: number;
}

export function place(c: Ctx): Drawn {
  const { W, H, U } = c;
  const d = doodle(Math.random, c.lastDoodle);
  c.lastDoodle = d.name;
  const size = U() * rand(0.1, 0.18);
  // Somewhere clear: of a handful of spots, the one furthest from the pictures
  // already up, so a new one is not drawn over the last.
  let cx = 0;
  let cy = 0;
  let best = -1;
  for (let i = 0; i < 8; i++) {
    const x = rand(0.18, 0.82) * W;
    const y = rand(0.22, 0.62) * H;
    const room = Math.min(Infinity, ...c.drawings.map((o) => Math.hypot(o.cx - x, o.cy - y)));
    if (room > best) [best, cx, cy] = [room, x, y];
  }
  const tilt = rand(-0.3, 0.3);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const hue = rand(0, 360);
  const seed = rand(0, 100);
  let total = 0;
  const strokes = d.strokes.map((st, si) => {
    // Fill long straight segments with points, so the line can be drawn out bit by
    // bit and wobble along its length instead of only at its corners.
    const pts: Pt[] = [];
    for (let i = 0; i < st.pts.length; i++) {
      const [x1, y1] = st.pts[i]!;
      const prev = st.pts[i - 1];
      const steps = prev ? Math.max(1, Math.ceil(Math.hypot(x1 - prev[0], y1 - prev[1]) / 0.08)) : 1;
      for (let j = prev ? 1 : 0; j <= steps; j++) {
        const t = prev ? j / steps : 1;
        const x = prev ? prev[0] + (x1 - prev[0]) * t : x1;
        const y = prev ? prev[1] + (y1 - prev[1]) * t : y1;
        const n = pts.length + si * 31 + seed;
        const wx = x + Math.sin(n * 0.9) * 0.025 + Math.sin(n * 2.3) * 0.012;
        const wy = y + Math.cos(n * 1.1) * 0.025;
        pts.push([cx + (wx * cos - wy * sin) * size, cy + (wx * sin + wy * cos) * size]);
        if (!prev) break;
      }
    }
    total += pts.length;
    return { pts, hue: (hue + st.hueShift) % 360 };
  });
  return { strokes, total, draw: Math.min(3, 0.9 + total * 0.018), life: 0, width: Math.max(2.5, size * 0.07), cx, cy };
}

export function drawDrawing(c: Ctx, dt: number): void {
  const { g, L, U, drawEmoji, every, drawings } = c;
  if (!g) return;
  const k = L('drawing');
  if (every('drawing', dt, 1.6, 2.8) && drawings.length < 3) drawings.push(place(c));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    d.life += dt;
    const fade = d.life < d.draw + 3.5 ? 1 : 1 - (d.life - d.draw - 3.5);
    if (fade <= 0) {
      drawings.splice(i, 1);
      continue;
    }
    let left = Math.floor(Math.min(1, d.life / d.draw) * d.total);
    let tip: Pt | null = null;
    g.lineWidth = d.width;
    for (const st of d.strokes) {
      if (left <= 0) break;
      const n = Math.min(left, st.pts.length);
      left -= n;
      g.strokeStyle = `hsla(${st.hue},85%,52%,${fade * Math.max(k, 0.2)})`;
      g.beginPath();
      for (let j = 0; j < n; j++) {
        const [px, py] = st.pts[j]!;
        if (j) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      // A one-point stroke (a dot for an eye) still needs to show.
      if (n === 1) g.lineTo(st.pts[0]![0] + 0.1, st.pts[0]![1]);
      g.stroke();
      tip = st.pts[n - 1] ?? tip;
    }
    if (tip && d.life < d.draw) drawEmoji('🖍️', tip[0] + U() * 0.02, tip[1] - U() * 0.02, U() * 0.06, { alpha: k });
  }
}
