import type { DrumKind } from '../../../core/audio';
import { brassGrad, chromeGrad, groundShadow, lg, rg, rnd } from './art';
import { Frame, ell, line, radGrad, rect, shade, wrap, zg } from './svg';
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

/** Points of a lit chrome ring around an ellipse, as little bolts. */
function bolts(cx: number, cy: number, rx: number, ry: number, n: number, size: number, from = 0, to = Math.PI * 2): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = from + ((i + 0.5) / n) * (to - from);
    out += ell(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, size, size, 'url(#kit-chrome)', 'stroke="#475569" stroke-width="1"');
  }
  return out;
}

/** A cymbal seen from the front and a little above: brass, lathe rings, a bell and a streak of light. */
function cymbalArt(cx: number, cy: number, r: number, ry: number, id: string, soft: boolean): string {
  let g = ell(cx + r * 0.03, cy + ry * 0.06, r, ry, 'rgba(0,0,0,.14)');
  g += ell(cx, cy, r, ry, 'url(#kit-brass)', 'stroke="#7a4a08" stroke-width="2.5"');
  for (let k = 0; k < 9; k++) {
    const t = 0.34 + k * 0.073;
    g += ell(cx, cy, r * t, ry * t, 'none', `stroke="${k % 2 ? 'rgba(255,248,200,.3)' : 'rgba(120,70,0,.22)'}" stroke-width="${k % 2 ? 1.1 : 1.6}"`);
  }
  // the bell
  g += ell(cx, cy, r * 0.27, ry * 0.27, 'rgba(90,50,0,.35)');
  g += ell(cx - r * 0.01, cy - ry * 0.02, r * 0.24, ry * 0.24, `url(#kit-bell-${id})`, 'stroke="#8a5a0b" stroke-width="1.5"');
  g += ell(cx - r * 0.08, cy - ry * 0.1, r * 0.08, ry * 0.07, 'rgba(255,255,255,.7)');
  // light running round the upper-left rim
  const arc = (a0: number, a1: number, k: number) =>
    `M${(cx + Math.cos(a0) * r * k).toFixed(1)} ${(cy + Math.sin(a0) * ry * k).toFixed(1)} A${(r * k).toFixed(1)} ${(ry * k).toFixed(1)} 0 0 1 ${(cx + Math.cos(a1) * r * k).toFixed(1)} ${(cy + Math.sin(a1) * ry * k).toFixed(1)}`;
  g += `<path d="${arc(3.5, 4.6, 0.9)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="${soft ? 3 : 4.5}" stroke-linecap="round"/>`;
  g += `<path d="${arc(0.2, 1.1, 0.9)}" fill="none" stroke="rgba(110,60,0,.28)" stroke-width="4" stroke-linecap="round"/>`;
  return g;
}

/** A tom, snare or floor tom: head, chrome hoop, lugs and a glittering wrap, seen from the drummer's seat. */
function drumArt(p: Piece, i: number, cx: number, cy: number, r: number, floorY: number): string {
  const snare = p.type === 'snare';
  const rx = r;
  const ry = r * 0.78;
  const hy = cy - r * 0.1;
  const sh = r * (snare ? 0.32 : 0.46);
  const bot = (dx: number) => hy + sh + ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));
  let g = '';
  const under = hy + sh + ry * 0.9;
  if (p.id === 'd:floor' || snare) {
    // legs / a tripod stand down to the floor
    const spread = rx * (snare ? 0.7 : 0.8);
    for (const dx of [-spread, 0, spread]) g += line(cx + dx * 0.6, under - ry * 0.3, cx + dx, floorY, 'url(#kit-chrome-h)', 5);
  } else {
    // a mounting rod and clamp, going down toward the kick
    g += rect(cx - 3.5, under - ry * 0.2, 7, r * 0.8, 3, 'url(#kit-chrome-h)', 'stroke="#475569" stroke-width="1"');
  }
  g += ell(cx + r * 0.04, hy + sh + ry * 0.92, rx * 1.02, ry * 0.3, 'rgba(0,0,0,.16)');
  // the shell
  g += `<path d="M${(cx - rx).toFixed(1)} ${hy.toFixed(1)} L${(cx - rx).toFixed(1)} ${(hy + sh).toFixed(1)} A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(cx + rx).toFixed(1)} ${(hy + sh).toFixed(1)} L${(cx + rx).toFixed(1)} ${hy.toFixed(1)} Z" fill="url(#kit-shell-${i})" stroke="#0f172a" stroke-opacity=".55" stroke-width="2.5" stroke-linejoin="round"/>`;
  // bottom hoop (chrome) following the curve
  g += `<path d="M${(cx - rx).toFixed(1)} ${(hy + sh).toFixed(1)} A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(cx + rx).toFixed(1)} ${(hy + sh).toFixed(1)}" fill="none" stroke="#475569" stroke-width="${(r * 0.1).toFixed(1)}" stroke-linecap="round"/>`;
  g += `<path d="M${(cx - rx).toFixed(1)} ${(hy + sh).toFixed(1)} A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(cx + rx).toFixed(1)} ${(hy + sh).toFixed(1)}" fill="none" stroke="url(#kit-chrome-h)" stroke-width="${(r * 0.06).toFixed(1)}" stroke-linecap="round"/>`;
  // lugs on the shell
  for (let k = 0; k < 7; k++) {
    const t = -0.78 + k * 0.26;
    const x = cx + rx * t;
    const y0 = bot(rx * t) - sh * 0.9;
    g += rect(x - r * 0.04, y0 - sh * 0.1, r * 0.08, sh * 0.62, 2, 'url(#kit-chrome-h)', 'stroke="#475569" stroke-width="1"');
  }
  if (snare) {
    // strainer lever and wire shadow at the side
    g += rect(cx + rx * 0.9, hy + sh * 0.1, r * 0.2, sh * 0.5, 3, 'url(#kit-chrome-h)', 'stroke="#475569" stroke-width="1.2"');
    g += ell(cx + rx * 1.12, hy + sh * 0.35, r * 0.06, r * 0.06, '#1e293b');
  }
  // the head and the top hoop
  g += ell(cx, hy, rx, ry, 'url(#kit-chrome-h)', 'stroke="#334155" stroke-width="3"');
  g += ell(cx, hy, rx * 0.93, ry * 0.93, '#94a3b8');
  g += ell(cx, hy, rx * 0.9, ry * 0.9, 'url(#kit-skin)', 'stroke="#cbd5e1" stroke-width="2"');
  g += ell(cx, hy, rx * 0.55, ry * 0.55, 'none', 'stroke="rgba(148,163,184,.45)" stroke-width="2"');
  if (snare) for (let k = -3; k <= 3; k++) g += line(cx - rx * 0.78, hy + k * ry * 0.09, cx + rx * 0.78, hy + k * ry * 0.09, 'rgba(71,85,105,.22)', 1.4);
  g += ell(cx - rx * 0.3, hy - ry * 0.35, rx * 0.34, ry * 0.12, 'rgba(255,255,255,.75)');
  // tension rods on the hoop
  g += bolts(cx, hy, rx * 0.96, ry * 0.96, 10, r * 0.035, 0, Math.PI * 2);
  return g;
}

/** The kick drum seen from the front: painted wood hoop, claws and rods, a port hole and a bright head. */
function kickArt(cx: number, cy: number, r: number): string {
  let g = groundShadow(cx, cy + r * 0.96, r * 0.95, r * 0.12, 0.25);
  // spurs
  g += line(cx - r * 0.86, cy + r * 0.6, cx - r * 1.08, cy + r * 1.0, 'url(#kit-chrome-h)', 7);
  g += line(cx + r * 0.86, cy + r * 0.6, cx + r * 1.08, cy + r * 1.0, 'url(#kit-chrome-h)', 7);
  g += ell(cx, cy, r, r, 'url(#kit-hoop)', 'stroke="#450a0a" stroke-width="4"');
  g += ell(cx, cy, r * 0.9, r * 0.9, 'none', 'stroke="rgba(255,255,255,.22)" stroke-width="3"');
  // claws and tension rods
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const x = cx + Math.cos(a) * r * 0.9;
    const y = cy + Math.sin(a) * r * 0.9;
    g += `<g transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})">${rect(x - r * 0.07, y - r * 0.04, r * 0.14, r * 0.08, 2, 'url(#kit-chrome-h)', 'stroke="#475569" stroke-width="1"')}</g>`;
  }
  g += ell(cx, cy, r * 0.8, r * 0.8, '#fecaca', 'stroke="#b91c1c" stroke-width="2.5"');
  g += ell(cx, cy, r * 0.77, r * 0.77, 'url(#kit-kickhead)');
  g += ell(cx, cy, r * 0.5, r * 0.5, 'none', 'stroke="rgba(185,28,28,.22)" stroke-width="3"');
  // port hole
  g += ell(cx + r * 0.3, cy + r * 0.28, r * 0.17, r * 0.17, 'url(#kit-chrome-h)', 'stroke="#475569" stroke-width="2"');
  g += ell(cx + r * 0.3, cy + r * 0.28, r * 0.13, r * 0.13, '#1c0a0a');
  g += ell(cx - r * 0.3, cy - r * 0.32, r * 0.3, r * 0.14, 'rgba(255,255,255,.55)');
  return g;
}

/**
 * A drum kit seen from the drummer's seat: crash and ride cymbals up top, two toms
 * in the middle, hi-hat on the left, snare in front, floor tom on the right and the
 * big kick drum below. (No open hi-hat: the synth has only one.)
 */
export function layoutKit(kind: DrumKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const pieces = portrait ? KIT_PORT : KIT_LAND;
  const soft = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-lite');
  let defs =
    rg('kit-skin', [[0, '#ffffff'], [0.7, '#f1f5f9'], [1, '#cbd5e1']], 0.42, 0.38, 0.75) +
    brassGrad('kit-brass') +
    lg('kit-chrome-h', [[0, '#64748b'], [0.2, '#f8fafc'], [0.45, '#94a3b8'], [0.7, '#e2e8f0'], [1, '#64748b']], 0, 0, 1, 0) +
    chromeGrad('kit-chrome') +
    rg('kit-hoop', [[0, '#ef4444'], [0.6, '#b91c1c'], [1, '#7f1d1d']], 0.4, 0.35, 0.8) +
    rg('kit-kickhead', [[0, '#fffdf8'], [0.7, '#fbeee6'], [1, '#f0cfc2']], 0.4, 0.35, 0.75) +
    lg('kit-wall', [[0, '#f6f0ff'], [1, '#d9cdfa']]) +
    lg('kit-floor', [[0, '#d6a46a'], [1, '#a87238']]) +
    rg('kit-rug', [[0, '#7c3aed'], [1, '#4c1d95']], 0.5, 0.5, 0.6);
  let art = rect(0, 0, w, h, 0, 'url(#kit-wall)');
  const fy = h * 0.93;
  art += rect(0, fy, w, h - fy, 0, 'url(#kit-floor)');
  for (let x = w * 0.08; x < w; x += w * 0.16) art += line(x, fy, x - w * 0.02, h, 'rgba(90,50,10,.25)', 1.5);
  art += line(0, fy, w, fy, 'rgba(90,50,10,.35)', 2);
  // a round rug under the kit
  art += ell(w * 0.5, h * 0.8, w * 0.46, h * 0.16, 'rgba(76,29,149,.14)');
  const zones: Zone[] = [];
  const ordered = [...pieces].sort((a, b) => (a.type === 'kick' ? -1 : b.type === 'kick' ? 1 : 0));
  // stands first, so the cymbals sit on top of them
  for (const p of ordered) {
    const cx = p.x * w;
    const cy = p.y * h;
    if (p.type === 'cymbal' || p.type === 'hat') {
      art += groundShadow(cx, fy + 3, w * 0.07, 4, 0.2);
      art += rect(cx - 3, cy, 6, fy - cy, 2, 'url(#kit-chrome-h)', 'stroke="#475569" stroke-width="1"');
      // tripod feet
      art += line(cx, fy - 4, cx - w * 0.05, fy + 2, 'url(#kit-chrome-h)', 4);
      art += line(cx, fy - 4, cx + w * 0.05, fy + 2, 'url(#kit-chrome-h)', 4);
    }
  }
  const SHELLS: Record<string, string> = { tom: '#3b82f6', snare: '#cbd5e1' };
  ordered.forEach((p, i) => {
    if (p.type === 'cymbal' || p.type === 'hat' || p.type === 'kick') return;
    const c = p.color ?? SHELLS[p.type] ?? '#3b82f6';
    defs += lg(`kit-shell-${i}`, [[0, shade(c, -0.55)], [0.18, shade(c, -0.1)], [0.38, shade(c, 0.5)], [0.55, c], [1, shade(c, -0.6)]], 0, 0, 1, 0);
  });
  ordered.forEach((p, i) => {
    const cx = p.x * w;
    const cy = p.y * h;
    const r = p.r * (portrait ? w : h);
    const isCym = p.type === 'cymbal' || p.type === 'hat';
    const ry = isCym ? r * 0.82 : r;
    let g = '';
    if (isCym) {
      defs += rg(`kit-bell-${p.id}`, [[0, '#fff2b0'], [0.6, '#e0a81f'], [1, '#9a6508']], 0.38, 0.32, 0.75);
      if (p.type === 'hat') g += cymbalArt(cx, cy + ry * 0.14, r * 0.97, ry * 0.97, `${p.id}b`, soft);
      g += cymbalArt(cx, cy, r, ry, p.id, soft);
      if (p.type === 'hat') defs += rg(`kit-bell-${p.id}b`, [[0, '#d9b45a'], [1, '#8a5a0b']], 0.4, 0.35, 0.7);
    } else if (p.type === 'kick') g += kickArt(cx, cy, r);
    else g += drumArt(p, i, cx, cy, r, fy);
    zones.push({ id: p.id, shape: { t: 'ell', cx, cy, rx: r, ry }, role: 'play', voices: [drum(p.drum)] });
    art += zg(p.id, g, p.type === 'kick' ? 'kick' : '');
  });
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

/** Gradients the rack drawings share (each is fixed to a shape's own box, so one id serves every pad). */
const RACK_DEFS =
  lg('rk-brass', [[0, '#6b3f06'], [0.14, '#c98d12'], [0.32, '#f9d86a'], [0.4, '#fff7cc'], [0.5, '#f5c542'], [0.74, '#c98d12'], [1, '#6b3f06']], 0, 0, 1, 0) +
  lg('rk-steel', [[0, '#4b5563'], [0.15, '#cbd5e1'], [0.32, '#ffffff'], [0.5, '#94a3b8'], [0.8, '#d5dde8'], [1, '#4b5563']], 0, 0, 1, 1) +
  lg('rk-wood', [[0, '#e0954a'], [0.35, '#bd6a22'], [1, '#6b2f0a']], 0, 0, 0, 1) +
  rg('rk-egg', [[0, '#ffe08a'], [0.35, '#f59e0b'], [0.8, '#b45309'], [1, '#6b2f0a']], 0.38, 0.3, 0.8) +
  lg('rk-skin', [[0, '#ffe3c4'], [0.5, '#f8c08c'], [1, '#d98b55']], 0, 0, 1, 1) +
  rg('rk-pad', [[0, '#ffffff'], [1, '#ffffff', 0]], 0.5, 0.4, 0.7);

/** One hand, palm towards us, fingers up, drawn in a box of size r around (0,0). */
function hand(r: number): string {
  const skin = 'url(#rk-skin)';
  const st = 'stroke="#b4673a" stroke-width="2.6" stroke-linejoin="round"';
  let o = '';
  // thumb on the inner side
  o += `<g transform="rotate(32 ${(-r * 0.2).toFixed(1)} ${(r * 0.2).toFixed(1)})">${rect(-r * 0.3, -r * 0.12, r * 0.16, r * 0.36, r * 0.08, skin, st)}</g>`;
  // palm
  o += rect(-r * 0.22, -r * 0.02, r * 0.44, r * 0.46, r * 0.14, skin, st);
  // four fingers, the middle ones longest
  const fingers: Array<[number, number]> = [[-0.165, 0.3], [-0.055, 0.38], [0.055, 0.35], [0.165, 0.26]];
  for (const [x, hgt] of fingers) o += rect(r * (x - 0.05), -r * hgt, r * 0.1, r * (hgt + 0.1), r * 0.05, skin, st);
  // palm crease and a soft highlight
  o += `<path d="M${(-r * 0.14).toFixed(1)} ${(r * 0.22).toFixed(1)} q${(r * 0.14).toFixed(1)} ${(r * 0.1).toFixed(1)} ${(r * 0.3).toFixed(1)} ${(-r * 0.04).toFixed(1)}" fill="none" stroke="rgba(150,80,40,.45)" stroke-width="2" stroke-linecap="round"/>`;
  o += rect(-r * 0.16, r * 0.04, r * 0.07, r * 0.28, r * 0.03, 'rgba(255,255,255,.4)');
  return o;
}

function rackArt(d: DrumKind, cx: number, cy: number, r: number): string {
  switch (d) {
    case 'cowbell': {
      // a tapering steel-bright bell: flat top with a handle, an open mouth below, rivets
      const body = `M${(cx - r * 0.26).toFixed(1)} ${(cy - r * 0.38).toFixed(1)} L${(cx + r * 0.26).toFixed(1)} ${(cy - r * 0.38).toFixed(1)} C${(cx + r * 0.3).toFixed(1)} ${(cy - r * 0.1).toFixed(1)} ${(cx + r * 0.46).toFixed(1)} ${(cy + r * 0.2).toFixed(1)} ${(cx + r * 0.5).toFixed(1)} ${(cy + r * 0.42).toFixed(1)} L${(cx - r * 0.5).toFixed(1)} ${(cy + r * 0.42).toFixed(1)} C${(cx - r * 0.46).toFixed(1)} ${(cy + r * 0.2).toFixed(1)} ${(cx - r * 0.3).toFixed(1)} ${(cy - r * 0.1).toFixed(1)} ${(cx - r * 0.26).toFixed(1)} ${(cy - r * 0.38).toFixed(1)} Z`;
      return (
        ell(cx + r * 0.04, cy + r * 0.5, r * 0.55, r * 0.1, 'rgba(0,0,0,.18)') +
        rect(cx - r * 0.2, cy - r * 0.55, r * 0.4, r * 0.12, r * 0.05, 'url(#rk-steel)', 'stroke="#334155" stroke-width="2.5"') +
        `<path d="${body}" fill="url(#rk-brass)" stroke="#6b3f06" stroke-width="3" stroke-linejoin="round"/>` +
        ell(cx, cy - r * 0.38, r * 0.26, r * 0.06, '#8a5a0b', 'stroke="#6b3f06" stroke-width="2"') +
        ell(cx, cy + r * 0.42, r * 0.5, r * 0.11, '#1c0f02', 'stroke="#f5c542" stroke-width="3"') +
        ell(cx - r * 0.06, cy + r * 0.44, r * 0.26, r * 0.04, 'rgba(255,200,90,.35)') +
        line(cx - r * 0.22, cy - r * 0.3, cx - r * 0.36, cy + r * 0.34, 'rgba(255,255,255,.55)', 3.5) +
        ell(cx - r * 0.2, cy - r * 0.02, r * 0.035, r * 0.035, '#fde68a', 'stroke="#6b3f06" stroke-width="1.5"') +
        ell(cx + r * 0.2, cy - r * 0.02, r * 0.035, r * 0.035, '#fde68a', 'stroke="#6b3f06" stroke-width="1.5"')
      );
    }
    case 'wood': {
      // a hollow wood block: grain, bevelled top edge and a long slit mouth
      let grain = '';
      for (let k = 0; k < 7; k++) grain += line(cx - r * 0.56, cy - r * 0.22 + k * r * 0.075, cx + r * 0.56, cy - r * 0.22 + k * r * 0.075 + (k % 2 ? 1.5 : -1.5), k % 2 ? 'rgba(60,25,4,.22)' : 'rgba(255,225,170,.22)', 1.4);
      return (
        ell(cx, cy + r * 0.4, r * 0.62, r * 0.08, 'rgba(0,0,0,.16)') +
        rect(cx - r * 0.62, cy - r * 0.33, r * 1.24, r * 0.7, r * 0.2, 'rgba(0,0,0,.2)', 'transform="translate(2 4)"') +
        rect(cx - r * 0.62, cy - r * 0.33, r * 1.24, r * 0.7, r * 0.2, 'url(#rk-wood)', 'stroke="#4a2008" stroke-width="3.5"') +
        grain +
        rect(cx - r * 0.54, cy - r * 0.28, r * 1.08, r * 0.1, r * 0.05, 'rgba(255,235,190,.5)') +
        rect(cx - r * 0.44, cy - r * 0.05, r * 0.88, r * 0.12, r * 0.06, '#1c0a02', 'stroke="rgba(255,225,170,.5)" stroke-width="1.5"') +
        rect(cx - r * 0.4, cy - r * 0.02, r * 0.8, r * 0.04, r * 0.02, 'rgba(0,0,0,.6)')
      );
    }
    case 'triangle': {
      // polished steel rod bent into a triangle with one open corner, hung on a cord
      const p = (x: number, y: number) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`;
      const tri = `M${p(0.07, -0.44)} L${p(0.6, 0.4)} L${p(-0.6, 0.4)} L${p(-0.07, -0.44)}`;
      const L = (wd: number, col: string) => `<path d="${tri}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linejoin="round" stroke-linecap="round"/>`;
      return (
        L(14, 'rgba(0,0,0,.14)').replace('<path', '<path transform="translate(2 4)"') +
        L(11, '#475569') +
        L(8.5, '#94a3b8') +
        L(5, '#cbd5e1') +
        L(1.8, '#ffffff') +
        `<path d="M${p(0.0, -0.45)} C${p(-0.06, -0.62)} ${p(0.06, -0.7)} ${p(0.0, -0.78)}" fill="none" stroke="#5b3a1a" stroke-width="3.5" stroke-linecap="round"/>` +
        ell(cx, cy - r * 0.8, 4.5, 4.5, '#a16207', 'stroke="#5b3a1a" stroke-width="1.5"') +
        ell(cx, cy - r * 0.46, 4, 3, '#a16207')
      );
    }
    case 'shaker': {
      // an egg shaker: glossy shell with a seam, a painted band and loose seeds showing as specks
      let seeds = '';
      for (let k = 0; k < 14; k++) {
        const a = rnd(k * 2 + 1) * Math.PI * 2;
        const dd = Math.sqrt(rnd(k * 2 + 2)) * 0.8;
        seeds += ell(cx + Math.cos(a) * r * 0.36 * dd, cy + Math.sin(a) * r * 0.54 * dd, r * 0.022, r * 0.012, rnd(k) > 0.5 ? 'rgba(60,20,0,.45)' : 'rgba(255,240,190,.55)');
      }
      return (
        ell(cx, cy + r * 0.62, r * 0.4, r * 0.07, 'rgba(0,0,0,.16)') +
        ell(cx, cy, r * 0.42, r * 0.6, 'url(#rk-egg)', 'stroke="#5c2a08" stroke-width="3.5"') +
        seeds +
        rect(cx - r * 0.415, cy - r * 0.07, r * 0.83, r * 0.15, r * 0.04, '#7c2d12', 'stroke="#4a1a06" stroke-width="2"') +
        rect(cx - r * 0.38, cy - r * 0.05, r * 0.76, r * 0.035, 2, 'rgba(255,220,160,.55)') +
        ell(cx - r * 0.15, cy - r * 0.32, r * 0.09, r * 0.2, 'rgba(255,255,255,.65)') +
        ell(cx + r * 0.2, cy + r * 0.3, r * 0.12, r * 0.18, 'rgba(0,0,0,.12)')
      );
    }
    default: {
      // two hands clapping, with little sparks flying out
      const spark = (x1: number, y1: number, x2: number, y2: number) => line(cx + x1 * r, cy + y1 * r, cx + x2 * r, cy + y2 * r, '#f59e0b', 4);
      return (
        `<g transform="translate(${(cx - r * 0.36).toFixed(1)} ${(cy + r * 0.2).toFixed(1)}) rotate(12)">${hand(r * 1.3)}</g>` +
        `<g transform="translate(${(cx + r * 0.36).toFixed(1)} ${(cy + r * 0.2).toFixed(1)}) scale(-1 1) rotate(12)">${hand(r * 1.3)}</g>` +
        spark(0, -0.8, 0, -0.66) +
        spark(-0.3, -0.74, -0.22, -0.62) +
        spark(0.3, -0.74, 0.22, -0.62) +
        spark(-0.55, -0.55, -0.45, -0.46) +
        spark(0.55, -0.55, 0.45, -0.46)
      );
    }
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
      ell(cx, cy, r, r, it.color, `stroke="${shade(it.color, -0.3)}" stroke-width="4"`) +
        ell(cx, cy, r, r, 'url(#rk-pad)', 'opacity=".7"') +
        ell(cx, cy, r * 0.94, r * 0.94, 'none', 'stroke="rgba(255,255,255,.65)" stroke-width="2"') +
        rackArt(it.drum, cx, cy, r),
    );
  });
  return { kind, family: 'rack', w, h, portrait, harmony, zones, svg: wrap(w, h, RACK_DEFS, art, 'Nhạc cụ gõ nhịp'), glide: false };
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
  const defs = lg('dj-wood', [[0, '#d98a34'], [0.35, '#a5581a'], [0.7, '#7a3c10'], [1, '#4a2208']], 0, 0, portrait ? 1 : 0, portrait ? 0 : 1) + radGrad('dj-skin', '#fffbeb', '#e7d3a8') + lg('dj-chrome', [[0, '#64748b'], [0.3, '#f1f5f9'], [0.6, '#94a3b8'], [1, '#475569']], 0, 0, 1, 1);
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
  // wood grain and a carved band on the foot
  for (let i = 0; i < 9; i++) {
    const vv = vc - V * 0.3 + (i / 8) * V * 0.6;
    art += f.line(U * 0.64, vv * 0.4 + vc * 0.6, footU - 6, vv * 0.8 + vc * 0.2, 'rgba(255,230,180,.1)', 1.4);
  }
  art += f.rect(footU - U * 0.07, vc - V * 0.33, U * 0.012, V * 0.66, 2, 'rgba(60,25,5,.45)');
  art += f.rect(footU - U * 0.045, vc - V * 0.33, U * 0.012, V * 0.66, 2, 'rgba(60,25,5,.45)');
  // rope lacing: a zigzag from the iron ring down to the waist, all the way round
  const nz = 8;
  const ropeA = headU + hr * 0.18;
  const ropeB = U * 0.6;
  let rope = '';
  for (let k = 0; k < nz; k++) {
    const t0 = -0.9 + (k / (nz - 1)) * 1.8;
    const t1 = -0.9 + ((k + 0.5) / (nz - 1)) * 1.8;
    rope += f.line(ropeA, vc + t0 * hr * 0.88, ropeB, vc + t0 * waist * 0.9, 'rgba(60,30,8,.55)', 4);
    rope += f.line(ropeB, vc + t0 * waist * 0.9, ropeA, vc + t1 * hr * 0.88, 'rgba(240,215,160,.9)', 3);
  }
  art += rope;
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
      f.ell(headU, vc, hr * 0.78, hr * 0.97, 'url(#dj-chrome)', 'stroke="#334155" stroke-width="2"') +
      f.ell(headU, vc, hr * 0.74, hr * 0.92, 'url(#dj-skin)', 'stroke="#a16207" stroke-width="3"') +
      f.ell(headU - hr * 0.2, vc - hr * 0.3, hr * 0.2, hr * 0.38, 'rgba(255,255,255,.5)'),
  );
  art += zg(
    'djembe:center',
    f.ell(headU, vc, hr * 0.8 * 0.55, hr * 0.55, 'rgba(180,83,9,.16)', 'stroke="#b45309" stroke-width="3" stroke-dasharray="8 6"'),
  );
  return { kind: 'djembe', family: 'djembe', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Trống djembe'), glide: false };
}
