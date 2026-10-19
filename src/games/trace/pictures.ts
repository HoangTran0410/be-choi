import type { Cubic, Pt } from './logic';
import { arc, circle, discFill, ellipse, ellipseArc, line, p, polygon, polyline, polyFill, rect, smooth, type Fill, type Picture, type Stroke } from './shapes';

const PI = Math.PI;
const rad = (deg: number): number => (deg * PI) / 180;

/** Points from [x, y] pairs. */
const P = (pairs: ReadonlyArray<readonly [number, number]>): Pt[] => pairs.map(([x, y]) => p(x, y));

const ink = (segs: readonly Cubic[], color: string): Stroke => ({ segs, color });

const bezierAt = (c: Cubic, t: number): Pt => {
  const u = 1 - t;
  const [a, b, d, e] = c;
  return p(
    u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * d.x + t * t * t * e.x,
    u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * d.y + t * t * t * e.y,
  );
};

const isStraight = (c: Cubic): boolean => {
  const [a, b, d, e] = c;
  const cr = (q: Pt) => Math.abs((q.x - a.x) * (e.y - a.y) - (q.y - a.y) * (e.x - a.x));
  return cr(b) < 1e-9 && cr(d) < 1e-9;
};

/** A polygon that follows the given strokes' path exactly, so fills always match the ink. */
const fillOf = (segs: readonly Cubic[], color: string, n = 8): Fill => {
  const pts: Pt[] = [];
  for (const c of segs) {
    const steps = isStraight(c) ? 1 : n;
    for (let i = 0; i < steps; i++) pts.push(bezierAt(c, i / steps));
  }
  return polyFill(pts, color);
};

const arcPts = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(p(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return out;
};

const ovalFill = (cx: number, cy: number, rx: number, ry: number, color: string): Fill => polyFill(arcPts(cx, cy, rx, ry, 0, 2 * PI, 32).slice(0, -1), color);

/** A pointed leaf / petal from `a` to `b`, bulging `w` to both sides. */
function leaf(a: Pt, b: Pt, w: number): Cubic[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * w;
  const ny = (dx / len) * w;
  const at = (t: number, s: number) => p(a.x + dx * t + nx * s, a.y + dy * t + ny * s);
  return [
    [a, at(0.2, 1), at(0.8, 1), b],
    [b, at(0.8, -1), at(0.2, -1), a],
  ];
}

const norm = (a: number, ref: number): number => {
  while (a < ref) a += 2 * PI;
  return a;
};

/** The two points where two circles cross, upper one first. */
function circleHit(a: Pt, ra: number, b: Pt, rb: number): [Pt, Pt] {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const x = (d * d + ra * ra - rb * rb) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - x * x));
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const mx = a.x + ux * x;
  const my = a.y + uy * x;
  const p1 = p(mx - uy * h, my + ux * h);
  const p2 = p(mx + uy * h, my - ux * h);
  return p1.y <= p2.y ? [p1, p2] : [p2, p1];
}

const angleOf = (c: Pt, q: Pt): number => Math.atan2(q.y - c.y, q.x - c.x);

/** A puffy cloud with a flat bottom at `base`, about `w` wide, centred on `cx`. */
function cloud(cx: number, base: number, w: number): Cubic[] {
  const L = { c: p(cx - 0.25 * w, base - 0.1 * w), r: 0.1 * w };
  const M = { c: p(cx - 0.02 * w, base - 0.2 * w), r: 0.2 * w };
  const R = { c: p(cx + 0.24 * w, base - 0.1 * w), r: 0.1 * w };
  const [lm] = circleHit(L.c, L.r, M.c, M.r);
  const [mr] = circleHit(M.c, M.r, R.c, R.r);
  const aLM = norm(angleOf(L.c, lm), PI / 2);
  const aML = angleOf(M.c, lm);
  const aMR = norm(angleOf(M.c, mr), aML);
  const aRM = angleOf(R.c, mr);
  return [
    ...ellipseArc(L.c.x, L.c.y, L.r, L.r, PI / 2, aLM),
    ...ellipseArc(M.c.x, M.c.y, M.r, M.r, aML, aMR),
    ...ellipseArc(R.c.x, R.c.y, R.r, R.r, aRM, norm(PI / 2, aRM)),
    ...line(p(R.c.x, base), p(L.c.x, base)),
  ];
}

/** A star's corner points, first corner pointing up. */
function starPts(cx: number, cy: number, big: number, small: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + (i * PI) / 5;
    const r = i % 2 === 0 ? big : small;
    out.push(p(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return out;
}

const mirrorX = (c: Cubic): Cubic => [p(1 - c[0].x, c[0].y), p(1 - c[1].x, c[1].y), p(1 - c[2].x, c[2].y), p(1 - c[3].x, c[3].y)];
const reverse = (c: Cubic): Cubic => [c[3], c[2], c[1], c[0]];

/* ----------------------------------------------------------------------------------------- */

const sun: Picture = {
  id: 'sun',
  name: 'ông mặt trời',
  icon: '☀️',
  bg: '#e0f2fe',
  strokes: [
    ink(circle(0.5, 0.5, 0.2), '#f59e0b'),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * PI * 2;
      return ink(line(p(0.5 + 0.28 * Math.cos(a), 0.5 + 0.28 * Math.sin(a)), p(0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a))), '#f97316');
    }),
    ink(arc(0.5, 0.52, 0.1, PI * 0.2, PI * 0.8), '#b45309'),
  ],
  fills: [discFill(0.5, 0.5, 0.2, '#fde047')],
};

const house: Picture = (() => {
  const roof = polygon(P([[0.12, 0.46], [0.5, 0.16], [0.88, 0.46]]));
  const body = polyline(P([[0.2, 0.46], [0.2, 0.86], [0.8, 0.86], [0.8, 0.46]]));
  const chimney = polyline(P([[0.67, 0.293], [0.67, 0.12], [0.77, 0.12], [0.77, 0.377]]));
  const door = polyline(P([[0.42, 0.86], [0.42, 0.62], [0.58, 0.62], [0.58, 0.86]]));
  const winL = rect(0.25, 0.56, 0.11, 0.11);
  const winR = rect(0.64, 0.56, 0.11, 0.11);
  return {
    id: 'house',
    name: 'ngôi nhà',
    icon: '🏠',
    bg: '#fff1d6',
    strokes: [ink(body, '#92400e'), ink(roof, '#b91c1c'), ink(chimney, '#7f1d1d'), ink(door, '#78350f'), ink(winL, '#0369a1'), ink(winR, '#0369a1')],
    fills: [
      polyFill(P([[0.67, 0.12], [0.77, 0.12], [0.77, 0.4], [0.67, 0.4]]), '#c2410c'),
      polyFill(P([[0.2, 0.46], [0.8, 0.46], [0.8, 0.86], [0.2, 0.86]]), '#fde68a'),
      fillOf(roof, '#ef4444'),
      polyFill(P([[0.42, 0.62], [0.58, 0.62], [0.58, 0.86], [0.42, 0.86]]), '#a16207'),
      polyFill(P([[0.25, 0.56], [0.36, 0.56], [0.36, 0.67], [0.25, 0.67]]), '#7dd3fc'),
      polyFill(P([[0.64, 0.56], [0.75, 0.56], [0.75, 0.67], [0.64, 0.67]]), '#7dd3fc'),
    ],
  };
})();

const flower: Picture = (() => {
  const cy = 0.35;
  const petalAt = (i: number) => {
    const a = -PI / 2 + (i * 2 * PI) / 5;
    return { x: 0.5 + 0.2 * Math.cos(a), y: cy + 0.2 * Math.sin(a) };
  };
  const petals = [0, 1, 2, 3, 4].map(petalAt);
  const leafL = leaf(p(0.5, 0.85), p(0.26, 0.74), 0.07);
  const leafR = leaf(p(0.5, 0.77), p(0.74, 0.66), 0.07);
  return {
    id: 'flower',
    name: 'bông hoa',
    icon: '🌸',
    bg: '#ecfccb',
    strokes: [
      ink(circle(0.5, cy, 0.08), '#b45309'),
      ...petals.map((c) => ink(circle(c.x, c.y, 0.09), '#db2777')),
      ink(line(p(0.5, cy + 0.08), p(0.5, 0.92)), '#16a34a'),
      ink(leafL, '#15803d'),
      ink(leafR, '#15803d'),
    ],
    fills: [
      fillOf(leafL, '#4ade80'),
      fillOf(leafR, '#4ade80'),
      ...petals.map((c) => discFill(c.x, c.y, 0.09, '#f9a8d4')),
      discFill(0.5, cy, 0.08, '#facc15'),
    ],
  };
})();

const mountain: Picture = (() => {
  const outline = P([[0.06, 0.86], [0.38, 0.26], [0.55, 0.58], [0.72, 0.4], [0.94, 0.86]]);
  const snowPts = P([[0.305, 0.4], [0.35, 0.46], [0.39, 0.4], [0.43, 0.46], [0.454, 0.4]]);
  const snow = polyline(snowPts);
  return {
    id: 'mountain',
    name: 'ngọn núi',
    icon: '⛰️',
    bg: '#d3e5fb',
    strokes: [ink(polygon(outline), '#475569'), ink(snow, '#64748b'), ink(circle(0.8, 0.18, 0.07), '#f59e0b')],
    fills: [discFill(0.8, 0.18, 0.07, '#fde047'), polyFill(outline, '#86a789'), polyFill([p(0.38, 0.26), ...snowPts], '#ffffff')],
  };
})();

/* ---- easy ---- */

const apple: Picture = (() => {
  const T = p(0.5, 0.34);
  const right: Cubic[] = [
    [T, p(0.62, 0.24), p(0.88, 0.28), p(0.89, 0.55)],
    [p(0.89, 0.55), p(0.9, 0.76), p(0.72, 0.9), p(0.58, 0.86)],
    [p(0.58, 0.86), p(0.54, 0.85), p(0.52, 0.84), p(0.5, 0.85)],
  ];
  const left = right.map((c) => reverse(mirrorX(c))).reverse();
  const body: Cubic[] = [...right, ...left];
  const stem = smooth(P([[0.5, 0.345], [0.49, 0.22], [0.53, 0.13]]));
  const lf = leaf(p(0.53, 0.2), p(0.76, 0.12), 0.07);
  return {
    id: 'apple',
    name: 'quả táo',
    icon: '🍎',
    bg: '#dcfce7',
    strokes: [ink(body, '#b91c1c'), ink(stem, '#92400e'), ink(lf, '#15803d')],
    fills: [fillOf(lf, '#4ade80'), fillOf(body, '#ef4444', 10)],
  };
})();

const balloon: Picture = (() => {
  const knot = polygon(P([[0.5, 0.66], [0.45, 0.72], [0.55, 0.72]]));
  return {
    id: 'balloon',
    name: 'quả bóng bay',
    icon: '🎈',
    bg: '#fce7f3',
    strokes: [
      ink(ellipse(0.5, 0.39, 0.23, 0.27), '#e11d48'),
      ink(knot, '#be123c'),
      ink(smooth(P([[0.5, 0.72], [0.45, 0.79], [0.55, 0.86], [0.5, 0.93]])), '#64748b'),
    ],
    fills: [ovalFill(0.5, 0.39, 0.23, 0.27, '#fb7185'), fillOf(knot, '#fb7185')],
  };
})();

const heart: Picture = (() => {
  const T = p(0.5, 0.3);
  const B = p(0.5, 0.87);
  const a: Cubic = [T, p(0.5, 0.14), p(0.9, 0.06), p(0.9, 0.36)];
  const b: Cubic = [p(0.9, 0.36), p(0.9, 0.6), p(0.62, 0.72), B];
  const segs: Cubic[] = [a, b, reverse(mirrorX(b)), reverse(mirrorX(a))];
  return {
    id: 'heart',
    name: 'trái tim',
    icon: '❤️',
    bg: '#ffe4e6',
    strokes: [ink(segs, '#be123c'), ink(arc(0.3, 0.38, 0.1, PI * 1.05, PI * 1.5), '#fda4af')],
    fills: [fillOf(segs, '#f43f5e', 10)],
  };
})();

const star: Picture = (() => {
  const pts = starPts(0.5, 0.55, 0.42, 0.17);
  return {
    id: 'star',
    name: 'ngôi sao',
    icon: '⭐',
    bg: '#fae8ff',
    strokes: [ink(polygon(pts), '#d97706'), ink(arc(0.5, 0.55, 0.09, PI * 0.15, PI * 0.85), '#b45309')],
    fills: [polyFill(pts, '#fde047')],
  };
})();

const cloudPic: Picture = (() => {
  const c = cloud(0.5, 0.62, 1.1);
  const drop = (x: number) => ink(line(p(x, 0.72), p(x - 0.05, 0.88)), '#3b82f6');
  return {
    id: 'cloud',
    name: 'đám mây',
    icon: '☁️',
    bg: '#e6eefc',
    strokes: [ink(c, '#64748b'), drop(0.3), drop(0.5), drop(0.7)],
    fills: [fillOf(c, '#ffffff')],
  };
})();

const tree: Picture = (() => {
  const trunk = polyline(P([[0.43, 0.65], [0.43, 0.88], [0.57, 0.88], [0.57, 0.65]]));
  return {
    id: 'tree',
    name: 'cái cây',
    icon: '🌳',
    bg: '#d9f2ff',
    strokes: [ink(ellipse(0.5, 0.4, 0.28, 0.28), '#15803d'), ink(trunk, '#78350f'), ink(circle(0.4, 0.36, 0.045), '#b91c1c'), ink(circle(0.6, 0.47, 0.045), '#b91c1c')],
    fills: [
      polyFill(P([[0.43, 0.6], [0.57, 0.6], [0.57, 0.88], [0.43, 0.88]]), '#a16207'),
      ovalFill(0.5, 0.4, 0.28, 0.28, '#4ade80'),
      discFill(0.4, 0.36, 0.045, '#ef4444'),
      discFill(0.6, 0.47, 0.045, '#ef4444'),
    ],
  };
})();

const moon: Picture = (() => {
  const c1 = p(0.42, 0.52);
  const r1 = 0.32;
  const c2 = p(0.6, 0.44);
  const r2 = 0.27;
  const [i, j] = circleHit(c1, r1, c2, r2);
  const a1 = angleOf(c1, i);
  const b1 = angleOf(c1, j) - 2 * PI;
  const a2 = angleOf(c2, j);
  const b2 = norm(angleOf(c2, i), a2);
  const crescent = [...ellipseArc(c1.x, c1.y, r1, r1, a1, b1), ...ellipseArc(c2.x, c2.y, r2, r2, a2, b2)];
  const s1 = starPts(0.79, 0.27, 0.12, 0.05);
  const s2 = starPts(0.78, 0.76, 0.1, 0.042);
  return {
    id: 'moon',
    name: 'mặt trăng và ngôi sao',
    icon: '🌙',
    bg: '#e0e7ff',
    strokes: [ink(crescent, '#ca8a04'), ink(polygon(s1), '#d97706'), ink(polygon(s2), '#d97706')],
    fills: [fillOf(crescent, '#fde047', 12), polyFill(s1, '#fcd34d'), polyFill(s2, '#fcd34d')],
  };
})();

const fish: Picture = (() => {
  const cx = 0.4;
  const cy = 0.5;
  const e1 = p(cx + 0.3 * Math.cos(0.4), cy - 0.2 * Math.sin(0.4));
  const e2 = p(cx + 0.3 * Math.cos(0.4), cy + 0.2 * Math.sin(0.4));
  const body = ellipseArc(cx, cy, 0.3, 0.2, 0.4, 2 * PI - 0.4);
  const tailPts = [e1, p(0.92, 0.28), p(0.92, 0.72), e2];
  const finPts = P([[0.42, 0.301], [0.5, 0.18], [0.57, 0.335]]);
  return {
    id: 'fish',
    name: 'con cá',
    icon: '🐟',
    bg: '#cffafe',
    strokes: [ink(body, '#ea580c'), ink(polyline(tailPts), '#ea580c'), ink(polyline(finPts), '#c2410c'), ink(circle(0.24, 0.45, 0.04), '#1e293b'), ink(arc(0.4, 0.5, 0.2, -0.45, 0.45), '#c2410c')],
    fills: [polyFill(tailPts, '#fdba74'), polyFill(finPts, '#fdba74'), fillOf(body, '#fb923c'), discFill(0.24, 0.45, 0.04, '#1e293b')],
  };
})();

const rainbow: Picture = (() => {
  const cy = 0.78;
  const radii = [0.4, 0.33, 0.26, 0.19];
  const cols = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb'];
  const bands = ['#f87171', '#fde047', '#86efac'];
  const clL = cloud(0.24, 0.93, 0.5);
  const clR = cloud(0.76, 0.93, 0.5);
  return {
    id: 'rainbow',
    name: 'cầu vồng',
    icon: '🌈',
    bg: '#e8f4fd',
    strokes: [...radii.map((r, i) => ink(arc(0.5, cy, r, PI, 2 * PI), cols[i]!)), ink(clL, '#64748b'), ink(clR, '#64748b')],
    fills: [
      ...bands.map((c, i) => polyFill([...arcPts(0.5, cy, radii[i]!, radii[i]!, PI, 2 * PI), ...arcPts(0.5, cy, radii[i + 1]!, radii[i + 1]!, 2 * PI, PI)], c)),
      fillOf(clL, '#ffffff'),
      fillOf(clR, '#ffffff'),
    ],
  };
})();

const umbrella: Picture = (() => {
  const R = 0.38;
  const cy = 0.5;
  const sr = (2 * R) / 3 / 2; // scallop radius
  const jx = [0.5 + R - 2 * sr, 0.5 + R - 4 * sr];
  const scallop = (c: number) => ellipseArc(c, cy, sr, 0.07, 0, PI);
  const canopy = [...arc(0.5, cy, R, PI, 2 * PI), ...scallop(0.5 + R - sr), ...scallop(0.5), ...scallop(0.5 - R + sr)];
  const scPts = (c: number, from: 0 | 1) => (from === 0 ? arcPts(c, cy, sr, 0.07, 0, PI, 10) : arcPts(c, cy, sr, 0.07, PI, 0, 10));
  const top = p(0.5, cy - R);
  const handle = [...line(p(0.5, cy + 0.07), p(0.5, 0.82)), ...ellipseArc(0.43, 0.82, 0.07, 0.07, 0, PI)];
  return {
    id: 'umbrella',
    name: 'cái ô',
    icon: '☂️',
    bg: '#ede9fe',
    strokes: [ink(canopy, '#b91c1c'), ink(line(top, p(jx[0]!, cy)), '#b91c1c'), ink(line(top, p(jx[1]!, cy)), '#b91c1c'), ink(handle, '#78350f')],
    fills: [
      polyFill([...arcPts(0.5, cy, R, R, PI, 1.5 * PI, 12), p(jx[1]!, cy), ...scPts(0.5 - R + sr, 1)], '#f87171'),
      polyFill([top, p(jx[0]!, cy), ...scPts(0.5, 0), p(jx[1]!, cy)], '#fde047'),
      polyFill([top, ...arcPts(0.5, cy, R, R, 1.5 * PI, 2 * PI, 12), ...scPts(0.5 + R - sr, 0), p(jx[0]!, cy)], '#f87171'),
    ],
  };
})();

const sailboat: Picture = (() => {
  const hull = polygon(P([[0.14, 0.62], [0.86, 0.62], [0.74, 0.8], [0.26, 0.8]]));
  const sail1 = P([[0.5, 0.14], [0.8, 0.56], [0.5, 0.56]]);
  const sail2 = P([[0.5, 0.26], [0.22, 0.56], [0.5, 0.56]]);
  return {
    id: 'sailboat',
    name: 'chiếc thuyền buồm',
    icon: '⛵',
    bg: '#ccfbf1',
    strokes: [
      ink(hull, '#92400e'),
      ink(line(p(0.5, 0.62), p(0.5, 0.14)), '#78350f'),
      ink(polyline(sail1), '#dc2626'),
      ink(polyline(sail2), '#ca8a04'),
      ink(smooth(P([[0.08, 0.89], [0.22, 0.93], [0.36, 0.89], [0.5, 0.93], [0.64, 0.89], [0.78, 0.93], [0.92, 0.89]])), '#0284c7'),
    ],
    fills: [polyFill(sail1, '#f87171'), polyFill(sail2, '#fde047'), polyFill(P([[0.14, 0.62], [0.86, 0.62], [0.74, 0.8], [0.26, 0.8]]), '#b45309')],
  };
})();

const chick: Picture = (() => {
  const beak = P([[0.44, 0.5], [0.5, 0.6], [0.56, 0.5]]);
  const tuft = P([[0.41, 0.2], [0.45, 0.08], [0.5, 0.18], [0.55, 0.08], [0.59, 0.2]]);
  return {
    id: 'chick',
    name: 'con gà con',
    icon: '🐤',
    bg: '#ffedd5',
    strokes: [
      ink(ellipse(0.5, 0.5, 0.34, 0.32), '#ca8a04'),
      ink(polyline(tuft), '#ca8a04'),
      ink(circle(0.37, 0.42, 0.04), '#1e293b'),
      ink(circle(0.63, 0.42, 0.04), '#1e293b'),
      ink(polygon(beak), '#ea580c'),
      ink(polyline(P([[0.42, 0.83], [0.42, 0.9], [0.35, 0.94]])), '#ea580c'),
      ink(polyline(P([[0.58, 0.83], [0.58, 0.9], [0.65, 0.94]])), '#ea580c'),
    ],
    fills: [ovalFill(0.5, 0.5, 0.34, 0.32, '#fde047'), discFill(0.37, 0.42, 0.04, '#1e293b'), discFill(0.63, 0.42, 0.04, '#1e293b'), polyFill(beak, '#fb923c')],
  };
})();

const car: Picture = (() => {
  const bodyPts = P([[0.08, 0.66], [0.08, 0.52], [0.28, 0.47], [0.38, 0.28], [0.64, 0.28], [0.76, 0.47], [0.92, 0.52], [0.92, 0.66]]);
  const winL = P([[0.35, 0.47], [0.42, 0.34], [0.5, 0.34], [0.5, 0.47]]);
  const winR = P([[0.55, 0.47], [0.55, 0.34], [0.62, 0.34], [0.69, 0.47]]);
  return {
    id: 'car',
    name: 'chiếc xe hơi',
    icon: '🚗',
    bg: '#fdf7b3',
    strokes: [ink(polygon(bodyPts), '#b91c1c'), ink(polygon(winL), '#0369a1'), ink(polygon(winR), '#0369a1'), ink(circle(0.3, 0.68, 0.09), '#334155'), ink(circle(0.7, 0.68, 0.09), '#334155')],
    fills: [
      polyFill(bodyPts, '#ef4444'),
      polyFill(winL, '#bae6fd'),
      polyFill(winR, '#bae6fd'),
      discFill(0.3, 0.68, 0.09, '#475569'),
      discFill(0.7, 0.68, 0.09, '#475569'),
      discFill(0.3, 0.68, 0.035, '#cbd5e1'),
      discFill(0.7, 0.68, 0.035, '#cbd5e1'),
    ],
  };
})();

const butterfly: Picture = (() => {
  const upR = leaf(p(0.55, 0.46), p(0.92, 0.16), 0.15);
  const loR = leaf(p(0.55, 0.54), p(0.84, 0.84), 0.12);
  const mir = (segs: Cubic[]): Cubic[] => segs.map(mirrorX);
  const upL = mir(upR);
  const loL = mir(loR);
  return {
    id: 'butterfly',
    name: 'con bướm',
    icon: '🦋',
    bg: '#fdf0c8',
    strokes: [
      ink(upL, '#7c3aed'),
      ink(upR, '#7c3aed'),
      ink(loL, '#db2777'),
      ink(loR, '#db2777'),
      ink(ellipse(0.5, 0.52, 0.045, 0.2), '#334155'),
      ink(smooth(P([[0.49, 0.32], [0.46, 0.2], [0.4, 0.12]])), '#334155'),
      ink(smooth(P([[0.51, 0.32], [0.54, 0.2], [0.6, 0.12]])), '#334155'),
    ],
    fills: [fillOf(upL, '#c4b5fd'), fillOf(upR, '#c4b5fd'), fillOf(loL, '#f9a8d4'), fillOf(loR, '#f9a8d4'), ovalFill(0.5, 0.52, 0.045, 0.2, '#475569')],
  };
})();

const rocket: Picture = (() => {
  const right: Cubic = [p(0.5, 0.08), p(0.7, 0.2), p(0.67, 0.5), p(0.62, 0.72)];
  const left: Cubic = reverse(mirrorX(right));
  const body: Cubic[] = [right, ...line(p(0.62, 0.72), p(0.38, 0.72)), left];
  const pr = bezierAt(right, 0.62);
  const finLPts = [p(1 - pr.x, pr.y), p(0.2, 0.8), p(0.38, 0.72)];
  const finRPts = [pr, p(0.8, 0.8), p(0.62, 0.72)];
  const flame = P([[0.42, 0.72], [0.5, 0.92], [0.58, 0.72]]);
  return {
    id: 'rocket',
    name: 'tên lửa',
    icon: '🚀',
    bg: '#e4e0fb',
    strokes: [ink(body, '#475569'), ink(circle(0.5, 0.38, 0.075), '#0369a1'), ink(polyline(finLPts), '#b91c1c'), ink(polyline(finRPts), '#b91c1c'), ink(polyline(flame), '#ea580c')],
    fills: [polyFill(flame, '#fbbf24'), polyFill(finLPts, '#ef4444'), polyFill(finRPts, '#ef4444'), fillOf(body, '#f1f5f9'), discFill(0.5, 0.38, 0.075, '#7dd3fc')],
  };
})();

const xmasTree: Picture = (() => {
  const outline = P([[0.5, 0.2], [0.7, 0.42], [0.6, 0.42], [0.78, 0.62], [0.67, 0.62], [0.88, 0.82], [0.12, 0.82], [0.33, 0.62], [0.22, 0.62], [0.4, 0.42], [0.3, 0.42]]);
  const starP = starPts(0.5, 0.14, 0.08, 0.034);
  return {
    id: 'xmas-tree',
    name: 'cây thông Noel',
    icon: '🎄',
    bg: '#d5f5dc',
    strokes: [
      ink(polygon(outline), '#166534'),
      ink(polyline(P([[0.44, 0.82], [0.44, 0.93], [0.56, 0.93], [0.56, 0.82]])), '#78350f'),
      ink(polygon(starP), '#d97706'),
      ink(circle(0.46, 0.54, 0.04), '#b91c1c'),
      ink(circle(0.6, 0.72, 0.04), '#1d4ed8'),
      ink(circle(0.38, 0.74, 0.04), '#ca8a04'),
    ],
    fills: [
      polyFill(P([[0.44, 0.8], [0.56, 0.8], [0.56, 0.93], [0.44, 0.93]]), '#a16207'),
      polyFill(outline, '#22c55e'),
      polyFill(starP, '#fde047'),
      discFill(0.46, 0.54, 0.04, '#ef4444'),
      discFill(0.6, 0.72, 0.04, '#3b82f6'),
      discFill(0.38, 0.74, 0.04, '#facc15'),
    ],
  };
})();

const cat: Picture = (() => {
  const E = (deg: number) => p(0.5 + 0.36 * Math.cos(rad(deg)), 0.58 + 0.28 * Math.sin(rad(deg)));
  const head: Cubic[] = [
    ...polyline([E(205), p(0.16, 0.14), E(245)]),
    ...ellipseArc(0.5, 0.58, 0.36, 0.28, rad(245), rad(295)),
    ...polyline([E(295), p(0.84, 0.14), E(335)]),
    ...ellipseArc(0.5, 0.58, 0.36, 0.28, rad(335), rad(565)),
  ];
  const nose = P([[0.46, 0.57], [0.54, 0.57], [0.5, 0.625]]);
  const mouth = [...ellipseArc(0.455, 0.63, 0.045, 0.045, PI, 0), ...ellipseArc(0.545, 0.63, 0.045, 0.045, PI, 0)];
  return {
    id: 'cat',
    name: 'con mèo',
    icon: '🐱',
    bg: '#fde8cf',
    strokes: [
      ink(head, '#c2410c'),
      ink(circle(0.36, 0.48, 0.045), '#1e293b'),
      ink(circle(0.64, 0.48, 0.045), '#1e293b'),
      ink(polygon(nose), '#be185d'),
      ink(mouth, '#7c2d12'),
      ink(line(p(0.2, 0.6), p(0.34, 0.63)), '#7c2d12'),
      ink(line(p(0.2, 0.72), p(0.34, 0.68)), '#7c2d12'),
      ink(line(p(0.8, 0.6), p(0.66, 0.63)), '#7c2d12'),
      ink(line(p(0.8, 0.72), p(0.66, 0.68)), '#7c2d12'),
    ],
    fills: [fillOf(head, '#fdba74', 10), discFill(0.36, 0.48, 0.045, '#1e293b'), discFill(0.64, 0.48, 0.045, '#1e293b'), polyFill(nose, '#f472b6')],
  };
})();

const duck: Picture = (() => {
  const B = { c: p(0.42, 0.62), r: 0.27 };
  const H = { c: p(0.7, 0.3), r: 0.16 };
  const [hi, hj] = circleHit(B.c, B.r, H.c, H.r);
  // outline: body from the lower junction round the back to the upper one, then the head round the top and down.
  const lower = hj.x > hi.x ? hj : hi;
  const upper = lower === hj ? hi : hj;
  const aB0 = angleOf(B.c, lower);
  const aB1 = norm(angleOf(B.c, upper), aB0);
  const aH0 = angleOf(H.c, upper);
  const aH1 = norm(angleOf(H.c, lower), aH0);
  const outline = [...ellipseArc(B.c.x, B.c.y, B.r, B.r, aB0, aB1), ...ellipseArc(H.c.x, H.c.y, H.r, H.r, aH0, aH1)];
  const beakPts = P([[0.852, 0.25], [0.945, 0.31], [0.844, 0.37]]);
  const tailPts = [p(B.c.x + B.r * Math.cos(rad(-145)), B.c.y + B.r * Math.sin(rad(-145))), p(0.08, 0.4), p(B.c.x + B.r * Math.cos(rad(-170)), B.c.y + B.r * Math.sin(rad(-170)))];
  return {
    id: 'duck',
    name: 'con vịt',
    icon: '🦆',
    bg: '#d6f5ee',
    strokes: [
      ink(outline, '#ca8a04'),
      ink(polyline(beakPts), '#ea580c'),
      ink(circle(0.74, 0.27, 0.035), '#1e293b'),
      ink(arc(0.4, 0.62, 0.13, -0.3, PI * 0.8), '#a16207'),
      ink(polyline(tailPts), '#ca8a04'),
    ],
    fills: [polyFill(beakPts, '#fb923c'), polyFill(tailPts, '#fde047'), fillOf(outline, '#fde047'), discFill(0.74, 0.27, 0.035, '#1e293b')],
  };
})();

const train: Picture = (() => {
  const body = P([[0.1, 0.4], [0.5, 0.4], [0.5, 0.22], [0.88, 0.22], [0.88, 0.68], [0.1, 0.68]]);
  const chimney = P([[0.2, 0.4], [0.19, 0.26], [0.35, 0.26], [0.34, 0.4]]);
  const win = P([[0.6, 0.3], [0.78, 0.3], [0.78, 0.46], [0.6, 0.46]]);
  const wheel = (x: number) => ink(circle(x, 0.74, 0.08), '#334155');
  return {
    id: 'train',
    name: 'xe lửa',
    icon: '🚂',
    bg: '#fee2e2',
    strokes: [
      ink(polygon(body), '#1d4ed8'),
      ink(polyline(chimney), '#334155'),
      ink(polygon(win), '#0369a1'),
      wheel(0.25),
      wheel(0.5),
      wheel(0.75),
      ink(line(p(0.06, 0.82), p(0.94, 0.82)), '#78350f'),
      ink(smooth(P([[0.27, 0.22], [0.31, 0.15], [0.27, 0.09]])), '#94a3b8'),
    ],
    fills: [
      polyFill(chimney, '#475569'),
      polyFill(P([[0.1, 0.4], [0.5, 0.4], [0.5, 0.68], [0.1, 0.68]]), '#60a5fa'),
      polyFill(P([[0.5, 0.22], [0.88, 0.22], [0.88, 0.68], [0.5, 0.68]]), '#f87171'),
      polyFill(win, '#bae6fd'),
      discFill(0.25, 0.74, 0.08, '#475569'),
      discFill(0.5, 0.74, 0.08, '#475569'),
      discFill(0.75, 0.74, 0.08, '#475569'),
    ],
  };
})();

const castle: Picture = (() => {
  const base = P([[0.12, 0.86], [0.12, 0.36], [0.3, 0.36], [0.3, 0.5], [0.7, 0.5], [0.7, 0.36], [0.88, 0.36], [0.88, 0.86]]);
  const roofL = P([[0.1, 0.36], [0.21, 0.14], [0.32, 0.36]]);
  const roofR = P([[0.68, 0.36], [0.79, 0.14], [0.9, 0.36]]);
  const door = [...line(p(0.43, 0.86), p(0.43, 0.68)), ...arc(0.5, 0.68, 0.07, PI, 2 * PI), ...line(p(0.57, 0.68), p(0.57, 0.86))];
  const flag = P([[0.5, 0.3], [0.62, 0.34], [0.5, 0.38]]);
  return {
    id: 'castle',
    name: 'lâu đài',
    icon: '🏰',
    bg: '#f6f3c4',
    strokes: [
      ink(polygon(base), '#6b7280'),
      ink(polyline(roofL), '#b91c1c'),
      ink(polyline(roofR), '#b91c1c'),
      ink(door, '#78350f'),
      ink(rect(0.17, 0.5, 0.08, 0.12), '#475569'),
      ink(rect(0.75, 0.5, 0.08, 0.12), '#475569'),
      ink(line(p(0.5, 0.5), p(0.5, 0.3)), '#78350f'),
      ink(polygon(flag), '#dc2626'),
    ],
    fills: [
      polyFill(base, '#e5e7eb'),
      polyFill(roofL, '#ef4444'),
      polyFill(roofR, '#ef4444'),
      polyFill([...arcPts(0.5, 0.68, 0.07, 0.07, PI, 2 * PI, 10), p(0.57, 0.86), p(0.43, 0.86)], '#a16207'),
      polyFill(P([[0.17, 0.5], [0.25, 0.5], [0.25, 0.62], [0.17, 0.62]]), '#64748b'),
      polyFill(P([[0.75, 0.5], [0.83, 0.5], [0.83, 0.62], [0.75, 0.62]]), '#64748b'),
      polyFill(flag, '#f87171'),
    ],
  };
})();

/**
 * The pictures a child can draw, in the order they come round, roughly easiest first. Strokes are
 * what the finger follows, fills are the colour that appears when the picture is done. Unit square, y down.
 */
export const PICTURES: readonly Picture[] = [
  sun,
  house,
  flower,
  mountain,
  apple,
  balloon,
  heart,
  star,
  cloudPic,
  tree,
  moon,
  fish,
  rainbow,
  umbrella,
  sailboat,
  chick,
  car,
  butterfly,
  rocket,
  xmasTree,
  cat,
  duck,
  train,
  castle,
];
