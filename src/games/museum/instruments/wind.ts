import { pentaFrom, tune } from './scale';
import { ell, Frame, line, linGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Voice, Zone } from './types';
import { inst, note } from './voices';

type TubeKind = 'flute' | 'trumpet' | 'sax';

const TUBE: Record<TubeKind, { name: string; holes: number; body: string; metal: string }> = {
  flute: { name: 'Sáo', holes: 4, body: '#e2e8f0', metal: '#94a3b8' },
  trumpet: { name: 'Kèn trumpet', holes: 3, body: '#fbbf24', metal: '#b45309' },
  sax: { name: 'Kèn saxophone', holes: 4, body: '#f59e0b', metal: '#92400e' },
};

/**
 * Flute, trumpet, saxophone. A big round mouthpiece to hold ("thổi"), and finger
 * holes / valves / keys along the tube that toggle covered or open. More holes
 * covered = a lower note, as on the real flute; the trumpet's three valves lower
 * it by 1, 2 and 3 semitones in any combination.
 */
export function layoutTube(kind: TubeKind, w: number, h: number, harmony: Harmony): Board {
  const sp = TUBE[kind];
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const vc = V / 2;
  const th = Math.min(V * 0.36, 112);
  const n = sp.holes;
  const defs = linGrad('tb-g', shade(sp.body, 0.5), shade(sp.body, -0.1), true);
  let art = rect(0, 0, w, h, 0, kind === 'flute' ? '#e0f2fe' : '#fef3c7');
  // body
  const bodyU0 = U * 0.14;
  const bodyU1 = U * 0.9;
  art += f.rect(U * 0.02, vc - th * 0.28, U * 0.14, th * 0.56, th * 0.2, shade(sp.metal, -0.1));
  art += f.rect(bodyU0, vc - th / 2, bodyU1 - bodyU0, th, th * 0.3, 'url(#tb-g)', `stroke="${sp.metal}" stroke-width="3"`);
  art += f.rect(bodyU0 + 8, vc - th / 2 + 6, bodyU1 - bodyU0 - 16, th * 0.2, th * 0.1, 'rgba(255,255,255,.55)');
  if (kind !== 'flute') {
    // bell
    art += `<path d="${f.d([
      ['M', bodyU1 - 6, vc - th / 2],
      ['L', U * 0.99, vc - Math.min(V * 0.48, th * 1.35)],
      ['L', U * 0.99, vc + Math.min(V * 0.48, th * 1.35)],
      ['L', bodyU1 - 6, vc + th / 2],
      ['Z'],
    ])}" fill="url(#tb-g)" stroke="${sp.metal}" stroke-width="3"/>`;
  }
  if (kind === 'trumpet') {
    // a coil of tubing above the valves
    art += f.rect(U * 0.3, vc - th / 2 - V * 0.14, U * 0.5, V * 0.1, V * 0.05, 'none', `stroke="${sp.metal}" stroke-width="8"`);
    art += f.rect(U * 0.3, vc + th / 2 + V * 0.04, U * 0.5, V * 0.1, V * 0.05, 'none', `stroke="${sp.metal}" stroke-width="8"`);
  }
  // holes
  const zones: Zone[] = [];
  const holes: string[] = [];
  const u0 = kind === 'trumpet' ? U * 0.4 : U * 0.32;
  const u1 = kind === 'trumpet' ? U * 0.78 : U * 0.9;
  const step = (u1 - u0) / n;
  const hr = Math.min(step / 2 - 3, th * 0.46, 46);
  for (let i = 0; i < n; i++) {
    const cu = u0 + step * (i + 0.5);
    const id = `hole${i}`;
    holes.push(id);
    zones.push({ id, shape: f.shapeEll(cu, vc, hr, hr), role: 'hole', voices: [] });
    const valve = kind === 'trumpet';
    art += zg(
      id,
      (valve ? f.rect(cu - hr * 0.5, vc - th / 2 - hr * 0.9, hr, hr * 1.8 + th, hr * 0.3, shade(sp.metal, 0.2), 'opacity=".7"') : '') +
        f.ell(cu, vc, hr, hr, valve ? '#fde68a' : '#f8fafc', `stroke="${sp.metal}" stroke-width="4"`) +
        f.ell(cu, vc, hr * 0.72, hr * 0.72, '#475569', 'class="cap"'),
      'hole',
    );
  }
  // mouthpiece
  const blowR = Math.min(th * 0.5, U * 0.1);
  zones.push({ id: 'blow', shape: f.shapeEll(U * 0.09, vc, Math.max(blowR, 40), Math.max(blowR, 40)), role: 'blow', voices: [] });
  art += zg(
    'blow',
    f.ell(
      U * 0.09,
      vc,
      Math.max(blowR, 40),
      Math.max(blowR, 40),
      'rgba(255,255,255,.55)',
      'stroke="#38bdf8" stroke-width="5" stroke-dasharray="10 8"',
    ) + f.ell(U * 0.09, vc, Math.max(blowR, 40) * 0.5, Math.max(blowR, 40) * 0.5, '#7dd3fc'),
    'blow',
  );

  const scale5 = pentaFrom(kind === 'flute' ? 72 : 60, n + 1);
  const fingering = (cov: boolean[]): Voice => {
    if (kind === 'trumpet') {
      const down = (cov[1] ? 1 : 0) + (cov[0] ? 2 : 0) + (cov[2] ? 3 : 0);
      return note('trumpet', tune(72 - down, harmony), 0.9);
    }
    const c = cov.filter(Boolean).length;
    const m = scale5[n - c]!;
    return note(kind, tune(m, harmony), 0.9);
  };
  return {
    kind,
    family: 'tube',
    w,
    h,
    portrait,
    harmony,
    zones: [...zones.slice(0, n), zones[n]!],
    svg: wrap(w, h, defs, art, sp.name),
    glide: false,
    fingering,
    holes,
  };
}

/** Harmonica: blow row on top, draw row below; slide along a row for a run of notes. */
export function layoutHarmonica(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const n = 5;
  const U = f.U;
  const V = f.V;
  const cw = U / n;
  const rh = V / 2;
  const blow = [60, 64, 67, 72, 76];
  const draw = [62, 67, 71, 74, 77];
  const defs = linGrad('hm-g', '#e5e7eb', '#9ca3af', true);
  let art = rect(0, 0, w, h, 0, '#ede9fe');
  art += f.rect(2, 2, U - 4, V - 4, 18, 'url(#hm-g)', 'stroke="#4b5563" stroke-width="3"');
  const zones: Zone[] = [];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < n; i++) {
      const m = (r === 0 ? blow : draw)[i]!;
      const id = `h${r}-${i}`;
      zones.push({ id, shape: f.shapeRect(i * cw, r * rh, cw, rh), role: 'play', voices: [inst('harmonica', tune(m, harmony), 0.55)] });
      art += zg(
        id,
        f.rect(i * cw + 6, r * rh + rh * 0.2, cw - 12, rh * 0.6, 10, r === 0 ? '#1f2937' : '#374151') +
          f.rect(i * cw + 10, r * rh + rh * 0.26, cw - 20, rh * 0.12, 5, 'rgba(255,255,255,.18)'),
      );
    }
  }
  art += f.line(4, rh, U - 4, rh, '#6b7280', 3);
  return {
    kind: 'harmonica',
    family: 'harmonica',
    w,
    h,
    portrait,
    harmony,
    zones,
    svg: wrap(w, h, defs, art, 'Kèn harmonica'),
    glide: true,
  };
}

/** Pan flute: five bamboo pipes, long for low, short for high; sweep a finger across the tops. */
export function layoutPanflute(w: number, h: number, harmony: Harmony): Board {
  const n = 5;
  const notes = pentaFrom(72, n);
  const sw = w / n;
  let art = rect(0, 0, w, h, 0, '#ecfccb');
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const len = (h - 30) * (0.97 - (i / (n - 1)) * 0.5);
    const x = i * sw;
    const top = 12;
    const col = ['#d9a441', '#e0b04f', '#cf9a38', '#e6bb5c', '#d4a244'][i]!;
    zones.push({
      id: `p${m}`,
      shape: { t: 'rect', x, y: top, w: sw, h: len },
      role: 'play',
      voices: [inst('panflute', tune(m, harmony), 0.6)],
    });
    art += zg(
      `p${m}`,
      rect(x + 4, top, sw - 8, len, sw * 0.25, col, 'stroke="#92400e" stroke-width="2.5"') +
        ell(x + sw / 2, top + 8, (sw - 8) * 0.34, 7, '#78350f') +
        rect(x + sw * 0.22, top + 20, sw * 0.12, len - 36, 4, 'rgba(255,255,255,.4)'),
    );
  });
  art += rect(6, h * 0.34, w - 12, 14, 7, '#7c2d12') + rect(6, h * 0.66, w - 12, 14, 7, '#7c2d12');
  return { kind: 'panflute', family: 'panflute', w, h, portrait: h > w, harmony, zones, svg: wrap(w, h, '', art, 'Sáo pan'), glide: true };
}

const ACC_CHORDS: Array<[string, number[], string]> = [
  ['C', [48, 52, 55], '#ef4444'],
  ['Am', [45, 52, 57], '#f59e0b'],
  ['F', [41, 48, 53], '#22c55e'],
  ['G', [43, 50, 55], '#3b82f6'],
];

/**
 * Accordion: right-hand buttons on top (two rows of five notes), the pleated
 * bellows in the middle, and four big chord buttons for the left hand below.
 */
export function layoutAccordion(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const pad = 6;
  const rowH = Math.min(96, (h - pad * 2 - 36) / 3);
  const keysTop = pad;
  const keysH = rowH * 2;
  const chordTop = h - pad - rowH;
  const bellowsTop = keysTop + keysH + 6;
  const bellowsH = chordTop - bellowsTop - 6;
  const cw = (w - pad * 2) / 5;
  const defs = linGrad('ac-red', '#dc2626', '#7f1d1d', false);
  let art = rect(0, 0, w, h, 0, '#fee2e2');
  art += rect(pad, keysTop, w - pad * 2, keysH, 18, 'url(#ac-red)', 'stroke="#450a0a" stroke-width="3"');
  art += rect(pad, chordTop, w - pad * 2, rowH, 18, 'url(#ac-red)', 'stroke="#450a0a" stroke-width="3"');
  // bellows
  const folds = Math.max(6, Math.round(bellowsH / 14));
  art += rect(pad + 14, bellowsTop, w - pad * 2 - 28, bellowsH, 4, '#1c1917');
  for (let i = 0; i < folds; i++) {
    const y = bellowsTop + (i + 0.5) * (bellowsH / folds);
    art += rect(pad + 14, y - 3, w - pad * 2 - 28, 6, 3, i % 2 ? '#f5f5f4' : '#a8a29e');
  }
  const zones: Zone[] = [];
  const rows = [pentaFrom(72, 5), pentaFrom(60, 5)];
  rows.forEach((notes, r) => {
    notes.forEach((m, i) => {
      const cx = pad + cw * (i + 0.5);
      const cy = keysTop + rowH * (r + 0.5);
      const rad = Math.min(cw / 2 - 4, rowH / 2 - 4);
      zones.push({
        id: `a${m}`,
        shape: { t: 'ell', cx, cy, rx: rad + 4, ry: rad + 4 },
        role: 'play',
        voices: [inst('accordion', tune(m, harmony), 0.8)],
      });
      art += zg(
        `a${m}`,
        ell(cx, cy, rad, rad, '#fafaf9', 'stroke="#a8a29e" stroke-width="3"') +
          ell(cx - rad * 0.25, cy - rad * 0.3, rad * 0.3, rad * 0.2, 'rgba(255,255,255,.9)'),
      );
    });
  });
  const cwc = (w - pad * 2) / 4;
  ACC_CHORDS.forEach(([name, midis, col], i) => {
    const cx = pad + cwc * (i + 0.5);
    const cy = chordTop + rowH / 2;
    const rad = Math.min(cwc / 2 - 4, rowH / 2 - 4);
    zones.push({
      id: `a:${name}`,
      shape: { t: 'ell', cx, cy, rx: rad + 4, ry: rad + 4 },
      role: 'play',
      voices: midis.map((m) => inst('accordion', tune(m, harmony), 0.9)),
    });
    art += zg(
      `a:${name}`,
      ell(cx, cy, rad, rad, col, 'stroke="#fff" stroke-width="4"') + ell(cx, cy, rad * 0.4, rad * 0.4, 'rgba(255,255,255,.55)'),
    );
  });
  void line;
  return {
    kind: 'accordion',
    family: 'accordion',
    w,
    h,
    portrait,
    harmony,
    zones,
    svg: wrap(w, h, defs, art, 'Đàn accordion'),
    glide: true,
  };
}
