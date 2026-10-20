/**
 * The robots, drawn. One body plan (legs, body, belly panel, two arms, a head) built from small
 * SVG pieces, so every robot is different: its own head shape, antenna, eyes, ears, belly badge,
 * colour — and, above all, the instrument it holds. The moving parts (head, arms, instrument)
 * are separate groups so a dance only has to set three or four `transform` attributes.
 */
import { svgEl } from '../../core/dom';
import type { Pose } from './dance';

export type HeadShape = 'square' | 'round' | 'dome' | 'wide' | 'tall';
export type Antenna = 'ball' | 'bolt' | 'twin' | 'heart' | 'flower' | 'none';
export type Eyes = 'round' | 'big' | 'happy' | 'visor' | 'star';
export type Belly = 'dots' | 'lines' | 'heart' | 'bolt' | 'grid' | 'star';
export type Ears = 'bolts' | 'cups' | 'discs' | 'none';
export type PropKind =
  | 'kick'
  | 'snare'
  | 'tom'
  | 'bass'
  | 'piano'
  | 'guitar'
  | 'xylo'
  | 'bell'
  | 'flute'
  | 'trumpet'
  | 'sax'
  | 'violin'
  | 'shaker'
  | 'cowbell'
  | 'triangle'
  | 'marimba'
  | 'kalimba'
  | 'vibraphone'
  | 'steelpan'
  | 'handpan'
  | 'chime'
  | 'trung'
  | 'harp'
  | 'tranh'
  | 'ukulele'
  | 'banjo'
  | 'cello'
  | 'harmonica'
  | 'accordion'
  | 'organ'
  | 'panpipe'
  | 'tuba'
  | 'conga'
  | 'bongo'
  | 'tambourine'
  | 'maracas'
  | 'castanets'
  | 'mo'
  | 'beatbox'
  | 'timpani'
  | 'gong';

export interface Look {
  head: HeadShape;
  antenna: Antenna;
  eyes: Eyes;
  belly: Belly;
  ears: Ears;
  prop: PropKind;
  /** A light tint for the belly panel and ear caps. */
  accent: string;
}

type Held = 'stick' | 'bell' | 'maraca' | 'bow' | 'none';

interface PropArt {
  /** Resting lift of the left and right arm (degrees, outward positive; negative reaches across). */
  rest: readonly [number, number];
  held: readonly [Held, Held];
  /** Drawn after the head (wind instruments at the mouth) instead of before it. */
  front?: boolean;
  /** SVG for the instrument, in the 120×150 box. */
  draw(color: string, dark: string, accent: string): string;
}

export const VIEW_W = 120;
export const VIEW_H = 150;

const INK = '#1e293b';
const WOOD = '#b7791f';
const WOOD_DARK = '#7c4a12';
const METAL = '#cbd5e1';
const SHOULDER_L = { x: 34, y: 80 };
const SHOULDER_R = { x: 86, y: 80 };
const NECK = { x: 60, y: 62 };
const PROP_PIVOT = { x: 60, y: 100 };

/** `color` mixed with white by `amount` (0 … 1): the light tint of a robot's belly and ears. */
export function tint(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1] as string, 16);
  const c = (v: number) =>
    Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** `color` darkened by `amount` (0 … 1). */
export function shade(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1] as string, 16);
  const f = 1 - amount;
  const c = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

const star = (cx: number, cy: number, r: number, fill: string): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};

const heart = (cx: number, cy: number, s: number, fill: string): string =>
  `<path d="M${cx} ${cy + 5 * s}C${cx - 9 * s} ${cy - 1 * s} ${cx - 5 * s} ${cy - 8 * s} ${cx} ${cy - 3 * s}C${cx + 5 * s} ${cy - 8 * s} ${cx + 9 * s} ${cy - 1 * s} ${cx} ${cy + 5 * s}z" fill="${fill}"/>`;

const bolt = (cx: number, cy: number, s: number, fill: string): string =>
  `<polygon points="${cx + 2 * s},${cy - 8 * s} ${cx - 5 * s},${cy + 1 * s} ${cx - 0.5 * s},${cy + 1 * s} ${cx - 2 * s},${cy + 8 * s} ${cx + 5 * s},${cy - 2 * s} ${cx + 0.5 * s},${cy - 2 * s}" fill="${fill}"/>`;

// ---------------------------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HEADS: Record<HeadShape, Box> = {
  square: { x: 30, y: 18, w: 60, h: 46 },
  round: { x: 28, y: 16, w: 64, h: 48 },
  dome: { x: 30, y: 16, w: 60, h: 48 },
  wide: { x: 24, y: 24, w: 72, h: 40 },
  tall: { x: 34, y: 8, w: 52, h: 56 },
};

function headShape(shape: HeadShape, color: string, dark: string): string {
  const b = HEADS[shape];
  const stroke = `stroke="${dark}" stroke-width="2.5"`;
  switch (shape) {
    case 'round':
      return `<ellipse cx="60" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${color}" ${stroke}/>`;
    case 'dome':
      return `<path d="M${b.x} ${b.y + b.h}V${b.y + 26}A30 26 0 0 1 ${b.x + b.w} ${b.y + 26}V${b.y + b.h}Z" fill="${color}" ${stroke} stroke-linejoin="round"/>`;
    case 'wide':
      return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="18" fill="${color}" ${stroke}/>`;
    case 'tall':
      return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="20" fill="${color}" ${stroke}/>`;
    default:
      return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="13" fill="${color}" ${stroke}/>`;
  }
}

function antennaArt(kind: Antenna, b: Box, accent: string, dark: string): string {
  const top = b.y + (kind === 'twin' ? 2 : 0);
  switch (kind) {
    case 'ball':
      return `<line x1="60" y1="${top}" x2="60" y2="${top - 9}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="${top - 12}" r="5.5" fill="#fde047" stroke="${dark}" stroke-width="2"/>`;
    case 'bolt':
      return `<line x1="60" y1="${top}" x2="60" y2="${top - 6}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>${bolt(60, top - 12, 1.1, '#fde047')}`;
    case 'twin':
      return `<line x1="50" y1="${top + 1}" x2="44" y2="${top - 10}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><line x1="70" y1="${top + 1}" x2="76" y2="${top - 10}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><circle cx="43" cy="${top - 12}" r="4.5" fill="${accent}" stroke="${dark}" stroke-width="2"/><circle cx="77" cy="${top - 12}" r="4.5" fill="${accent}" stroke="${dark}" stroke-width="2"/>`;
    case 'heart':
      return `<line x1="60" y1="${top}" x2="60" y2="${top - 5}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>${heart(60, top - 11, 1.15, '#fb7185')}`;
    case 'flower': {
      const petals = [0, 72, 144, 216, 288]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          return `<circle cx="${(60 + 5.2 * Math.sin(r)).toFixed(1)}" cy="${(top - 13 - 5.2 * Math.cos(r)).toFixed(1)}" r="3.6" fill="#f9a8d4"/>`;
        })
        .join('');
      return `<line x1="60" y1="${top}" x2="60" y2="${top - 8}" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>${petals}<circle cx="60" cy="${top - 13}" r="3" fill="#fde047"/>`;
    }
    default:
      return '';
  }
}

function eyesArt(kind: Eyes, b: Box): string {
  const cy = b.y + b.h * 0.45;
  const mouthY = cy + 13;
  const mouth = `<path d="M53 ${mouthY}Q60 ${mouthY + 6} 67 ${mouthY}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`;
  const cheeks = `<circle cx="42" cy="${cy + 9}" r="4.5" fill="#fb7185" opacity=".45"/><circle cx="78" cy="${cy + 9}" r="4.5" fill="#fb7185" opacity=".45"/>`;
  const plate = `<rect x="${b.x + 6}" y="${b.y + 7}" width="${b.w - 12}" height="${b.h - 14}" rx="${Math.min(14, b.h / 3)}" fill="#fff" opacity=".92"/>`;
  switch (kind) {
    case 'big':
      return `${plate}<circle cx="48" cy="${cy}" r="7.5" fill="${INK}"/><circle cx="72" cy="${cy}" r="7.5" fill="${INK}"/><circle cx="50.5" cy="${cy - 2.5}" r="2.6" fill="#fff"/><circle cx="74.5" cy="${cy - 2.5}" r="2.6" fill="#fff"/>${cheeks}${mouth}`;
    case 'happy':
      return `${plate}<path d="M41 ${cy + 3}Q48 ${cy - 7} 55 ${cy + 3}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M65 ${cy + 3}Q72 ${cy - 7} 79 ${cy + 3}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>${cheeks}<path d="M52 ${mouthY - 1}Q60 ${mouthY + 9} 68 ${mouthY - 1}Z" fill="${INK}"/>`;
    case 'visor':
      return `<rect x="${b.x + 6}" y="${cy - 9}" width="${b.w - 12}" height="18" rx="9" fill="#0f172a"/><circle cx="49" cy="${cy}" r="4.6" fill="#22d3ee"/><circle cx="71" cy="${cy}" r="4.6" fill="#22d3ee"/><circle cx="50.5" cy="${cy - 1.6}" r="1.5" fill="#fff"/><circle cx="72.5" cy="${cy - 1.6}" r="1.5" fill="#fff"/><path d="M53 ${mouthY + 1}Q60 ${mouthY + 7} 67 ${mouthY + 1}" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>`;
    case 'star':
      return `${plate}${star(48, cy, 8, '#f59e0b')}${star(72, cy, 8, '#f59e0b')}${cheeks}${mouth}`;
    default:
      return `${plate}<circle cx="48" cy="${cy}" r="5.4" fill="${INK}"/><circle cx="72" cy="${cy}" r="5.4" fill="${INK}"/><circle cx="49.8" cy="${cy - 1.8}" r="1.8" fill="#fff"/><circle cx="73.8" cy="${cy - 1.8}" r="1.8" fill="#fff"/>${cheeks}${mouth}`;
  }
}

/** Hidden until a family photo is set: a round picture where the face was. */
function photoArt(b: Box, dark: string): string {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) / 2 - 4;
  return (
    `<g class="rb-photo" style="display:none"><clipPath id="rb-face-${look3(b)}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
    `<circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="#fff" stroke="${dark}" stroke-width="2"/>` +
    `<image class="rb-photo-img" href="" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#rb-face-${look3(b)})"/></g>`
  );
}

/** Heads of one shape share a clip circle, so the same id is harmless wherever it repeats. */
function look3(b: Box): string {
  return `${b.x}-${b.y}-${b.w}-${b.h}`;
}

function earsArt(kind: Ears, b: Box, accent: string, dark: string): string {
  const cy = b.y + b.h * 0.5;
  const l = b.x;
  const r = b.x + b.w;
  switch (kind) {
    case 'bolts':
      return `<circle cx="${l - 1}" cy="${cy}" r="4.5" fill="${METAL}" stroke="${dark}" stroke-width="2"/><circle cx="${r + 1}" cy="${cy}" r="4.5" fill="${METAL}" stroke="${dark}" stroke-width="2"/>`;
    case 'cups':
      return `<rect x="${l - 8}" y="${cy - 9}" width="9" height="18" rx="4.5" fill="${accent}" stroke="${dark}" stroke-width="2"/><rect x="${r - 1}" y="${cy - 9}" width="9" height="18" rx="4.5" fill="${accent}" stroke="${dark}" stroke-width="2"/>`;
    case 'discs':
      return `<circle cx="${l - 3}" cy="${cy}" r="7" fill="${accent}" stroke="${dark}" stroke-width="2"/><circle cx="${r + 3}" cy="${cy}" r="7" fill="${accent}" stroke="${dark}" stroke-width="2"/><circle cx="${l - 3}" cy="${cy}" r="2.4" fill="${dark}"/><circle cx="${r + 3}" cy="${cy}" r="2.4" fill="${dark}"/>`;
    default:
      return '';
  }
}

function bellyArt(kind: Belly, accent: string, dark: string): string {
  const panel = `<rect x="44" y="84" width="32" height="30" rx="9" fill="${accent}" stroke="${dark}" stroke-width="2"/>`;
  const ink = shade(dark, 0.1);
  switch (kind) {
    case 'lines':
      return `${panel}<line x1="50" y1="92" x2="70" y2="92" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><line x1="50" y1="99" x2="70" y2="99" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><line x1="50" y1="106" x2="64" y2="106" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
    case 'heart':
      return `${panel}${heart(60, 98, 1.5, '#e11d48')}`;
    case 'bolt':
      return `${panel}${bolt(60, 99, 1.6, '#f59e0b')}`;
    case 'grid':
      return `${panel}<rect x="49" y="89" width="9" height="9" rx="2" fill="${ink}"/><rect x="62" y="89" width="9" height="9" rx="2" fill="#22d3ee"/><rect x="49" y="102" width="9" height="9" rx="2" fill="#f472b6"/><rect x="62" y="102" width="9" height="9" rx="2" fill="${ink}"/>`;
    case 'star':
      return `${panel}${star(60, 99, 10, '#f59e0b')}`;
    default:
      return `${panel}<circle cx="51" cy="99" r="3.6" fill="#ef4444"/><circle cx="60" cy="99" r="3.6" fill="#facc15"/><circle cx="69" cy="99" r="3.6" fill="#22c55e"/>`;
  }
}

// ---------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------

const drumBody = (x: number, y: number, w: number, h: number, color: string, dark: string): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${color}" stroke="${dark}" stroke-width="2.5"/>` +
  `<path d="M${x + 2} ${y + 4}L${x + w * 0.25} ${y + h - 3}L${x + w * 0.5} ${y + 4}L${x + w * 0.75} ${y + h - 3}L${x + w - 2} ${y + 4}" fill="none" stroke="#fff" stroke-width="2" opacity=".75" stroke-linejoin="round"/>` +
  `<ellipse cx="${x + w / 2}" cy="${y}" rx="${w / 2}" ry="${Math.max(4, h * 0.2)}" fill="#f8fafc" stroke="${dark}" stroke-width="2.5"/>`;

const BASE_PROPS: Partial<Record<PropKind, PropArt>> = {
  kick: {
    rest: [-12, -12],
    held: ['stick', 'stick'],
    draw: (c, d) => drumBody(24, 104, 72, 34, c, d) + `<circle cx="60" cy="124" r="9" fill="#fff" opacity=".85"/>${star(60, 124, 7, c)}`,
  },
  snare: {
    rest: [-18, -18],
    held: ['stick', 'stick'],
    draw: (c, d) => drumBody(34, 104, 52, 26, c, d),
  },
  tom: {
    rest: [-20, -20],
    held: ['stick', 'stick'],
    draw: (c, d) => drumBody(26, 106, 32, 26, c, d) + drumBody(62, 106, 32, 26, c, d),
  },
  bass: {
    rest: [-32, -26],
    held: ['none', 'none'],
    draw: (c, d, a) =>
      `<line x1="64" y1="104" x2="110" y2="62" stroke="${WOOD_DARK}" stroke-width="7" stroke-linecap="round"/>` +
      `<line x1="64" y1="104" x2="110" y2="62" stroke="${WOOD}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<rect x="104" y="52" width="12" height="14" rx="3" transform="rotate(42 110 60)" fill="${d}"/>` +
      `<path d="M30 112C30 98 46 94 56 100C66 96 76 102 76 114C76 128 58 132 48 126C38 128 30 124 30 112Z" fill="${a}" stroke="${d}" stroke-width="2.5"/>` +
      `<line x1="40" y1="112" x2="72" y2="108" stroke="${d}" stroke-width="2.4"/><line x1="40" y1="118" x2="72" y2="114" stroke="${d}" stroke-width="2.4"/>` +
      `<circle cx="50" cy="118" r="3" fill="${c}"/>`,
  },
  piano: {
    rest: [-28, -28],
    held: ['none', 'none'],
    draw: (_c, d) => {
      let keys = '';
      for (let i = 0; i < 7; i++)
        keys += `<line x1="${24 + i * 10.3}" y1="106" x2="${24 + i * 10.3}" y2="124" stroke="${INK}" stroke-width="1" opacity=".5"/>`;
      let blacks = '';
      for (const i of [0, 1, 3, 4, 5]) blacks += `<rect x="${24 + i * 10.3 + 6.5}" y="106" width="7" height="11" rx="1.5" fill="${INK}"/>`;
      return `<rect x="22" y="104" width="76" height="22" rx="4" fill="#fff" stroke="${d}" stroke-width="2.5"/>${keys}${blacks}<rect x="20" y="124" width="80" height="6" rx="3" fill="${d}"/>`;
    },
  },
  guitar: {
    rest: [-55, -30],
    held: ['none', 'none'],
    draw: (c, d, a) =>
      `<line x1="64" y1="100" x2="108" y2="64" stroke="${WOOD_DARK}" stroke-width="6" stroke-linecap="round"/>` +
      `<rect x="102" y="52" width="11" height="14" rx="3" transform="rotate(40 108 60)" fill="${d}"/>` +
      `<circle cx="52" cy="120" r="17" fill="${c}" stroke="${d}" stroke-width="2.5"/><circle cx="58" cy="102" r="12" fill="${c}" stroke="${d}" stroke-width="2.5"/>` +
      `<circle cx="54" cy="112" r="6.5" fill="${INK}"/><circle cx="54" cy="112" r="9" fill="none" stroke="${a}" stroke-width="2"/>`,
  },
  xylo: {
    rest: [-18, -18],
    held: ['stick', 'stick'],
    draw: () => {
      const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
      return (
        `<rect x="22" y="104" width="76" height="6" rx="3" fill="${WOOD_DARK}"/><rect x="22" y="122" width="76" height="6" rx="3" fill="${WOOD_DARK}"/>` +
        cols
          .map(
            (col, i) =>
              `<rect x="${24 + i * 12.2}" y="${103 + i * 1.6}" width="10" height="${27 - i * 3}" rx="3" fill="${col}" stroke="${INK}" stroke-width="1.6"/>`,
          )
          .join('')
      );
    },
  },
  bell: {
    rest: [30, 30],
    held: ['bell', 'bell'],
    draw: () => star(22, 56, 6, '#fde047') + star(98, 48, 5, '#fde047') + star(100, 110, 5, '#fde047'),
  },
  flute: {
    rest: [-45, -30],
    held: ['none', 'none'],
    front: true,
    draw: (_c, d) =>
      `<line x1="52" y1="58" x2="108" y2="104" stroke="${METAL}" stroke-width="7" stroke-linecap="round"/>` +
      `<line x1="52" y1="58" x2="108" y2="104" stroke="${d}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>` +
      [0.35, 0.5, 0.65, 0.8]
        .map((t) => `<circle cx="${(52 + 56 * t).toFixed(1)}" cy="${(58 + 46 * t).toFixed(1)}" r="2.2" fill="${INK}"/>`)
        .join(''),
  },
  trumpet: {
    rest: [-62, -48],
    held: ['none', 'none'],
    front: true,
    draw: (_c, d) =>
      `<path d="M58 56H84C98 56 102 66 102 74" fill="none" stroke="#fbbf24" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M58 56H84C98 56 102 66 102 74" fill="none" stroke="${d}" stroke-width="1.5" opacity=".5"/>` +
      `<path d="M94 72L112 62V102L94 92Z" fill="#fbbf24" stroke="#b45309" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<rect x="74" y="44" width="4" height="12" rx="2" fill="#b45309"/><rect x="82" y="44" width="4" height="12" rx="2" fill="#b45309"/>`,
  },
  sax: {
    rest: [-44, -44],
    held: ['none', 'none'],
    front: true,
    draw: (_c, d) =>
      `<path d="M62 54C74 54 80 60 80 70V104C80 124 100 124 104 106" fill="none" stroke="#f59e0b" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M62 54C74 54 80 60 80 70V104C80 124 100 124 104 106" fill="none" stroke="${d}" stroke-width="1.4" opacity=".45"/>` +
      `<path d="M96 102L114 96V112L98 116Z" fill="#f59e0b" stroke="#b45309" stroke-width="2.2" stroke-linejoin="round"/>` +
      [76, 88, 100].map((y) => `<circle cx="80" cy="${y}" r="2.6" fill="#fff" stroke="#b45309" stroke-width="1.2"/>`).join(''),
  },
  violin: {
    rest: [-48, -12],
    held: ['none', 'bow'],
    front: true,
    draw: (c) =>
      `<path d="M40 70C34 64 38 56 44 58C52 54 60 60 56 68C62 74 58 88 50 90C44 94 36 90 38 84C34 80 38 74 40 70Z" fill="${c === '#e2e8f0' ? '#d97706' : c}" stroke="${WOOD_DARK}" stroke-width="2.4" transform="rotate(-20 47 74)"/>` +
      `<line x1="34" y1="66" x2="22" y2="46" stroke="${WOOD_DARK}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<line x1="40" y1="74" x2="54" y2="76" stroke="${INK}" stroke-width="1.6"/>` +
      `<path d="M46 70q2 4 0 8" fill="none" stroke="${INK}" stroke-width="1.6"/>`,
  },
  shaker: {
    rest: [48, 48],
    held: ['maraca', 'maraca'],
    draw: () => star(18, 120, 5, '#fde047') + star(102, 122, 5, '#fde047'),
  },
  cowbell: {
    rest: [14, -22],
    held: ['none', 'stick'],
    draw: (_c, d) =>
      `<path d="M44 100H76L82 124H38Z" fill="#fbbf24" stroke="#b45309" stroke-width="2.6" stroke-linejoin="round"/>` +
      `<rect x="55" y="94" width="10" height="7" rx="3" fill="#b45309"/><ellipse cx="60" cy="124" rx="22" ry="4" fill="${d}" opacity=".35"/>`,
  },
  triangle: {
    rest: [-6, -22],
    held: ['none', 'stick'],
    draw: () =>
      `<path d="M44 128L60 98L76 128Z" fill="none" stroke="${METAL}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="M44 128L60 98L76 128Z" fill="none" stroke="#64748b" stroke-width="1.2" stroke-linejoin="round" opacity=".6"/>` +
      `<line x1="60" y1="98" x2="60" y2="88" stroke="#64748b" stroke-width="2"/>`,
  },
};

// ---- the newer instruments -----------------------------------------------------------------

const barRow = (n: number, x0: number, w: number, fill: (i: number) => string, stroke: string, y0 = 104, shrink = 3): string =>
  Array.from(
    { length: n },
    (_, i) =>
      `<rect x="${(x0 + i * (w + 2)).toFixed(1)}" y="${y0 + i * 1.4}" width="${w}" height="${28 - i * shrink}" rx="3" fill="${fill(i)}" stroke="${stroke}" stroke-width="1.6"/>`,
  ).join('');

const tubeRow = (n: number, x0: number, step: number, y0: number, len: (i: number) => number, color: string, w = 4): string =>
  Array.from(
    { length: n },
    (_, i) =>
      `<rect x="${(x0 + i * step).toFixed(1)}" y="${y0}" width="${w}" height="${len(i).toFixed(1)}" rx="${w / 2}" fill="${color}" stroke="${INK}" stroke-width="1.2"/>`,
  ).join('');

const cymbalDisc = (cx: number, cy: number, r: number, fill: string, stroke: string): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="${stroke}" stroke-width="1.4" opacity=".6"/><circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="${stroke}"/>`;

const NEW_PROPS: Partial<Record<PropKind, PropArt>> = {
  marimba: {
    rest: [-18, -18],
    held: ['stick', 'stick'],
    draw: (_c, d) =>
      tubeRow(6, 27, 12.4, 128, (i) => 10 - i * 1.2, '#92400e', 6) +
      barRow(6, 24, 10, (i) => ['#b45309', '#c2410c', '#d97706', '#ea580c', '#9a3412', '#b45309'][i] as string, d),
  },
  kalimba: {
    rest: [-30, -30],
    held: ['none', 'none'],
    draw: (_c, d) =>
      `<rect x="34" y="104" width="52" height="30" rx="8" fill="#d6a35c" stroke="${WOOD_DARK}" stroke-width="2.6"/>` +
      Array.from(
        { length: 7 },
        (_, i) =>
          `<rect x="${39 + i * 6.4}" y="${100 - (4 - Math.abs(i - 3)) * 1.6}" width="3.6" height="${22 + (4 - Math.abs(i - 3)) * 1.6}" rx="1.5" fill="${METAL}" stroke="${d}" stroke-width="1"/>`,
      ).join('') +
      `<circle cx="60" cy="124" r="4.5" fill="${WOOD_DARK}"/>`,
  },
  vibraphone: {
    rest: [-18, -18],
    held: ['stick', 'stick'],
    draw: (_c, d) =>
      tubeRow(6, 27, 12.4, 126, (i) => 12 - i, '#94a3b8', 6) +
      barRow(6, 24, 10, () => METAL, d) +
      `<line x1="22" y1="133" x2="98" y2="133" stroke="${d}" stroke-width="3"/>`,
  },
  steelpan: {
    rest: [-20, -20],
    held: ['stick', 'stick'],
    draw: (_c, d) =>
      `<path d="M30 112L36 136H84L90 112Z" fill="#475569" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<ellipse cx="60" cy="112" rx="30" ry="10" fill="#e2e8f0" stroke="${d}" stroke-width="2.6"/>` +
      [
        [46, 112],
        [60, 108],
        [74, 112],
        [53, 115],
        [67, 115],
      ]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="2.8" fill="none" stroke="#64748b" stroke-width="1.6"/>`)
        .join(''),
  },
  handpan: {
    rest: [-32, -32],
    held: ['none', 'none'],
    draw: (c, d) =>
      `<ellipse cx="60" cy="122" rx="34" ry="14" fill="#a8a29e" stroke="${d}" stroke-width="2.6"/>` +
      `<ellipse cx="60" cy="118" rx="30" ry="11" fill="#d6d3d1" stroke="${d}" stroke-width="2"/>` +
      `<ellipse cx="60" cy="118" rx="7" ry="3.4" fill="${c}" stroke="${d}" stroke-width="1.6"/>` +
      [
        [44, 117],
        [76, 117],
        [52, 123],
        [68, 123],
        [60, 111],
      ]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.4" fill="none" stroke="${d}" stroke-width="1.4"/>`)
        .join(''),
  },
  chime: {
    rest: [30, 30],
    held: ['bell', 'bell'],
    draw: (_c, d) =>
      `<rect x="26" y="90" width="68" height="6" rx="3" fill="${WOOD_DARK}"/>` +
      Array.from(
        { length: 6 },
        (_, i) =>
          `<line x1="${32 + i * 11.2}" y1="96" x2="${32 + i * 11.2}" y2="${106 + (i % 3) * 5}" stroke="${d}" stroke-width="1"/><rect x="${30 + i * 11.2}" y="${106 + (i % 3) * 5}" width="4" height="${16 + ((i * 7) % 5) * 3}" rx="2" fill="#a7f3d0" stroke="${d}" stroke-width="1.4"/>`,
      ).join(''),
  },
  trung: {
    rest: [-18, -18],
    held: ['stick', 'stick'],
    draw: () =>
      `<rect x="22" y="106" width="76" height="5" rx="2.5" fill="${WOOD_DARK}"/><rect x="22" y="122" width="76" height="5" rx="2.5" fill="${WOOD_DARK}"/>` +
      Array.from(
        { length: 7 },
        (_, i) =>
          `<rect x="${24 + i * 10.4}" y="${100 + i * 1.4}" width="8" height="${32 - i * 2.4}" rx="3" fill="#84cc16" stroke="#365314" stroke-width="1.6"/><line x1="${24 + i * 10.4}" y1="${112 + i}" x2="${32 + i * 10.4}" y2="${112 + i}" stroke="#365314" stroke-width="1.4"/>`,
      ).join(''),
  },
  harp: {
    rest: [-40, -40],
    held: ['none', 'none'],
    draw: (c, d) =>
      `<path d="M92 56C102 56 104 66 98 74L58 134H92" fill="none" stroke="${WOOD_DARK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M92 56C102 56 104 66 98 74L58 134H92" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      Array.from(
        { length: 6 },
        (_, i) => `<line x1="${94 - i * 4.4}" y1="${70 + i * 10}" x2="${94 - i * 4.4 + 0.1}" y2="134" stroke="${d}" stroke-width="1.3"/>`,
      ).join(''),
  },
  tranh: {
    rest: [-40, -30],
    held: ['none', 'none'],
    draw: (c, d) =>
      `<path d="M12 128L106 100V116L12 140Z" fill="${c}" stroke="${d}" stroke-width="2.6" stroke-linejoin="round"/>` +
      Array.from(
        { length: 8 },
        (_, i) =>
          `<line x1="${16 + i * 11}" y1="${128 - i * 3.6}" x2="${20 + i * 11}" y2="${120 - i * 3.6}" stroke="#fef3c7" stroke-width="1.2"/>`,
      ).join('') +
      Array.from(
        { length: 5 },
        (_, i) =>
          `<polygon points="${24 + i * 17},${126 - i * 5.4} ${28 + i * 17},${126 - i * 5.4} ${26 + i * 17},${120 - i * 5.4}" fill="${WOOD}" stroke="${d}" stroke-width="1"/>`,
      ).join(''),
  },
  ukulele: {
    rest: [-50, -28],
    held: ['none', 'none'],
    draw: (c, d, a) =>
      `<line x1="62" y1="104" x2="100" y2="72" stroke="${WOOD_DARK}" stroke-width="5" stroke-linecap="round"/>` +
      `<rect x="95" y="62" width="9" height="11" rx="2.5" transform="rotate(40 100 68)" fill="${d}"/>` +
      `<circle cx="52" cy="122" r="13" fill="${c}" stroke="${d}" stroke-width="2.5"/><circle cx="58" cy="108" r="9" fill="${c}" stroke="${d}" stroke-width="2.5"/>` +
      `<circle cx="54" cy="116" r="5" fill="${INK}"/><circle cx="54" cy="116" r="7" fill="none" stroke="${a}" stroke-width="1.6"/>`,
  },
  banjo: {
    rest: [-52, -28],
    held: ['none', 'none'],
    draw: (_c, d, a) =>
      `<line x1="70" y1="108" x2="108" y2="70" stroke="${WOOD_DARK}" stroke-width="5" stroke-linecap="round"/>` +
      `<rect x="102" y="60" width="9" height="11" rx="2.5" transform="rotate(45 107 66)" fill="${d}"/>` +
      `<circle cx="52" cy="118" r="21" fill="#f8fafc" stroke="${d}" stroke-width="3"/><circle cx="52" cy="118" r="15" fill="none" stroke="${a}" stroke-width="1.6"/>` +
      `<line x1="40" y1="122" x2="68" y2="112" stroke="${INK}" stroke-width="1.6"/><rect x="46" y="116" width="10" height="3" fill="${d}"/>`,
  },
  cello: {
    rest: [-52, -8],
    held: ['none', 'bow'],
    draw: (c, d) =>
      `<line x1="40" y1="104" x2="40" y2="48" stroke="${WOOD_DARK}" stroke-width="5" stroke-linecap="round"/>` +
      `<rect x="35" y="42" width="10" height="9" rx="3" fill="${d}"/>` +
      `<path d="M24 112C20 102 30 96 38 100C42 96 52 98 54 108C60 112 58 124 50 128C54 138 28 140 26 130C18 126 20 116 24 112Z" fill="#b45309" stroke="${WOOD_DARK}" stroke-width="2.6" stroke-linejoin="round"/>` +
      `<path d="M31 112q2 5 0 10M43 112q-2 5 0 10" fill="none" stroke="${INK}" stroke-width="1.6"/><line x1="38" y1="106" x2="38" y2="132" stroke="${c}" stroke-width="1.6" opacity=".8"/>`,
  },
  harmonica: {
    rest: [-62, -48],
    held: ['none', 'none'],
    front: true,
    draw: (_c, d) =>
      `<rect x="40" y="54" width="40" height="12" rx="3" fill="#cbd5e1" stroke="${d}" stroke-width="2.2"/>` +
      Array.from({ length: 8 }, (_, i) => `<rect x="${43 + i * 4.4}" y="58" width="2.6" height="4" rx="1" fill="${INK}"/>`).join('') +
      `<rect x="38" y="52" width="4" height="16" rx="2" fill="#64748b"/><rect x="78" y="52" width="4" height="16" rx="2" fill="#64748b"/>`,
  },
  accordion: {
    rest: [-30, -30],
    held: ['none', 'none'],
    draw: (c, d, a) =>
      `<rect x="20" y="100" width="18" height="34" rx="4" fill="${d}" stroke="${INK}" stroke-width="2"/><rect x="82" y="100" width="18" height="34" rx="4" fill="${d}" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="38" y="102" width="44" height="30" fill="${a}" stroke="${INK}" stroke-width="1.6"/>` +
      Array.from(
        { length: 7 },
        (_, i) => `<line x1="${42 + i * 6}" y1="102" x2="${42 + i * 6}" y2="132" stroke="${c}" stroke-width="2.6"/>`,
      ).join('') +
      Array.from({ length: 3 }, (_, i) => `<circle cx="29" cy="${108 + i * 9}" r="2.6" fill="#fde047"/>`).join('') +
      Array.from({ length: 3 }, (_, i) => `<circle cx="91" cy="${108 + i * 9}" r="2.6" fill="#f8fafc"/>`).join(''),
  },
  organ: {
    rest: [-28, -28],
    held: ['none', 'none'],
    draw: (c, d) =>
      Array.from(
        { length: 5 },
        (_, i) =>
          `<rect x="${28 + i * 13}" y="${86 + (i % 2) * 4}" width="9" height="${22 - (i % 2) * 4}" rx="3" fill="#cbd5e1" stroke="${d}" stroke-width="1.6"/>`,
      ).join('') +
      `<rect x="20" y="106" width="80" height="22" rx="4" fill="#fff" stroke="${d}" stroke-width="2.5"/>` +
      Array.from(
        { length: 7 },
        (_, i) => `<line x1="${30 + i * 10}" y1="106" x2="${30 + i * 10}" y2="126" stroke="${INK}" stroke-width="1" opacity=".5"/>`,
      ).join('') +
      [0, 1, 3, 4, 5].map((i) => `<rect x="${24 + i * 10 + 6}" y="106" width="7" height="11" rx="1.5" fill="${INK}"/>`).join('') +
      `<rect x="18" y="126" width="84" height="6" rx="3" fill="${c}" stroke="${d}" stroke-width="1.4"/>`,
  },
  panpipe: {
    rest: [-62, -50],
    held: ['none', 'none'],
    front: true,
    draw: (_c, d) =>
      Array.from(
        { length: 6 },
        (_, i) =>
          `<rect x="${38 + i * 7.6}" y="52" width="6" height="${30 - i * 3.4}" rx="3" fill="#d9f99d" stroke="${d}" stroke-width="1.6"/>`,
      ).join('') + `<rect x="36" y="64" width="50" height="4" rx="2" fill="${WOOD_DARK}"/>`,
  },
  tuba: {
    rest: [-44, -44],
    held: ['none', 'none'],
    draw: (_c, d) =>
      `<circle cx="52" cy="112" r="22" fill="none" stroke="#f59e0b" stroke-width="8"/><circle cx="52" cy="112" r="22" fill="none" stroke="${d}" stroke-width="1.4" opacity=".5"/>` +
      `<path d="M52 90V62" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/><path d="M72 112L98 88L110 100L84 130Z" fill="#fbbf24" stroke="#b45309" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<circle cx="44" cy="104" r="3" fill="#b45309"/><circle cx="52" cy="98" r="3" fill="#b45309"/>`,
  },
  conga: {
    rest: [-22, -22],
    held: ['stick', 'stick'],
    draw: (c, d) => drumBody(40, 98, 40, 42, c, d) + `<rect x="40" y="108" width="40" height="5" fill="${d}" opacity=".5"/>`,
  },
  bongo: {
    rest: [-22, -22],
    held: ['stick', 'stick'],
    draw: (c, d) =>
      drumBody(28, 108, 30, 26, c, d) + drumBody(62, 108, 30, 26, c, d) + `<rect x="54" y="116" width="12" height="5" rx="2" fill="${d}"/>`,
  },
  tambourine: {
    rest: [30, 30],
    held: ['bell', 'bell'],
    draw: (c, d) =>
      cymbalDisc(60, 118, 22, '#fff7ed', d) +
      `<circle cx="60" cy="118" r="22" fill="none" stroke="${c}" stroke-width="4" stroke-dasharray="6 5"/>`,
  },
  maracas: {
    rest: [48, 48],
    held: ['maraca', 'maraca'],
    draw: () => star(20, 118, 5, '#fde047') + star(100, 120, 5, '#fb7185') + star(60, 130, 4, '#a7f3d0'),
  },
  castanets: {
    rest: [20, 20],
    held: ['none', 'none'],
    draw: (c, d) =>
      `<circle cx="42" cy="112" r="12" fill="#b45309" stroke="${d}" stroke-width="2.4"/><circle cx="78" cy="112" r="12" fill="#b45309" stroke="${d}" stroke-width="2.4"/>` +
      `<path d="M42 112L78 112" stroke="${c}" stroke-width="3"/><circle cx="42" cy="112" r="3.4" fill="#fde68a"/><circle cx="78" cy="112" r="3.4" fill="#fde68a"/>`,
  },
  mo: {
    rest: [-10, -24],
    held: ['none', 'stick'],
    draw: (_c, d) =>
      `<path d="M34 118C34 100 86 100 86 118C86 134 34 134 34 118Z" fill="#d97706" stroke="${WOOD_DARK}" stroke-width="2.8"/>` +
      `<path d="M42 120H78" stroke="${WOOD_DARK}" stroke-width="3" stroke-linecap="round"/><circle cx="46" cy="112" r="2.6" fill="${d}"/>`,
  },
  beatbox: {
    rest: [-60, -20],
    held: ['none', 'none'],
    front: true,
    draw: (c, d) =>
      `<rect x="26" y="102" width="40" height="32" rx="6" fill="${INK}" stroke="${d}" stroke-width="2.4"/><circle cx="46" cy="122" r="9" fill="${c}" stroke="#94a3b8" stroke-width="2"/><circle cx="46" cy="122" r="3" fill="#94a3b8"/>` +
      `<rect x="54" y="52" width="7" height="14" rx="3.5" fill="#cbd5e1" stroke="${INK}" stroke-width="1.6"/><line x1="58" y1="66" x2="58" y2="82" stroke="${INK}" stroke-width="2"/>`,
  },
  timpani: {
    rest: [-18, -18],
    held: ['stick', 'stick'],
    draw: (c, d) =>
      `<path d="M28 112C28 140 92 140 92 112Z" fill="#b45309" stroke="${d}" stroke-width="2.8" stroke-linejoin="round"/>` +
      `<ellipse cx="60" cy="112" rx="32" ry="8" fill="#f8fafc" stroke="${d}" stroke-width="2.6"/><path d="M60 138V146M46 136L42 146M74 136L78 146" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="60" cy="112" r="3" fill="${c}"/>`,
  },
  gong: {
    rest: [-8, -26],
    held: ['none', 'stick'],
    draw: (c) =>
      `<path d="M26 142V88H94V142" fill="none" stroke="${WOOD_DARK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      cymbalDisc(60, 112, 20, '#fbbf24', '#b45309') +
      `<circle cx="60" cy="112" r="20" fill="none" stroke="${c}" stroke-width="1.6" opacity=".7"/>`,
  },
};
const PROPS = { ...BASE_PROPS, ...NEW_PROPS } as Record<PropKind, PropArt>;

/** What the instrument a robot holds needs to know about its arms. */
export function restOf(prop: PropKind): readonly [number, number] {
  return PROPS[prop].rest;
}

// ---------------------------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------------------------

const ARM_LEN = 28;

function heldArt(kind: Held, accent: string): string {
  switch (kind) {
    case 'stick':
      return `<line x1="0" y1="${ARM_LEN}" x2="0" y2="${ARM_LEN + 17}" stroke="${WOOD}" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="${ARM_LEN + 18}" r="3.4" fill="${WOOD_DARK}"/>`;
    case 'bell':
      return `<path d="M-7 ${ARM_LEN + 14}C-7 ${ARM_LEN + 4} -4 ${ARM_LEN + 1} 0 ${ARM_LEN + 1}C4 ${ARM_LEN + 1} 7 ${ARM_LEN + 4} 7 ${ARM_LEN + 14}Z" fill="#fde047" stroke="#b45309" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="${ARM_LEN + 16}" r="2.8" fill="#b45309"/>`;
    case 'maraca':
      return `<line x1="0" y1="${ARM_LEN - 2}" x2="0" y2="${ARM_LEN + 7}" stroke="${WOOD_DARK}" stroke-width="4" stroke-linecap="round"/><ellipse cx="0" cy="${ARM_LEN + 16}" rx="8" ry="10.5" fill="${accent}" stroke="${WOOD_DARK}" stroke-width="2"/><circle cx="-2.5" cy="${ARM_LEN + 13}" r="1.8" fill="#fff"/><circle cx="3" cy="${ARM_LEN + 18}" r="1.8" fill="#fff"/>`;
    case 'bow':
      return `<line x1="-3" y1="${ARM_LEN - 12}" x2="-3" y2="${ARM_LEN + 20}" stroke="${WOOD_DARK}" stroke-width="2.4" stroke-linecap="round"/><line x1="-3" y1="${ARM_LEN - 12}" x2="-3" y2="${ARM_LEN + 20}" stroke="#fff" stroke-width="0.9" opacity=".8"/>`;
    default:
      return '';
  }
}

function armArt(side: 'l' | 'r', color: string, dark: string, hand: string, held: Held, accent: string): string {
  const p = side === 'l' ? SHOULDER_L : SHOULDER_R;
  return (
    `<g class="rb-arm-${side}" transform="translate(${p.x} ${p.y})"><g class="rb-arm-rot">` +
    heldArt(held, accent) +
    `<line x1="0" y1="0" x2="0" y2="${ARM_LEN}" stroke="${dark}" stroke-width="11" stroke-linecap="round"/>` +
    `<line x1="0" y1="0" x2="0" y2="${ARM_LEN}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="0" cy="${ARM_LEN}" r="6.5" fill="${hand}" stroke="${dark}" stroke-width="2"/>` +
    `</g></g>`
  );
}

// ---------------------------------------------------------------------------------------------
// The whole robot
// ---------------------------------------------------------------------------------------------

export function robotMarkup(color: string, look: Look): string {
  const dark = shade(color, 0.38);
  const prop = PROPS[look.prop];
  const b = HEADS[look.head];
  const instrument = `<g class="rb-prop" transform="translate(${PROP_PIVOT.x} ${PROP_PIVOT.y})"><g class="rb-prop-rot"><g transform="translate(${-PROP_PIVOT.x} ${-PROP_PIVOT.y})">${prop.draw(color, dark, look.accent)}</g></g></g>`;
  const legs =
    `<rect x="41" y="116" width="14" height="22" rx="6" fill="${shade(color, 0.2)}" stroke="${dark}" stroke-width="2.4"/>` +
    `<rect x="65" y="116" width="14" height="22" rx="6" fill="${shade(color, 0.2)}" stroke="${dark}" stroke-width="2.4"/>` +
    `<ellipse cx="46" cy="140" rx="12" ry="6.5" fill="${INK}"/><ellipse cx="74" cy="140" rx="12" ry="6.5" fill="${INK}"/>`;
  const body = `<rect x="32" y="68" width="56" height="52" rx="15" fill="${color}" stroke="${dark}" stroke-width="2.8"/>`;
  const head =
    `<g class="rb-head" transform="translate(${NECK.x} ${NECK.y})"><g class="rb-head-rot"><g transform="translate(${-NECK.x} ${-NECK.y})">` +
    antennaArt(look.antenna, b, look.accent, dark) +
    earsArt(look.ears, b, look.accent, dark) +
    headShape(look.head, color, dark) +
    `<g class="rb-eyes">${eyesArt(look.eyes, b)}</g>` +
    photoArt(b, dark) +
    `</g></g></g>`;
  const neck = `<rect x="53" y="58" width="14" height="14" rx="4" fill="#64748b"/>`;
  const arms =
    armArt('l', color, dark, look.accent, prop.held[0], look.accent) + armArt('r', color, dark, look.accent, prop.held[1], look.accent);
  const front = prop.front ? head + instrument : instrument + head;
  return `<svg class="rb-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${legs}${neck}${body}${bellyArt(look.belly, look.accent, dark)}${arms}${front}</svg>`;
}

/** The moving parts of one drawn robot. */
export interface Rig {
  svg: SVGSVGElement;
  head: SVGGElement;
  armL: SVGGElement;
  armR: SVGGElement;
  prop: SVGGElement;
  eyes: SVGGElement;
  photo: SVGGElement;
  photoImg: SVGImageElement;
  rest: readonly [number, number];
}

export function createRig(color: string, look: Look): Rig {
  const svg = svgEl(robotMarkup(color, look));
  const get = (sel: string): SVGGElement => svg.querySelector<SVGGElement>(sel) as SVGGElement;
  const rig: Rig = {
    svg,
    head: get('.rb-head-rot'),
    armL: get('.rb-arm-l .rb-arm-rot'),
    armR: get('.rb-arm-r .rb-arm-rot'),
    prop: get('.rb-prop-rot'),
    eyes: get('.rb-eyes'),
    photo: get('.rb-photo'),
    photoImg: svg.querySelector('.rb-photo-img') as SVGImageElement,
    rest: PROPS[look.prop].rest,
  };
  setPose(rig, null);
  return rig;
}

const fix = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Put the moving parts where a pose says (`null` = standing still). Cheap: four attributes. */
export function setPose(rig: Rig, pose: Pose | null, armOverride?: { l: number; r: number }): void {
  const dl = pose?.armL ?? 0;
  const dr = pose?.armR ?? 0;
  const l = armOverride ? armOverride.l : rig.rest[0] + dl;
  const r = armOverride ? armOverride.r : rig.rest[1] + dr;
  // Left arm: positive turns it outward (clockwise); right arm: the mirror image.
  rig.armL.setAttribute('transform', `rotate(${fix(l)})`);
  rig.armR.setAttribute('transform', `rotate(${fix(-r)})`);
  rig.head.setAttribute('transform', `rotate(${fix(pose?.head ?? 0)})`);
  rig.prop.setAttribute('transform', `rotate(${fix(pose?.prop ?? 0)})`);
}

/** Put a family photo where the face is (`null` brings the usual face back). */
export function setFace(rig: Rig, url: string | null): void {
  if (url) rig.photoImg.setAttribute('href', url);
  rig.photo.style.display = url ? '' : 'none';
  rig.eyes.style.display = url ? 'none' : '';
}
