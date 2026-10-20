import type { DrumKind } from '../../../core/audio';
import { Frame, ell, line, linGrad, path, radGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { drum, instHz } from './voices';

interface Piece {
  id: string;
  drum: DrumKind;
  /** Centre as a fraction of the board, radius as a fraction of `h` (landscape) or `w` (portrait). */
  x: number;
  y: number;
  r: number;
  type: 'cymbal' | 'tom' | 'snare' | 'hat' | 'kick';
  color?: string;
}

const KIT_LAND: Piece[] = [
  { id: 'd:crash', drum: 'crash', x: 0.11, y: 0.27, r: 0.17, type: 'cymbal' },
  { id: 'd:tom1', drum: 'tom', x: 0.33, y: 0.24, r: 0.15, type: 'tom', color: '#3b82f6' },
  { id: 'd:tom2', drum: 'tom', x: 0.53, y: 0.24, r: 0.15, type: 'tom', color: '#2563eb' },
  { id: 'd:ride', drum: 'ride', x: 0.87, y: 0.27, r: 0.17, type: 'cymbal' },
  { id: 'd:hat', drum: 'hat', x: 0.11, y: 0.72, r: 0.16, type: 'hat' },
  { id: 'd:snare', drum: 'snare', x: 0.32, y: 0.72, r: 0.16, type: 'snare' },
  { id: 'd:kick', drum: 'kick', x: 0.56, y: 0.74, r: 0.23, type: 'kick', color: '#ef4444' },
  { id: 'd:floor', drum: 'tom', x: 0.82, y: 0.72, r: 0.17, type: 'tom', color: '#1d4ed8' },
];
const KIT_PORT: Piece[] = [
  { id: 'd:crash', drum: 'crash', x: 0.22, y: 0.1, r: 0.15, type: 'cymbal' },
  { id: 'd:ride', drum: 'ride', x: 0.78, y: 0.1, r: 0.15, type: 'cymbal' },
  { id: 'd:tom1', drum: 'tom', x: 0.33, y: 0.28, r: 0.14, type: 'tom', color: '#3b82f6' },
  { id: 'd:tom2', drum: 'tom', x: 0.67, y: 0.28, r: 0.14, type: 'tom', color: '#2563eb' },
  { id: 'd:hat', drum: 'hat', x: 0.15, y: 0.5, r: 0.14, type: 'hat' },
  { id: 'd:snare', drum: 'snare', x: 0.5, y: 0.5, r: 0.16, type: 'snare' },
  { id: 'd:floor', drum: 'tom', x: 0.85, y: 0.5, r: 0.14, type: 'tom', color: '#1d4ed8' },
  { id: 'd:kick', drum: 'kick', x: 0.5, y: 0.8, r: 0.27, type: 'kick', color: '#ef4444' },
];

/**
 * A drum kit seen from the drummer's seat: crash and ride cymbals up top, two toms
 * in the middle, hi-hat on the left, snare in front, floor tom on the right and the
 * big kick drum below. (No open hi-hat: the synth has only one.)
 */
export function layoutKit(kind: DrumKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const pieces = portrait ? KIT_PORT : KIT_LAND;
  const defs =
    radGrad('kit-skin', '#ffffff', '#e2e8f0') + radGrad('kit-gold', '#fde68a', '#ca8a04') + radGrad('kit-kick', '#fecaca', '#dc2626');
  let art = rect(0, 0, w, h, 0, '#ede9fe');
  art += rect(0, h * 0.94, w, h * 0.06, 0, '#c4b5fd');
  const zones: Zone[] = [];
  const ordered = [...pieces].sort((a, b) => (a.type === 'kick' ? -1 : b.type === 'kick' ? 1 : 0));
  // stands first, so the cymbals sit on top of them
  for (const p of ordered) {
    const cx = p.x * w;
    const cy = p.y * h;
    if (p.type === 'cymbal' || p.type === 'hat') art += line(cx, cy, cx, h * 0.94, '#78716c', 5);
  }
  for (const p of ordered) {
    const cx = p.x * w;
    const cy = p.y * h;
    const r = p.r * (portrait ? w : h);
    const isCym = p.type === 'cymbal' || p.type === 'hat';
    const ry = isCym ? r * 0.82 : r;
    let g = '';
    if (isCym) {
      g += ell(cx, cy, r, ry, 'url(#kit-gold)', 'stroke="#92400e" stroke-width="3"');
      g += ell(cx, cy, r * 0.66, ry * 0.66, 'none', 'stroke="rgba(120,53,15,.45)" stroke-width="2"');
      g += ell(cx, cy, r * 0.3, ry * 0.3, '#fbbf24', 'stroke="#92400e" stroke-width="2"');
      if (p.type === 'hat') g += ell(cx, cy + ry * 0.12, r, ry, 'rgba(0,0,0,.12)');
    } else if (p.type === 'kick') {
      g += ell(cx, cy, r, ry, p.color ?? '#ef4444', 'stroke="#7f1d1d" stroke-width="4"');
      g += ell(cx, cy, r * 0.84, ry * 0.84, 'url(#kit-kick)', 'stroke="#fff" stroke-width="3"');
      g += ell(cx, cy, r * 0.28, ry * 0.28, '#7f1d1d');
    } else {
      const shell = p.color ?? (p.type === 'snare' ? '#9ca3af' : '#2563eb');
      g += ell(cx, cy, r, ry, shell, 'stroke="#1e293b" stroke-width="4"');
      g += ell(cx, cy, r * 0.84, ry * 0.84, 'url(#kit-skin)', 'stroke="#cbd5e1" stroke-width="2"');
      if (p.type === 'snare')
        for (let i = -2; i <= 2; i++)
          g += line(cx - r * 0.7, cy + i * r * 0.14, cx + r * 0.7, cy + i * r * 0.14, 'rgba(100,116,139,.35)', 2);
    }
    zones.push({ id: p.id, shape: { t: 'ell', cx, cy, rx: r, ry }, role: 'play', voices: [drum(p.drum)] });
    art += zg(p.id, g, p.type === 'kick' ? 'kick' : '');
  }
  return {
    kind,
    family: 'kit',
    w,
    h,
    portrait,
    harmony,
    zones: ordered
      .filter((p) => p.type !== 'kick')
      .map((p) => zones.find((z) => z.id === p.id)!)
      .concat(zones.filter((z) => z.id === 'd:kick')),
    svg: wrap(w, h, defs, art, 'Bộ trống'),
    glide: false,
  };
}

const RACK: Array<{ drum: DrumKind; color: string; name: string }> = [
  { drum: 'cowbell', color: '#fef3c7', name: 'Chuông bò' },
  { drum: 'wood', color: '#ffedd5', name: 'Mõ gỗ' },
  { drum: 'triangle', color: '#dbeafe', name: 'Tam giác' },
  { drum: 'shaker', color: '#dcfce7', name: 'Lắc cát' },
  { drum: 'clap', color: '#fce7f3', name: 'Vỗ tay' },
];

function rackArt(d: DrumKind, cx: number, cy: number, r: number): string {
  switch (d) {
    case 'cowbell':
      return (
        path(
          `M${cx - r * 0.5} ${cy + r * 0.45} L${cx - r * 0.3} ${cy - r * 0.4} L${cx + r * 0.3} ${cy - r * 0.4} L${cx + r * 0.5} ${cy + r * 0.45} Z`,
          '#eab308',
          'stroke="#854d0e" stroke-width="4" stroke-linejoin="round"',
        ) +
        rect(cx - r * 0.3, cy - r * 0.5, r * 0.6, r * 0.14, 4, '#713f12') +
        ell(cx, cy + r * 0.45, r * 0.5, r * 0.1, '#422006') +
        rect(cx - r * 0.18, cy - r * 0.3, r * 0.1, r * 0.6, 4, 'rgba(255,255,255,.5)')
      );
    case 'wood':
      return (
        rect(cx - r * 0.6, cy - r * 0.32, r * 1.2, r * 0.64, r * 0.2, '#b45309', 'stroke="#78350f" stroke-width="4"') +
        rect(cx - r * 0.42, cy - r * 0.04, r * 0.84, r * 0.1, r * 0.05, '#451a03') +
        rect(cx - r * 0.5, cy - r * 0.25, r * 0.5, r * 0.08, 4, 'rgba(255,255,255,.35)')
      );
    case 'triangle':
      return (
        path(
          `M${cx} ${cy - r * 0.55} L${cx + r * 0.6} ${cy + r * 0.42} L${cx - r * 0.6} ${cy + r * 0.42} Z`,
          'none',
          'stroke="#64748b" stroke-width="9" stroke-linejoin="round"',
        ) + line(cx, cy - r * 0.55, cx, cy - r * 0.8, '#78350f', 3)
      );
    case 'shaker':
      return (
        ell(cx, cy, r * 0.42, r * 0.6, '#f59e0b', 'stroke="#92400e" stroke-width="4"') +
        rect(cx - r * 0.42, cy - r * 0.06, r * 0.84, r * 0.16, 6, '#7c2d12') +
        ell(cx - r * 0.14, cy - r * 0.3, r * 0.1, r * 0.18, 'rgba(255,255,255,.55)')
      );
    default:
      return (
        ell(cx - r * 0.26, cy, r * 0.22, r * 0.46, '#fdba74', 'stroke="#c2410c" stroke-width="4"') +
        ell(cx + r * 0.26, cy, r * 0.22, r * 0.46, '#fdba74', 'stroke="#c2410c" stroke-width="4"') +
        line(cx, cy - r * 0.7, cx, cy - r * 0.55, '#f59e0b', 4) +
        line(cx - r * 0.3, cy - r * 0.62, cx - r * 0.2, cy - r * 0.5, '#f59e0b', 4) +
        line(cx + r * 0.3, cy - r * 0.62, cx + r * 0.2, cy - r * 0.5, '#f59e0b', 4)
      );
  }
}

/** A rack of hand percussion: cowbell, wood block, triangle, shaker and clap, each a big pad. */
export function layoutRack(kind: DrumKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const cols = portrait ? 2 : 5;
  const rows = portrait ? 3 : 1;
  const cw = w / cols;
  const ch = h / rows;
  let art = rect(0, 0, w, h, 0, '#fff7ed');
  const zones: Zone[] = [];
  RACK.forEach((it, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 && portrait ? 1 : cols;
    const col = portrait && row === rows - 1 ? 0.5 : i % cols;
    void inRow;
    const cx = cw * (col + 0.5);
    const cy = ch * (row + 0.5);
    const r = Math.min(cw, ch) / 2 - 8;
    zones.push({ id: `r:${it.drum}`, shape: { t: 'ell', cx, cy, rx: r, ry: r }, role: 'play', voices: [drum(it.drum)] });
    art += zg(
      `r:${it.drum}`,
      ell(cx, cy, r, r, it.color, `stroke="${shade(it.color, -0.3)}" stroke-width="4"`) + rackArt(it.drum, cx, cy, r),
    );
  });
  return { kind, family: 'rack', w, h, portrait, harmony, zones, svg: wrap(w, h, '', art, 'Nhạc cụ gõ nhịp'), glide: false };
}

/**
 * Djembe: a goblet drum with three voices. The middle of the skin is the warm
 * "tone", the rim of the skin is the sharp "slap", and the foot is the deep "bass".
 */
export function layoutDjembe(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const vc = V / 2;
  const hr = Math.min(V * 0.47, U * 0.3);
  const headU = hr * 0.9 + 4;
  const defs = linGrad('dj-wood', '#b45309', '#78350f', false) + radGrad('dj-skin', '#fffbeb', '#e7d3a8');
  let art = rect(0, 0, w, h, 0, '#fef3c7');
  // body: head flares into a waist and a foot
  const waist = V * 0.15;
  const footU = U * 0.97;
  art += `<path d="${f.d([
    ['M', headU, vc - hr * 0.92],
    ['C', headU + U * 0.2, vc - hr * 0.9, U * 0.5, vc - waist, U * 0.62, vc - waist * 1.1],
    ['C', U * 0.75, vc - waist * 1.2, U * 0.82, vc - V * 0.3, footU, vc - V * 0.33],
    ['L', footU, vc + V * 0.33],
    ['C', U * 0.82, vc + V * 0.3, U * 0.75, vc + waist * 1.2, U * 0.62, vc + waist * 1.1],
    ['C', U * 0.5, vc + waist, headU + U * 0.2, vc + hr * 0.9, headU, vc + hr * 0.92],
    ['Z'],
  ])}" fill="url(#dj-wood)" stroke="#451a03" stroke-width="4"/>`;
  for (let i = 0; i < 5; i++)
    art += f.line(
      headU + U * 0.1 + i * U * 0.05,
      vc - hr * 0.5 + i * 2,
      headU + U * 0.14 + i * U * 0.05,
      vc + hr * 0.5 - i * 2,
      'rgba(255,255,255,.2)',
      3,
    );
  const zones: Zone[] = [];
  // foot (bass)
  const footShape = f.shapeEll(U * 0.86, vc, U * 0.1, V * 0.27);
  const centerShape = f.shapeEll(headU, vc, hr * 0.8 * 0.55, hr * 0.55);
  const edgeShape = f.shapeEll(headU, vc, hr * 0.8, hr);
  zones.push({ id: 'djembe:center', shape: centerShape, role: 'play', voices: [instHz('djembe', 300)] });
  zones.push({ id: 'djembe:edge', shape: edgeShape, role: 'play', voices: [instHz('djembe', 700)], small: true });
  zones.push({ id: 'djembe:bass', shape: footShape, role: 'play', voices: [instHz('djembe', 105)] });
  art += zg(
    'djembe:bass',
    f.ell(U * 0.86, vc, U * 0.1, V * 0.27, 'rgba(255,255,255,.1)', 'stroke="#fde68a" stroke-width="3" stroke-dasharray="8 6"'),
  );
  art += zg(
    'djembe:edge',
    f.ell(headU, vc, hr * 0.8, hr, '#92400e', 'stroke="#451a03" stroke-width="4"') +
      f.ell(headU, vc, hr * 0.74, hr * 0.92, 'url(#dj-skin)', 'stroke="#a16207" stroke-width="3"'),
  );
  art += zg(
    'djembe:center',
    f.ell(headU, vc, hr * 0.8 * 0.55, hr * 0.55, 'rgba(180,83,9,.16)', 'stroke="#b45309" stroke-width="3" stroke-dasharray="8 6"'),
  );
  return { kind: 'djembe', family: 'djembe', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Trống djembe'), glide: false };
}
