/**
 * The pictures the crayon draws in Bé tạo cảnh: what a small child draws — a sun, a
 * house, a flower, a smiling face, a fish — plus the odd free scribble. Each is a
 * few strokes (pen down, pen up) in a box from -1 to 1; the scene places, sizes,
 * tilts and wobbles them, and draws them a stroke at a time.
 */

export type Pt = [number, number];
export interface Stroke {
  pts: Pt[];
  /** Colour relative to the drawing's own: 0 is the same crayon, anything else another. */
  hueShift: number;
}
export interface Doodle {
  name: string;
  strokes: Stroke[];
}

const TAU = Math.PI * 2;

function circle(cx: number, cy: number, r: number, n = 28, from = 0, to = TAU): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

const line = (...pts: Pt[]): Pt[] => pts;
const s = (pts: Pt[], hueShift = 0): Stroke => ({ pts, hueShift });

type Maker = (rng: () => number) => Stroke[];

const MAKERS: Record<string, Maker> = {
  sun: () => {
    const rays: Stroke[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      rays.push(s(line([Math.cos(a) * 0.55, Math.sin(a) * 0.55], [Math.cos(a) * 0.9, Math.sin(a) * 0.9])));
    }
    return [s(circle(0, 0, 0.42)), ...rays];
  },
  house: () => [
    s(line([-0.6, 0.9], [-0.6, 0], [0.6, 0], [0.6, 0.9], [-0.6, 0.9])),
    s(line([-0.75, 0.05], [0, -0.65], [0.75, 0.05]), 120),
    s(line([-0.15, 0.9], [-0.15, 0.45], [0.15, 0.45], [0.15, 0.9]), 200),
    s(line([0.3, 0.2], [0.5, 0.2], [0.5, 0.4], [0.3, 0.4], [0.3, 0.2]), 200),
  ],
  flower: () => {
    const petals: Stroke[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      petals.push(s(circle(Math.cos(a) * 0.3, -0.35 + Math.sin(a) * 0.3, 0.18, 16)));
    }
    return [
      s(circle(0, -0.35, 0.14, 14), 60),
      ...petals,
      s(line([0, -0.1], [0.02, 0.9]), 140),
      s(line([0.02, 0.5], [0.35, 0.3], [0.1, 0.55]), 140),
    ];
  },
  star: () => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const r = i % 2 ? 0.38 : 0.9;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return [s(pts)];
  },
  heart: () => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * TAU;
      pts.push([(16 * Math.sin(t) ** 3) / 18, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 18]);
    }
    return [s(pts)];
  },
  smiley: () => [
    s(circle(0, 0, 0.85)),
    s(circle(-0.3, -0.25, 0.08, 10), 200),
    s(circle(0.3, -0.25, 0.08, 10), 200),
    s(circle(0, 0.05, 0.45, 16, 0.2 * Math.PI, 0.8 * Math.PI), 320),
  ],
  cloud: () => [
    s([
      ...circle(-0.45, 0.1, 0.3, 12, Math.PI * 0.5, Math.PI * 1.6),
      ...circle(0, -0.15, 0.4, 14, Math.PI * 1.1, Math.PI * 1.95),
      ...circle(0.45, 0.1, 0.3, 12, Math.PI * 1.4, Math.PI * 2.5),
      [-0.45, 0.4],
    ]),
  ],
  tree: () => [
    s(line([-0.12, 0.9], [-0.1, 0.1], [0.1, 0.1], [0.12, 0.9]), 30),
    s([...circle(0, -0.25, 0.5, 24)], 100),
    s(circle(-0.2, -0.3, 0.07, 8), 0),
    s(circle(0.2, -0.1, 0.07, 8), 0),
  ],
  fish: () => [
    s([...circle(-0.1, 0, 0.6, 24, -Math.PI * 0.75, Math.PI * 0.75)]),
    s(line([0.3, -0.35], [0.85, -0.45], [0.7, 0], [0.85, 0.45], [0.3, 0.35])),
    s(circle(-0.4, -0.12, 0.07, 8), 200),
    s(line([-0.15, -0.2], [-0.05, 0], [-0.15, 0.2]), 40),
  ],
  person: () => [
    s(circle(0, -0.6, 0.25, 16)),
    s(line([0, -0.35], [0, 0.35])),
    s(line([-0.45, -0.1], [0, -0.15], [0.45, -0.1])),
    s(line([-0.35, 0.9], [0, 0.35], [0.35, 0.9])),
    s(circle(0, -0.62, 0.12, 10, 0.2 * Math.PI, 0.8 * Math.PI), 320),
  ],
  rainbow: () => [0.85, 0.7, 0.55, 0.4].map((r, i) => s(circle(0, 0.5, r, 24, Math.PI, TAU), i * 60)),
  balloon: () => [s([...circle(0, -0.35, 0.45, 24), [0, 0.1]]), s(line([0, 0.1], [0.08, 0.35], [-0.06, 0.6], [0.05, 0.9]), 200)],
  car: () => [
    s(line([-0.9, 0.35], [-0.9, 0], [-0.45, 0], [-0.3, -0.35], [0.35, -0.35], [0.5, 0], [0.9, 0], [0.9, 0.35], [-0.9, 0.35])),
    s(circle(-0.5, 0.4, 0.18, 14), 200),
    s(circle(0.5, 0.4, 0.18, 14), 200),
    s(line([-0.2, -0.3], [-0.2, 0], [0.3, 0], [0.3, -0.3]), 180),
  ],
  boat: () => [
    s(line([-0.85, 0.25], [0.85, 0.25], [0.55, 0.6], [-0.55, 0.6], [-0.85, 0.25])),
    s(line([0, 0.25], [0, -0.85]), 40),
    s(line([0, -0.8], [0.6, 0.1], [0, 0.1]), 180),
    s(line([-0.95, 0.8], [-0.6, 0.72], [-0.3, 0.8], [0, 0.72], [0.3, 0.8], [0.6, 0.72], [0.95, 0.8]), 200),
  ],
  mountains: () => [
    s(line([-0.95, 0.6], [-0.45, -0.4], [-0.1, 0.2], [0.35, -0.7], [0.95, 0.6])),
    s(line([0.2, -0.4], [0.35, -0.7], [0.5, -0.4]), 200),
    s(circle(-0.65, -0.7, 0.15, 12), 50),
  ],
  cat: () => [
    s([...circle(0, 0.05, 0.6, 24, -Math.PI * 0.35, Math.PI * 1.35)]),
    s(line([-0.5, -0.25], [-0.45, -0.8], [-0.1, -0.55], [0.1, -0.55], [0.45, -0.8], [0.5, -0.25])),
    s(circle(-0.22, -0.05, 0.06, 8), 200),
    s(circle(0.22, -0.05, 0.06, 8), 200),
    s(line([-0.6, 0.1], [-0.2, 0.15]), 320),
    s(line([0.6, 0.1], [0.2, 0.15]), 320),
  ],
  scribble: (rng) => {
    // A free scribble: a wandering line that doubles back, loops or zigzags at random.
    const pts: Pt[] = [];
    let x = (rng() - 0.5) * 0.6;
    let y = (rng() - 0.5) * 0.6;
    let a = rng() * TAU;
    let turn = (rng() - 0.5) * 0.8;
    for (let i = 0; i < 70; i++) {
      if (rng() < 0.12) turn = (rng() - 0.5) * 1.2;
      a += turn;
      x = Math.max(-1, Math.min(1, x + Math.cos(a) * 0.07));
      y = Math.max(-1, Math.min(1, y + Math.sin(a) * 0.07));
      pts.push([x, y]);
    }
    return [s(pts)];
  },
};

export const DOODLE_NAMES: readonly string[] = Object.keys(MAKERS);

/** One picture, picked at random but never the same twice running. */
export function doodle(rng: () => number = Math.random, not?: string): Doodle {
  const names = DOODLE_NAMES.filter((n) => n !== not);
  const name = names[Math.floor(rng() * names.length)] ?? 'scribble';
  return { name, strokes: MAKERS[name]!(rng) };
}
