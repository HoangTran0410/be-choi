import { BLEND_UNITS, legAt, legMix, roadY, slotX, type Biome, type Road, type Weather } from './logic';

/**
 * The backdrop: sky, hills, tarmac and verge. It knows nothing about the job in
 * hand — only where the camera is, what time it is, and which part of the world
 * the road is passing through. Every colour comes from the biome, and every
 * change of biome is drawn as a gradient across the fork so there is no seam.
 */
export interface Scene {
  road: Road;
  camX: number;
  clock: number;
  /** 0 in broad daylight, 1 at night. */
  dusk: number;
}

export interface Palette {
  skyTop: string;
  skyMid: string;
  skyLow: string;
  /** The three ranges behind the road, far to near. */
  far: string;
  mid: string;
  near: string;
  grass: string;
  blade: readonly [string, string];
  bloom: readonly [string, string];
  road: string;
  kerb: string;
  dash: string;
  leaf: readonly [string, string];
  trunk: string;
  /** Verge seeds above this flower. A field of flowers sets it low. */
  blooms: number;
  /** How much of the ground behind the road is wooded, 0 … 1. */
  thicket: number;
  /** Snow lies on everything and the verge has drifts, not blades. */
  snowy: boolean;
  /** The far range is the sea. */
  sea: boolean;
  /** The far range is a skyline of blocks. */
  city: boolean;
}

const PALETTES: Readonly<Record<Biome, Palette>> = {
  meadow: {
    skyTop: '#7dd3fc',
    skyMid: '#bae6fd',
    skyLow: '#e0f2fe',
    far: '#a5d8f3',
    mid: '#bbf7d0',
    near: '#86efac',
    grass: '#86efac',
    blade: ['#22c55e', '#16a34a'],
    bloom: ['#fef08a', '#fda4af'],
    road: '#57534e',
    kerb: '#e7e5e4',
    dash: '#fde047',
    leaf: ['#22c55e', '#16a34a'],
    trunk: '#78350f',
    blooms: 0.82,
    thicket: 0.16,
    snowy: false,
    sea: false,
    city: false,
  },
  forest: {
    skyTop: '#93c5fd',
    skyMid: '#bfdbfe',
    skyLow: '#dcfce7',
    far: '#93b8c8',
    mid: '#4d9d6d',
    near: '#3f9c5e',
    grass: '#4ade80',
    blade: ['#15803d', '#166534'],
    bloom: ['#fef3c7', '#c4b5fd'],
    road: '#4b4640',
    kerb: '#e7e5e4',
    dash: '#fde047',
    leaf: ['#15803d', '#166534'],
    trunk: '#5b2c0c',
    blooms: 0.82,
    thicket: 0.8,
    snowy: false,
    sea: false,
    city: false,
  },
  seaside: {
    skyTop: '#38bdf8',
    skyMid: '#7dd3fc',
    skyLow: '#fef9c3',
    far: '#0ea5e9',
    mid: '#fde68a',
    near: '#fcd34d',
    grass: '#fde68a',
    blade: ['#a3e635', '#65a30d'],
    bloom: ['#fb7185', '#fff'],
    road: '#6b6357',
    kerb: '#fff7ed',
    dash: '#fde047',
    leaf: ['#4ade80', '#22c55e'],
    trunk: '#a16207',
    blooms: 0.82,
    thicket: 0.1,
    snowy: false,
    sea: true,
    city: false,
  },
  town: {
    skyTop: '#a5b4fc',
    skyMid: '#cbd5e1',
    skyLow: '#f1f5f9',
    far: '#94a3b8',
    mid: '#cbd5e1',
    near: '#bef264',
    grass: '#a3e635',
    blade: ['#65a30d', '#4d7c0f'],
    bloom: ['#f9a8d4', '#fde047'],
    road: '#44403c',
    kerb: '#f5f5f4',
    dash: '#fef08a',
    leaf: ['#4d7c0f', '#3f6212'],
    trunk: '#57534e',
    blooms: 0.82,
    thicket: 0.0,
    snowy: false,
    sea: false,
    city: true,
  },
  snow: {
    skyTop: '#bae6fd',
    skyMid: '#dbeafe',
    skyLow: '#f8fafc',
    far: '#c7d2fe',
    mid: '#e2e8f0',
    near: '#f1f5f9',
    grass: '#f8fafc',
    blade: ['#cbd5e1', '#e2e8f0'],
    bloom: ['#fff', '#bfdbfe'],
    road: '#6b7280',
    kerb: '#f8fafc',
    dash: '#fbbf24',
    leaf: ['#cbd5e1', '#e5e7eb'],
    trunk: '#57534e',
    blooms: 1.1,
    thicket: 0.34,
    snowy: true,
    sea: false,
    city: false,
  },
  // A whole valley under blossom: pink hills, pink trees, and a verge that is
  // more flower than grass.
  blossom: {
    skyTop: '#a5c8f5',
    skyMid: '#dbeafe',
    skyLow: '#fdf2f8',
    far: '#c4b5e8',
    mid: '#f7c8dd',
    near: '#9ae6b4',
    grass: '#b7ebc4',
    blade: ['#4ade80', '#22c55e'],
    bloom: ['#f472b6', '#fda4af'],
    road: '#6b6357',
    kerb: '#fff1f2',
    dash: '#fde047',
    leaf: ['#f9a8d4', '#fbcfe8'],
    trunk: '#7c4a21',
    blooms: 0.32,
    thicket: 0.5,
    snowy: false,
    sea: false,
    city: false,
  },
  // Deep, wet and green, with the light coming through the canopy.
  jungle: {
    skyTop: '#5eb8e0',
    skyMid: '#a5e8dd',
    skyLow: '#ecfdf5',
    far: '#7fb99b',
    mid: '#2f8f52',
    near: '#1f7a3f',
    grass: '#2f9e4f',
    blade: ['#14532d', '#166534'],
    bloom: ['#fb923c', '#fde047'],
    road: '#4a463d',
    kerb: '#e7e5e4',
    dash: '#fde047',
    leaf: ['#15803d', '#14532d'],
    trunk: '#422006',
    blooms: 0.62,
    thicket: 1.0,
    snowy: false,
    sea: false,
    city: false,
  },
  // Late in the year: amber trees, gold light and leaves coming down.
  autumn: {
    skyTop: '#93c5fd',
    skyMid: '#dbeafe',
    skyLow: '#fef3c7',
    far: '#c9b8a4',
    mid: '#f5c977',
    near: '#d9e88f',
    grass: '#e2ecb0',
    blade: ['#ca8a04', '#a16207'],
    bloom: ['#f59e0b', '#fb7185'],
    road: '#5c5449',
    kerb: '#fef3c7',
    dash: '#fde047',
    leaf: ['#f97316', '#ea580c'],
    trunk: '#78350f',
    blooms: 0.7,
    thicket: 0.6,
    snowy: false,
    sea: false,
    city: false,
  },
};

/**
 * Emoji are drawn as text, so they take the fill that happens to be set — and a
 * road gradient or a half-transparent puddle wash left behind by the last thing
 * drawn turns them into ghosts. Always go through here: it sets an opaque ink.
 */
export function glyph(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  g.fillStyle = '#0f172a';
  g.font = `${size}px system-ui`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

/** A rounded box, falling back to a square one where `roundRect` is missing. */
export function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

export function paletteOf(biome: Biome): Palette {
  return PALETTES[biome];
}

/** The palette right where the camera is looking, halfway blended across a fork. */
export function paletteAt(scene: Scene): Palette {
  const { leg, before, k } = legMix(scene.road, scene.camX + scene.road.w * 0.5);
  const a = PALETTES[before.biome];
  const b = PALETTES[leg.biome];
  if (a === b || k >= 1) return b;
  return {
    ...b,
    skyTop: mix(a.skyTop, b.skyTop, k),
    skyMid: mix(a.skyMid, b.skyMid, k),
    skyLow: mix(a.skyLow, b.skyLow, k),
    snowy: k > 0.5 ? b.snowy : a.snowy,
    sea: k > 0.5 ? b.sea : a.sea,
    city: k > 0.5 ? b.city : a.city,
  };
}

/** The palette at one spot on the road, for a tree or a house standing there. */
export function paletteFor(road: Road, x: number): Palette {
  return PALETTES[legAt(road, x).biome];
}

function chan(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

/** Blend two `#rrggbb` colours. Used only for the sky, a few times a frame. */
export function mix(a: string, b: string, t: number): string {
  const to = (i: number): number => Math.round(chan(a, i) + (chan(b, i) - chan(a, i)) * t);
  return `#${[0, 1, 2].map((i) => to(i).toString(16).padStart(2, '0')).join('')}`;
}

/** Darken a colour towards night, so one palette serves both. */
export function dim(hex: string, dusk: number): string {
  return dusk <= 0 ? hex : mix(hex, '#131a3a', dusk * 0.72);
}

/**
 * A left-to-right fill for anything that runs the width of the screen. Each leg
 * in view contributes its own colour and the changeover is a gradient, so the
 * grass turns to sand over a car's length instead of all at once.
 */
export function bandFill(g: CanvasRenderingContext2D, scene: Scene, pick: (p: Palette) => string): string | CanvasGradient {
  const { road, camX, dusk } = scene;
  const shade = (biome: Biome): string => dim(pick(PALETTES[biome]), dusk);
  const span = road.unit * BLEND_UNITS;
  const first = legAt(road, camX);
  const grad = g.createLinearGradient(0, 0, road.w, 0);
  if (typeof grad?.addColorStop !== 'function') return shade(first.biome);
  grad.addColorStop(0, shade(first.biome));
  let prev = first;
  for (const leg of road.legs) {
    const x0 = slotX(road, leg.from);
    if (x0 + span <= camX) {
      prev = leg;
      continue;
    }
    if (x0 >= camX + road.w) break;
    grad.addColorStop(Math.max(0, Math.min(1, (x0 - camX) / road.w)), shade(prev.biome));
    grad.addColorStop(Math.max(0, Math.min(1, (x0 + span - camX) / road.w)), shade(leg.biome));
    prev = leg;
  }
  grad.addColorStop(1, shade(prev.biome));
  return grad;
}

// ---- sky ----

export function drawSky(g: CanvasRenderingContext2D, scene: Scene, p: Palette): void {
  const { road, dusk, clock } = scene;
  const sky = g.createLinearGradient(0, 0, 0, road.h);
  sky.addColorStop(0, dim(p.skyTop, dusk));
  sky.addColorStop(0.6, dim(p.skyMid, dusk));
  sky.addColorStop(1, dim(p.skyLow, dusk));
  g.fillStyle = sky;
  g.fillRect(0, 0, road.w, road.h);

  if (dusk > 0.35) {
    // Stars come out where the sky is darkest, fixed in place so they twinkle rather than drift.
    g.fillStyle = `rgba(255,255,255,${((dusk - 0.35) * 1.2).toFixed(2)})`;
    for (let i = 0; i < 40; i++) {
      const sx = (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1;
      const sy = (((Math.sin(i * 78.233) * 12345.6789) % 1) + 1) % 1;
      const twinkle = 0.6 + Math.sin(clock * 2 + i) * 0.4;
      g.beginPath();
      g.arc(sx * road.w, sy * road.h * 0.5, road.unit * 0.018 * twinkle, 0, Math.PI * 2);
      g.fill();
    }
  }

  // One light in the sky: the sun by day, the moon by night, crossing over at dusk.
  // It hangs on the left, because the right-hand corner is where the buttons are.
  const x = road.w * 0.2;
  const y = road.h * 0.14;
  const r = road.unit * 0.55;
  if (dusk < 0.75) {
    g.globalAlpha = 1 - dusk / 0.75;
    g.fillStyle = '#fef9c3';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(x, y, r * 0.72, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  if (dusk > 0.25) {
    g.globalAlpha = (dusk - 0.25) / 0.75;
    g.fillStyle = '#f8fafc';
    g.beginPath();
    g.arc(x, y, r * 0.62, 0, Math.PI * 2);
    g.fill();
    // A bite out of one side turns the disc into a crescent.
    g.fillStyle = dim(p.skyTop, scene.dusk);
    g.beginPath();
    g.arc(x + r * 0.3, y - r * 0.16, r * 0.56, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.arc(x + r * 0.9, y - r * 0.35, r * 0.75, 0, Math.PI * 2);
  g.arc(x + r * 1.7, y, r * 0.6, 0, Math.PI * 2);
  g.arc(x + r * 0.85, y + r * 0.3, r * 0.8, 0, Math.PI * 2);
  g.fill();
}

export function drawClouds(g: CanvasRenderingContext2D, scene: Scene, weather: Weather): void {
  const { road, camX, dusk } = scene;
  const heavy = weather === 'rain' || weather === 'snow';
  g.fillStyle = heavy ? dim('#94a3b8', dusk * 0.6) : dim('#ffffff', dusk * 0.55);
  g.globalAlpha = heavy ? 0.92 : 0.9;
  const span = road.unit * 3.4;
  const shift = camX * 0.12;
  const first = Math.floor((shift - span) / span);
  for (let i = first; i < first + Math.ceil(road.w / span) + 3; i++) {
    const wobble = Math.sin(i * 2.7) * 0.5 + 0.5;
    const drift = Math.sin(i * 5.1) * 0.5 + 0.5;
    cloud(g, i * span - shift, road.h * (0.04 + wobble * 0.34), road.unit * (0.34 + drift * (heavy ? 0.5 : 0.36)));
  }
  g.globalAlpha = 1;
}

/** Two or three birds by day; fireflies drifting over the verge by night. */
export function drawBirds(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX, clock, dusk } = scene;
  if (dusk > 0.6) {
    for (let i = 0; i < 9; i++) {
      const x = ((Math.sin(i * 91.7) * 0.5 + 0.5) * road.w + Math.sin(clock * 0.6 + i) * road.unit * 0.7) % road.w;
      const y = road.h * 0.5 + Math.sin(i * 3.1) * road.h * 0.16 + Math.cos(clock * 0.9 + i * 2) * road.unit * 0.3;
      const glow = 0.35 + Math.abs(Math.sin(clock * 2.4 + i * 1.7)) * 0.65;
      g.fillStyle = `rgba(253,224,71,${(glow * (dusk - 0.6) * 2.5).toFixed(2)})`;
      g.beginPath();
      g.arc(x, y, road.unit * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  g.strokeStyle = `rgba(71,85,105,${(0.5 * (1 - dusk)).toFixed(2)})`;
  g.lineWidth = Math.max(1.5, road.unit * 0.035);
  const cycle = road.w + road.unit * 2;
  for (let i = 0; i < 3; i++) {
    const drift = (clock * road.unit * 0.35 + camX * 0.06 + (i * cycle) / 3) % cycle;
    const x = road.w + road.unit - drift;
    const y = road.h * (0.16 + i * 0.075) + Math.sin(clock * 0.9 + i) * road.unit * 0.08;
    const flap = Math.sin(clock * 5 + i * 2) * road.unit * 0.07;
    const wing = road.unit * 0.16;
    g.beginPath();
    g.moveTo(x - wing, y - flap);
    g.quadraticCurveTo(x - wing * 0.4, y + wing * 0.25, x, y);
    g.quadraticCurveTo(x + wing * 0.4, y + wing * 0.25, x + wing, y - flap);
    g.stroke();
  }
}

// ---- the ground ----

/** Rolling hills behind the road: three rows, the far one paler and slower. */
export function drawHills(g: CanvasRenderingContext2D, scene: Scene, depth: number, pick: (p: Palette) => string, lift: number): void {
  const { road, camX } = scene;
  const shift = camX * depth;
  const base = road.ground + road.unit * 0.1;
  // Hills are measured in units, but a wide short screen has big units and a low
  // horizon: without this cap the far range swallows the sky whole.
  const rise = Math.min(lift * road.unit, road.ground * 0.62);
  g.fillStyle = bandFill(g, scene, pick);
  g.beginPath();
  g.moveTo(0, road.h);
  for (let x = 0; x <= road.w; x += 12) {
    const wx = (x + shift) / (road.unit * 6);
    const y = base - rise * (1.1 + Math.sin(wx) * 0.45 + Math.sin(wx * 2.3 + 1.2) * 0.2);
    g.lineTo(x, y);
  }
  g.lineTo(road.w, road.h);
  g.closePath();
  g.fill();
}

/** A flat sea with a glitter on it, in place of the far hills at the coast. */
export function drawSea(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX, clock, dusk } = scene;
  const top = road.ground - road.unit * 1.5;
  const water = g.createLinearGradient(0, top, 0, road.ground + road.unit * 0.2);
  water.addColorStop(0, dim('#0ea5e9', dusk));
  water.addColorStop(1, dim('#7dd3fc', dusk));
  g.fillStyle = water;
  g.fillRect(0, top, road.w, road.ground - top + road.unit * 0.2);
  g.strokeStyle = `rgba(255,255,255,${(0.5 * (1 - dusk * 0.6)).toFixed(2)})`;
  g.lineWidth = Math.max(1, road.unit * 0.028);
  const span = road.unit * 1.2;
  const shift = camX * 0.1;
  for (let row = 0; row < 5; row++) {
    const y = top + road.unit * (0.25 + row * 0.28);
    for (let i = -1; i < road.w / span + 2; i++) {
      const x = i * span - ((shift + row * 40 + clock * road.unit * 0.1) % span);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + span * 0.16, y - road.unit * 0.05, x + span * 0.32, y);
      g.stroke();
    }
  }
}

/** A skyline of flats and offices, in place of the far hills in town. */
export function drawSkyline(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX, dusk } = scene;
  const shift = camX * 0.18;
  const span = road.unit * 1.1;
  const first = Math.floor((shift - span) / span);
  for (let i = first; i < first + Math.ceil(road.w / span) + 3; i++) {
    const seed = (((Math.sin(i * 17.13) * 43758.5453) % 1) + 1) % 1;
    const hgt = road.unit * (1.1 + seed * 2.1);
    const x = i * span - shift;
    const y = road.ground + road.unit * 0.1 - hgt;
    g.fillStyle = dim(seed > 0.5 ? '#94a3b8' : '#a8b3c2', dusk * 0.8);
    g.fillRect(x, y, span * 0.86, hgt);
    // Windows: lit at night, plain glass by day.
    const rows = Math.max(2, Math.floor(hgt / (road.unit * 0.4)));
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < 2; cIdx++) {
        const on = (((Math.sin((i * 31 + r * 7 + cIdx) * 12.9898) * 43758.5453) % 1) + 1) % 1 > 0.45;
        g.fillStyle = dusk > 0.45 && on ? '#fde68a' : dim('#cbd5e1', dusk);
        g.fillRect(x + span * (0.18 + cIdx * 0.36), y + road.unit * (0.16 + r * 0.4), span * 0.2, road.unit * 0.2);
      }
    }
  }
}

/** The verge under the tarmac: it follows the road so the road never floats. */
export function drawGround(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX } = scene;
  g.fillStyle = bandFill(g, scene, (p) => p.grass);
  g.beginPath();
  g.moveTo(0, road.h);
  for (let x = 0; x <= road.w; x += 8) g.lineTo(x, roadY(road, camX + x) - road.unit * 0.06);
  g.lineTo(road.w, road.h);
  g.closePath();
  g.fill();
}

export function drawRoad(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX } = scene;
  const thickness = road.unit * 0.62;
  g.fillStyle = bandFill(g, scene, (p) => p.road);
  g.beginPath();
  for (let x = 0; x <= road.w; x += 8) g.lineTo(x, roadY(road, camX + x));
  for (let x = road.w; x >= 0; x -= 8) g.lineTo(x, roadY(road, camX + x) + thickness);
  g.closePath();
  g.fill();
  g.strokeStyle = bandFill(g, scene, (p) => p.kerb);
  g.lineWidth = Math.max(1, road.unit * 0.035);
  g.beginPath();
  for (let x = 0; x <= road.w; x += 8) g.lineTo(x, roadY(road, camX + x) + road.unit * 0.07);
  g.stroke();
  // Dashes down the middle, at fixed world positions so they scroll with the road.
  const gap = road.unit * 1.1;
  const first = Math.floor(camX / gap) - 1;
  g.strokeStyle = bandFill(g, scene, (p) => p.dash);
  g.lineWidth = Math.max(2, road.unit * 0.05);
  g.lineCap = 'round';
  for (let i = first; i < first + Math.ceil(road.w / gap) + 3; i++) {
    const wx = i * gap;
    const y = roadY(road, wx) + thickness * 0.6;
    g.beginPath();
    g.moveTo(wx - camX - gap * 0.16, y);
    g.lineTo(wx - camX + gap * 0.16, y + Math.sin(wx / road.unit) * road.unit * 0.02);
    g.stroke();
  }
  g.lineCap = 'butt';
}

/**
 * A wood behind the road. The roadside props stand five units apart, which is
 * two or three to a screen — not enough for a forest to look like one. These are
 * scenery only: small, close together, and drawn on the slope behind the tarmac
 * so the trees a child can actually prod still stand in front of them.
 */
export function drawThicket(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX, clock, dusk } = scene;
  const gap = road.unit * 0.62;
  const first = Math.floor(camX / gap) - 1;
  const depth = 0.82;
  for (let i = first; i < first + Math.ceil(road.w / (gap * depth)) + 3; i++) {
    const wx = i * gap;
    const seed = Math.abs(Math.sin(i * 45.233) * 43758.5453) % 1;
    const p = paletteFor(road, wx);
    if (seed > p.thicket) continue;
    const x = (wx - camX) * depth + road.w * (1 - depth) * 0.5;
    const base = roadY(road, wx) - road.unit * (0.5 + seed * 0.45);
    const u = road.unit * (0.5 + seed * 0.45);
    const sway = Math.sin(clock * 0.8 + i) * u * 0.02;
    g.fillStyle = dim(p.trunk, dusk * 0.85);
    g.fillRect(x - u * 0.05, base - u * 0.4, u * 0.1, u * 0.4);
    // One shade up, one shade down: a wood the colour of the hill behind it is
    // a hill with sticks in it, so neither leaf colour is used as it comes.
    const canopy = seed > 0.5 ? mix(p.leaf[0], '#ffffff', 0.16) : mix(p.leaf[1], '#0b1f14', 0.14);
    g.fillStyle = dim(canopy, dusk * 0.85);
    if (p.snowy || p.thicket >= 0.8) {
      // Firs and jungle canopies alike read better as a cone at this size.
      g.beginPath();
      g.moveTo(x + sway, base - u * 1.35);
      g.lineTo(x + sway - u * 0.38, base - u * 0.28);
      g.lineTo(x + sway + u * 0.38, base - u * 0.28);
      g.closePath();
      g.fill();
    } else {
      g.beginPath();
      g.arc(x + sway, base - u * 0.72, u * 0.44, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Grass and daisies in front of the tarmac, so the bottom of the screen is not bare. */
export function drawVerge(g: CanvasRenderingContext2D, scene: Scene): void {
  const { road, camX, clock, dusk } = scene;
  const gap = road.unit * 0.52;
  const first = Math.floor(camX / gap) - 1;
  for (let i = first; i < first + Math.ceil(road.w / gap) + 3; i++) {
    const wx = i * gap;
    const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = roadY(road, wx) + road.unit * (0.78 + seed * 0.9) + road.h * 0.05;
    if (y > road.h + road.unit) continue;
    const x = wx - camX + seed * gap * 0.6;
    const p = paletteFor(road, wx);
    const blade = road.unit * (0.16 + seed * 0.14);
    if (p.snowy) {
      // A drift instead of a tuft, and nothing flowers up here.
      g.fillStyle = dim(seed > 0.5 ? '#ffffff' : '#eef2f7', dusk);
      g.beginPath();
      g.ellipse(x, y, blade * 1.5, blade * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    const sway = Math.sin(clock * 1.4 + i) * blade * 0.12;
    g.strokeStyle = dim(seed > 0.5 ? p.blade[0] : p.blade[1], dusk);
    g.lineWidth = Math.max(1.5, road.unit * 0.03);
    g.lineCap = 'round';
    for (const lean of [-0.35, 0, 0.35]) {
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + lean * blade, y - blade * 0.6, x + lean * blade * 2 + sway, y - blade);
      g.stroke();
    }
    g.lineCap = 'butt';
    if (seed > p.blooms) {
      const petal = blade * (p.blooms < 0.5 ? 0.3 : 0.22);
      g.fillStyle = dim(seed > (p.blooms + 1) / 2 ? p.bloom[1] : p.bloom[0], dusk);
      g.beginPath();
      g.arc(x + blade * 0.7 + sway, y - blade * 1.05, petal, 0, Math.PI * 2);
      g.fill();
      // A field of flowers gets a yellow middle, so it reads as a flower.
      if (p.blooms < 0.5) {
        g.fillStyle = dim('#fde047', dusk);
        g.beginPath();
        g.arc(x + blade * 0.7 + sway, y - blade * 1.05, petal * 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

// ---- weather ----

/**
 * Rain or snow across the whole screen, at `strength` 0 … 1 so it can come on
 * and go off as the road runs from one part of the world into the next.
 */
export function drawWeather(g: CanvasRenderingContext2D, scene: Scene, weather: Weather, strength: number): void {
  if (strength <= 0.02 || (weather !== 'rain' && weather !== 'snow')) return;
  const { road, clock, camX } = scene;
  const drops = Math.round((weather === 'rain' ? 90 : 70) * strength);
  if (weather === 'rain') {
    g.strokeStyle = `rgba(191,219,254,${(0.55 * strength).toFixed(2)})`;
    g.lineWidth = Math.max(1, road.unit * 0.022);
    const len = road.unit * 0.42;
    for (let i = 0; i < drops; i++) {
      const seed = (((Math.sin(i * 45.233) * 43758.5453) % 1) + 1) % 1;
      const speed = 1.6 + seed * 0.8;
      const x = (((seed * 3.1 + i * 0.137) * road.w + clock * road.unit * 1.2) % (road.w + len * 2)) - len;
      const y = ((seed * road.h + clock * road.h * speed * 0.42) % (road.h + len)) - len;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - len * 0.3, y + len);
      g.stroke();
    }
    return;
  }
  g.fillStyle = `rgba(255,255,255,${(0.85 * strength).toFixed(2)})`;
  for (let i = 0; i < drops; i++) {
    const seed = (((Math.sin(i * 33.71) * 43758.5453) % 1) + 1) % 1;
    const fall = 0.1 + seed * 0.1;
    const x =
      ((((seed * 5.7 + i * 0.211) * road.w + Math.sin(clock * 0.7 + i) * road.unit * 0.7 - camX * 0.05) % road.w) + road.w) % road.w;
    const y = (seed * road.h + clock * road.h * fall) % road.h;
    g.beginPath();
    g.arc(x, y, road.unit * (0.025 + seed * 0.03), 0, Math.PI * 2);
    g.fill();
  }
}

/** Places where something is always coming down off the trees. */
const DRIFTS: Partial<Record<Biome, readonly [string, string]>> = {
  blossom: ['#f9a8d4', '#fbcfe8'],
  autumn: ['#f97316', '#fbbf24'],
};

/**
 * Petals over the blossom valley, leaves over the autumn woods: nothing to do
 * and nothing in the way, just something moving in a place worth sitting in.
 */
export function drawDrift(g: CanvasRenderingContext2D, scene: Scene, biome: Biome, strength: number): void {
  const colours = DRIFTS[biome];
  if (!colours || strength <= 0.02) return;
  const { road, clock, camX, dusk } = scene;
  const count = Math.round(34 * strength);
  for (let i = 0; i < count; i++) {
    const seed = (((Math.sin(i * 27.31) * 43758.5453) % 1) + 1) % 1;
    const fall = 0.055 + seed * 0.05;
    const sway = Math.sin(clock * (0.7 + seed) + i) * road.unit * 0.55;
    const x = ((((seed * 7.3 + i * 0.173) * road.w + sway - camX * 0.28) % road.w) + road.w) % road.w;
    const y = (seed * road.h + clock * road.h * fall) % road.h;
    g.save();
    g.translate(x, y);
    g.rotate(clock * (0.9 + seed) + i);
    g.fillStyle = dim(colours[seed > 0.5 ? 0 : 1], dusk);
    g.globalAlpha = strength;
    g.beginPath();
    g.ellipse(0, 0, road.unit * 0.055, road.unit * 0.028, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
}

/** Which drifting place the road is in, easing across the fork like everything else. */
export function driftNow(scene: Scene): { biome: Biome; strength: number } {
  const { leg, before, k } = legMix(scene.road, scene.camX + scene.road.w * 0.5);
  if (DRIFTS[leg.biome]) return { biome: leg.biome, strength: k };
  if (DRIFTS[before.biome]) return { biome: before.biome, strength: 1 - k };
  return { biome: leg.biome, strength: 0 };
}

/** How much rain or snow is falling here, easing in as the road enters a wetter place. */
export function weatherNow(scene: Scene): { weather: Weather; strength: number } {
  const { leg, before, k } = legMix(scene.road, scene.camX + scene.road.w * 0.5);
  const wet = (w: Weather): boolean => w === 'rain' || w === 'snow';
  if (wet(leg.weather)) return { weather: leg.weather, strength: k };
  if (wet(before.weather)) return { weather: before.weather, strength: 1 - k };
  return { weather: leg.weather, strength: 0 };
}

// ---- night ----

/** A soft round hole punched in the darkness, so a beam has no hard edge anywhere. */
export interface Glow {
  x: number;
  y: number;
  r: number;
  /** 0 … 1: how much of the dark it lifts. */
  strength: number;
}

/**
 * Night as one layer over the finished picture. The dark is built on a canvas of
 * its own and the lights are erased out of *it*, never out of the road — punching
 * holes straight into the scene would rub out the car along with the shadow.
 */
export function makeNight(): {
  draw(g: CanvasRenderingContext2D, scene: Scene, glows: readonly Glow[]): void;
} {
  const layer = document.createElement('canvas');
  return {
    draw(g, scene, glows) {
      const { road, dusk } = scene;
      if (dusk <= 0.01 || !road.w || !road.h) return;
      if (layer.width !== Math.round(road.w) || layer.height !== Math.round(road.h)) {
        layer.width = Math.round(road.w);
        layer.height = Math.round(road.h);
      }
      const n = layer.getContext('2d');
      if (!n) return;
      n.setTransform(1, 0, 0, 1, 0, 0);
      n.globalCompositeOperation = 'source-over';
      n.clearRect(0, 0, road.w, road.h);
      n.fillStyle = 'rgba(9,16,48,0.82)';
      n.fillRect(0, 0, road.w, road.h);
      n.globalCompositeOperation = 'destination-out';
      for (const glow of glows) {
        if (glow.r <= 0) continue;
        const hole = n.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r);
        if (typeof hole?.addColorStop !== 'function') continue;
        hole.addColorStop(0, `rgba(0,0,0,${glow.strength})`);
        hole.addColorStop(0.55, `rgba(0,0,0,${glow.strength * 0.62})`);
        hole.addColorStop(1, 'rgba(0,0,0,0)');
        n.fillStyle = hole;
        n.beginPath();
        n.arc(glow.x, glow.y, glow.r, 0, Math.PI * 2);
        n.fill();
      }
      n.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.min(1, dusk);
      g.drawImage(layer, 0, 0, road.w, road.h);
      g.globalAlpha = 1;
    },
  };
}

/** A headlight beam, as a chain of soft blobs down the road ahead of the car. */
export function beamGlows(x: number, y: number, unit: number, facing: number, reach = 5): Glow[] {
  const out: Glow[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    out.push({
      x: x + facing * unit * reach * t,
      y: y - unit * 0.1 + unit * 0.12 * t,
      r: unit * (0.5 + t * 1.15),
      strength: 0.95 - t * 0.45,
    });
  }
  return out;
}
