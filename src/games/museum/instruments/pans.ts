import { lg, rg, rnd } from './art';
import { majorFrom, pentaFrom, tune } from './scale';
import { perf } from '../../../core/frame';
import { ell, line, rect, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { inst, instHz } from './voices';

type PanKind = 'steelpan' | 'handpan';

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Hammer marks: little dents scattered over a metal disc, each a dark crescent with a
 * bright one opposite. Fewer on a low-end device (the count is the only cost).
 */
function hammered(cx: number, cy: number, R: number, count: number, seed: number, rIn = 0): string {
  const n = perf.low ? Math.round(count * 0.4) : count;
  let out = '';
  for (let k = 0; k < n; k++) {
    const a = rnd(seed + k * 2) * Math.PI * 2;
    const d = rIn + Math.sqrt(rnd(seed + k * 2 + 1)) * (R - rIn);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const s = R * (0.018 + rnd(seed + k * 5) * 0.022);
    out += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(s)}" ry="${r1(s * 0.8)}" fill="rgba(40,20,0,.22)"/><ellipse cx="${r1(x - s * 0.3)}" cy="${r1(y - s * 0.35)}" rx="${r1(s * 0.7)}" ry="${r1(s * 0.5)}" fill="rgba(255,255,255,.3)"/>`;
  }
  return out;
}

/**
 * Steel drum and handpan, seen from above: a hollow dish with note fields hammered
 * into it - one in the middle and a ring of six around, rising clockwise. Touch
 * a field and it lights up. Steel pan is bright silver-blue, handpan warm bronze.
 */
export function layoutPan(kind: PanKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 6;
  const steel = kind === 'steelpan';
  const ring = kind === 'steelpan' && harmony === 'free' ? majorFrom(60, 6) : pentaFrom(steel ? 60 : 62, 6);
  const centerNote = kind === 'steelpan' ? (harmony === 'free' ? 71 : 74) : 60;
  const pal = steel
    ? { bg: ['#f0f9ff', '#bae6fd'], dish: ['#f8fafc', '#cbd5e1', '#8493a6', '#3d4a5c'], pad: ['#ffffff', '#dbe5f0', '#8fa1b6'], edge: '#1e293b', groove: 'rgba(15,23,42,.55)', lip: ['#e2e8f0', '#64748b', '#1e293b'] }
    : { bg: ['#fffbeb', '#fde68a'], dish: ['#fde68a', '#d99a2b', '#9a5c12', '#4e2a08'], pad: ['#fff3c4', '#e4a844', '#a8631a'], edge: '#4e2a08', groove: 'rgba(60,28,4,.6)', lip: ['#fde68a', '#a8631a', '#4e2a08'] };
  const defs =
    lg('pan-bg', [[0, pal.bg[0]!], [1, pal.bg[1]!]]) +
    rg('pan-dish', [[0, pal.dish[0]!], [0.35, pal.dish[1]!], [0.75, pal.dish[2]!], [1, pal.dish[3]!]], 0.45, 0.42, 0.78, 0.36, 0.3) +
    rg('pan-pad', [[0, pal.pad[0]!], [0.55, pal.pad[1]!], [1, pal.pad[2]!]], 0.38, 0.32, 0.8) +
    lg('pan-lip', [[0, pal.lip[0]!], [0.5, pal.lip[1]!], [1, pal.lip[2]!]], 0, 0, 1, 1);
  let art = rect(0, 0, w, h, 0, 'url(#pan-bg)');
  art += ell(cx + R * 0.02, cy + R * 0.06, R * 1.02, R * 1.02, 'rgba(0,0,0,.18)');
  // rolled rim, then the dish with hammer marks
  art += ell(cx, cy, R, R, 'url(#pan-lip)', `stroke="${pal.edge}" stroke-width="4"`);
  art += ell(cx, cy, R * 0.955, R * 0.955, 'url(#pan-dish)', `stroke="${pal.edge}" stroke-width="2.5"`);
  art += ell(cx, cy, R * 0.955, R * 0.955, 'none', 'stroke="rgba(255,255,255,.4)" stroke-width="2.5" transform="translate(-1.5 -1.5)"');
  art += hammered(cx, cy, R * 0.93, steel ? 46 : 64, steel ? 11 : 3);
  if (!steel)
    for (let i = 0; i < 12; i++) {
      const px = cx + Math.cos((i * Math.PI) / 6 + 0.26) * R * 0.88;
      const py = cy + Math.sin((i * Math.PI) / 6 + 0.26) * R * 0.88;
      art += ell(px, py, R * 0.022, R * 0.022, 'rgba(40,18,0,.55)') + ell(px - 1, py - 1, R * 0.012, R * 0.012, 'rgba(255,230,160,.6)');
    }
  const zones: Zone[] = [];
  // a note field: a groove round it, a raised dome inside, and a small boss
  const field = (px: number, py: number, rx: number, ry: number): string =>
    ell(px + rx * 0.05, py + ry * 0.09, rx, ry, 'rgba(0,0,0,.22)') +
    ell(px, py, rx, ry, 'url(#pan-pad)', `stroke="${pal.groove}" stroke-width="4"`) +
    ell(px, py, rx * 0.94, ry * 0.94, 'none', 'stroke="rgba(255,255,255,.5)" stroke-width="1.8" transform="translate(-1.2 -1.2)"') +
    ell(px, py + ry * 0.1, rx * 0.34, ry * 0.3, 'none', `stroke="${pal.groove}" stroke-width="2" opacity=".55"`) +
    ell(px - rx * 0.3, py - ry * 0.34, rx * 0.3, ry * 0.15, 'rgba(255,255,255,.75)', `transform="rotate(-25 ${r1(px - rx * 0.3)} ${r1(py - ry * 0.34)})"`);
  zones.push({
    id: `n${centerNote}`,
    shape: { t: 'ell', cx, cy, rx: R * 0.27, ry: R * 0.27 },
    role: 'play',
    voices: [inst(kind, tune(centerNote, harmony))],
  });
  art += zg(`n${centerNote}`, field(cx, cy, R * 0.27, R * 0.27));
  ring.forEach((m, j) => {
    const a = ((210 + 60 * j) * Math.PI) / 180;
    const px = cx + Math.cos(a) * R * 0.66;
    const py = cy + Math.sin(a) * R * 0.66;
    zones.push({
      id: `n${m}`,
      shape: { t: 'ell', cx: px, cy: py, rx: R * 0.27, ry: R * 0.26 },
      role: 'play',
      voices: [inst(kind, tune(m, harmony))],
    });
    art += zg(`n${m}`, field(px, py, R * 0.27, R * 0.26));
  });
  return {
    kind,
    family: 'pan',
    w,
    h,
    portrait,
    harmony,
    zones,
    svg: wrap(w, h, defs, art, steel ? 'Trống thép' : 'Trống handpan'),
    glide: true,
  };
}

/**
 * A gong hanging in a frame. Strike the boss in the middle for a deep, booming
 * note, the rim for a lower, softer wash. Rest a finger on it afterwards to damp it.
 */
export function layoutGong(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const cx = w / 2;
  const R = Math.min(w * 0.46, h * 0.43);
  const cy = h * 0.52;
  const defs =
    lg('gg-bg', [[0, '#fff1f2'], [1, '#fecdd3']]) +
    rg('gg-disc', [[0, '#ffe9a8'], [0.3, '#e7b04e'], [0.7, '#b8741f'], [1, '#6a3a0c']], 0.5, 0.5, 0.78, 0.36, 0.3) +
    rg('gg-boss', [[0, '#fff7cf'], [0.4, '#eab54f'], [0.8, '#b8741f'], [1, '#7a4510']], 0.38, 0.32, 0.75) +
    lg('gg-rim', [[0, '#f6d58a'], [0.5, '#9a5a14'], [1, '#4a260a']], 0, 0, 1, 1) +
    lg('gg-post', [[0, '#5a1f0a'], [0.3, '#b5471c'], [0.5, '#d9662f'], [0.75, '#8a2e10'], [1, '#4a1706']], 0, 0, 1, 0) +
    lg('gg-beam', [[0, '#d9662f'], [0.4, '#9a3412'], [1, '#4a1706']], 0, 0, 0, 1) +
    lg('gg-cord', [[0, '#5b3a1a'], [0.5, '#d9b27a'], [1, '#5b3a1a']], 0, 0, 1, 0);
  let art = rect(0, 0, w, h, 0, 'url(#gg-bg)');
  // lacquered frame: two posts with round finials, a top beam
  const pw = 15;
  art += rect(cx - R - 20, 12, pw, h - 26, 7, 'url(#gg-post)', 'stroke="#3a1205" stroke-width="2"');
  art += rect(cx + R + 5, 12, pw, h - 26, 7, 'url(#gg-post)', 'stroke="#3a1205" stroke-width="2"');
  art += rect(cx - R - 26, 4, R * 2 + 52, 18, 9, 'url(#gg-beam)', 'stroke="#3a1205" stroke-width="2"');
  art += rect(cx - R - 20, 8, R * 2 + 40, 3, 1.5, 'rgba(255,220,180,.5)');
  for (const x of [cx - R - 26, cx + R + 26]) art += ell(x, 13, 8, 8, '#f6d58a', 'stroke="#7a4510" stroke-width="2"');
  const hole = (sgn: number) => ({ x: cx + sgn * R * 0.36, y: cy - Math.sqrt(1 - 0.36 * 0.36) * R * 0.9 });
  // braided cords tying the gong to the beam
  for (const sgn of [-1, 1]) {
    const hp = hole(sgn);
    art += line(cx + sgn * R * 0.5, 22, hp.x, hp.y, '#3b2410', 6);
    art += line(cx + sgn * R * 0.5, 22, hp.x, hp.y, 'url(#gg-cord)', 3.6);
    art += `<line x1="${r1(cx + sgn * R * 0.5)}" y1="22" x2="${r1(hp.x)}" y2="${r1(hp.y)}" stroke="rgba(60,36,16,.55)" stroke-width="3.6" stroke-dasharray="2 4"/>`;
    art += ell(cx + sgn * R * 0.5, 22, 6, 6, '#e5e7eb', 'stroke="#6b7280" stroke-width="2"');
  }
  const zones: Zone[] = [];
  zones.push({
    id: 'gong:boss',
    shape: { t: 'ell', cx, cy, rx: R * 0.42, ry: R * 0.42 },
    role: 'play',
    voices: [instHz('gong', 147)],
    mute: true,
  });
  zones.push({
    id: 'gong:rim',
    shape: { t: 'ell', cx, cy, rx: R, ry: R },
    role: 'play',
    voices: [instHz('gong', 110)],
    mute: true,
    small: false,
  });
  // the disc: a rolled rim, concentric lathe rings and hammer marks across the bronze face
  let rings = '';
  [0.8, 0.7, 0.6, 0.52].forEach((k, i) => {
    rings += ell(cx, cy, R * k, R * k, 'none', `stroke="rgba(70,32,4,${0.3 - i * 0.04})" stroke-width="${3 - i * 0.4}"`);
    rings += ell(cx, cy, R * k, R * k, 'none', `stroke="rgba(255,235,170,${0.28 - i * 0.04})" stroke-width="1.5" transform="translate(-1.5 -1.5)"`);
  });
  const holes = [-1, 1].map((sgn) => {
    const hp = hole(sgn);
    return ell(hp.x, hp.y, 7, 7, '#1c0a02', 'stroke="#f6d58a" stroke-width="2.5"');
  });
  art += zg(
    'gong:rim',
    ell(cx + 3, cy + 6, R, R, 'rgba(0,0,0,.2)') +
      ell(cx, cy, R, R, 'url(#gg-rim)', 'stroke="#3a1c06" stroke-width="4"') +
      ell(cx, cy, R * 0.93, R * 0.93, 'url(#gg-disc)', 'stroke="#4a260a" stroke-width="2.5"') +
      hammered(cx, cy, R * 0.91, 90, 21, R * 0.4) +
      rings +
      ell(cx - R * 0.4, cy - R * 0.5, R * 0.3, R * 0.1, 'rgba(255,250,220,.35)', `transform="rotate(-35 ${r1(cx - R * 0.4)} ${r1(cy - R * 0.5)})"`) +
      holes.join(''),
  );
  art += zg(
    'gong:boss',
    ell(cx, cy, R * 0.42, R * 0.42, 'rgba(70,32,4,.55)') +
      ell(cx, cy, R * 0.4, R * 0.4, 'url(#gg-boss)', 'stroke="#6a3a0c" stroke-width="4"') +
      ell(cx, cy, R * 0.33, R * 0.33, 'none', 'stroke="rgba(255,240,190,.5)" stroke-width="2"') +
      ell(cx, cy, R * 0.2, R * 0.2, 'none', 'stroke="rgba(90,45,6,.35)" stroke-width="2.5"') +
      ell(cx - R * 0.12, cy - R * 0.14, R * 0.12, R * 0.065, 'rgba(255,255,255,.8)', `transform="rotate(-30 ${r1(cx - R * 0.12)} ${r1(cy - R * 0.14)})"`),
  );
  return {
    kind: 'gong',
    family: 'gong',
    w,
    h,
    portrait,
    harmony,
    zones: [zones[0]!, zones[1]!],
    svg: wrap(w, h, defs, art, 'Cồng chiêng'),
    glide: false,
  };
}
