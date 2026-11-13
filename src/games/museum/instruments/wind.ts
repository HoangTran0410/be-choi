import { lg, rg, rnd } from './art';
import { across, along, rivet, SILVER } from './brass';
import { pentaFrom, tune } from './scale';
import { ell, Frame, line, rect, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { inst } from './voices';

export { layoutTube } from './tube';

/**
 * Harmonica seen from above: two chrome cover plates (the blow row on top, the draw
 * row below) over a dark comb, with a vent slot and a brass reed showing in every
 * cell, numbered 1-5, and screwed end plates. Slide along a row for a run of notes.
 */
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
  const defs =
    lg('hm-bg', [[0, '#f5f3ff'], [1, '#ddd6fe']]) +
    across('hm-cover', portrait, SILVER) +
    along('hm-end', portrait, SILVER) +
    across('hm-slot', portrait, [[0, '#020617'], [0.5, '#111827'], [1, '#374151']]) +
    across('hm-reed', portrait, [[0, '#92400e'], [0.4, '#fde68a'], [0.7, '#d4a437'], [1, '#78350f']]) +
    rg('hm-comb', [[0, '#374151'], [1, '#111827']], 0.5, 0.5, 0.8);
  let art = rect(0, 0, w, h, 0, 'url(#hm-bg)');
  const pad = 3;
  const endW = Math.min(U * 0.05, 30);
  // dark comb body seen between and behind the plates
  art += f.rect(pad, pad, U - pad * 2, V - pad * 2, 16, 'url(#hm-comb)', 'stroke="#030712" stroke-width="2.5"');
  const zones: Zone[] = [];
  const num = (i: number, r: number): string => {
    const x = f.X(endW + pad + 6 + ((U - 2 * (endW + pad + 6)) / n) * (i + 0.5), r * rh + rh * 0.24);
    const y = f.Y(endW + pad + 6 + ((U - 2 * (endW + pad + 6)) / n) * (i + 0.5), r * rh + rh * 0.24);
    return `<text x="${x.toFixed(1)}" y="${(y + rh * 0.07).toFixed(1)}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${Math.round(Math.min(rh * 0.2, cw * 0.2))}" fill="rgba(30,41,59,.6)">${i + 1}</text>`;
  };
  for (let r = 0; r < 2; r++) {
    // the long cover plate for this row, a little domed (lit from the top)
    art += f.rect(pad + 5, r * rh + (r ? 7 : pad + 4), U - pad * 2 - 10, rh - (r ? pad + 9 : 10), 12, 'url(#hm-cover)', 'stroke="#334155" stroke-width="2"');
    art += f.rect(pad + 14, r * rh + (r ? 12 : pad + 9), U - pad * 2 - 28, 3, 1.5, 'rgba(255,255,255,.85)');
    for (let i = 0; i < n; i++) {
      const m = (r === 0 ? blow : draw)[i]!;
      const id = `h${r}-${i}`;
      zones.push({ id, shape: f.shapeRect(i * cw, r * rh, cw, rh), role: 'play', voices: [inst('harmonica', tune(m, harmony), 0.55)] });
      const inner = (U - 2 * (endW + pad + 6)) / n;
      const su = endW + pad + 6 + i * inner + inner * 0.12;
      const sw = inner * 0.76;
      const sv = r * rh + rh * 0.38;
      const sh = rh * 0.34;
      art += zg(
        id,
        // slot with its inner shadow, the brass reed lying in it, and a bright lip
        f.rect(su - 2, sv - 2, sw + 4, sh + 4, sh * 0.5, 'rgba(255,255,255,.75)') +
          f.rect(su, sv, sw, sh, sh * 0.45, 'url(#hm-slot)', 'stroke="#0b1220" stroke-width="1.5"') +
          f.rect(su + sw * 0.08, sv + sh * 0.3, sw * 0.84, sh * 0.4, sh * 0.2, 'url(#hm-reed)') +
          f.rect(su + sw * 0.12, sv + sh * 0.34, sw * 0.5, sh * 0.08, 2, 'rgba(255,255,255,.75)') +
          num(i, r),
      );
    }
  }
  // seam between the plates and the screwed end plates
  art += f.rect(pad + 4, rh - 4, U - pad * 2 - 8, 8, 4, '#0b1220');
  for (const e of [0, 1]) {
    const u = e ? U - pad - endW : pad;
    art += f.rect(u, pad + 2, endW, V - pad * 2 - 4, 10, 'url(#hm-end)', 'stroke="#334155" stroke-width="2"');
    for (const v of [V * 0.2, V * 0.5, V * 0.8]) art += rivetAt(f, u + endW / 2, v, 4.2);
  }
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

function rivetAt(f: Frame, u: number, v: number, r: number): string {
  return rivet(f.X(u, v), f.Y(u, v), r);
}

/**
 * Pan flute: five bamboo pipes with nodes and a dark mouth each, long for low and
 * short for high, bound with two twine wraps; sweep a finger across the tops.
 */
export function layoutPanflute(w: number, h: number, harmony: Harmony): Board {
  const n = 5;
  const notes = pentaFrom(72, n);
  const sw = w / n;
  let defs =
    lg('pf-bg', [[0, '#f7fee7'], [1, '#d9f99d']]) +
    lg('pf-twine', [[0, '#5b3a1a'], [0.5, '#c79a5a'], [1, '#5b3a1a']], 0, 0, 0, 1);
  let art = rect(0, 0, w, h, 0, 'url(#pf-bg)');
  const zones: Zone[] = [];
  const top = 14;
  const cols = [
    ['#8a5a14', '#e8b84a', '#f8dc8a'],
    ['#7c4f10', '#d9a33e', '#f3d27a'],
    ['#8d5c18', '#e2b04c', '#f6d98a'],
    ['#744a0f', '#d29b36', '#efca72'],
    ['#85561a', '#dfae48', '#f5d683'],
  ];
  notes.forEach((m, i) => {
    const len = (h - 30) * (0.97 - (i / (n - 1)) * 0.5);
    const x = i * sw;
    const c = cols[i]! as [string, string, string];
    const pw = sw - 8;
    defs += lg(`pf-p${i}`, [[0, c[0]], [0.22, c[1]], [0.4, c[2]], [0.62, c[1]], [1, c[0]]], 0, 0, 1, 0);
    zones.push({
      id: `p${m}`,
      shape: { t: 'rect', x, y: top, w: sw, h: len },
      role: 'play',
      voices: [inst('panflute', tune(m, harmony), 0.6)],
    });
    let fibre = '';
    for (let k = 0; k < 7; k++) {
      const fx = x + 4 + pw * (0.12 + rnd(i * 9 + k) * 0.76);
      fibre += line(fx, top + 18, fx + (rnd(k + i) - 0.5) * 2, top + len - 8, rnd(k * 3 + i) > 0.5 ? 'rgba(92,52,8,.22)' : 'rgba(255,240,190,.3)', 1.2);
    }
    // bamboo nodes: a darker ring with a raised lip, one or two per pipe
    let nodes = '';
    const nodeAt = len > 140 ? [0.52, 0.86] : [0.7];
    for (const t of nodeAt) {
      const ny = top + len * t;
      nodes += rect(x + 4, ny - 3, pw, 6, 3, 'rgba(70,38,6,.55)') + rect(x + 4, ny - 5, pw, 2.4, 1, 'rgba(255,240,190,.5)');
    }
    art += zg(
      `p${m}`,
      rect(x + 6, top + 3, pw, len, pw * 0.3, 'rgba(0,0,0,.14)') +
        rect(x + 4, top, pw, len, pw * 0.28, `url(#pf-p${i})`, `stroke="${c[0]}" stroke-width="2.5"`) +
        fibre +
        nodes +
        // the mouth: a pale rim, a dark bore and a lit lip
        ell(x + sw / 2, top + 7, pw * 0.4, 9, '#f5deaa', `stroke="${c[0]}" stroke-width="2"`) +
        ell(x + sw / 2, top + 8, pw * 0.3, 6.5, '#2b1505') +
        ell(x + sw / 2 - pw * 0.08, top + 5.5, pw * 0.12, 2, 'rgba(255,255,255,.5)'),
    );
  });
  // twine bindings across the pipes, crossed like a real pan flute
  for (const t of [0.34, 0.66]) {
    const y = h * t;
    art += rect(4, y - 8, w - 8, 18, 9, 'url(#pf-twine)', 'stroke="#3b2410" stroke-width="2"');
    for (let k = 0; k < Math.floor((w - 16) / 9); k++) {
      art += line(12 + k * 9, y - 6, 18 + k * 9, y + 8, 'rgba(255,230,170,.55)', 1.6);
    }
  }
  return { kind: 'panflute', family: 'panflute', w, h, portrait: h > w, harmony, zones, svg: wrap(w, h, defs, art, 'Sáo pan'), glide: true };
}

const ACC_CHORDS: Array<[string, number[], string]> = [
  ['C', [48, 52, 55], '#ef4444'],
  ['Am', [45, 52, 57], '#f59e0b'],
  ['F', [41, 48, 53], '#22c55e'],
  ['G', [43, 50, 55], '#3b82f6'],
];

/**
 * Accordion: right-hand buttons (two rows of five notes), the pleated bellows in
 * the middle, and four big chord buttons for the left hand. Standing up on a phone
 * (keys on top); lying down on a wide screen (chords left, keys right).
 */
export function layoutAccordion(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const pad = 6;
  // lengths of the three blocks along the instrument
  const rowH = portrait ? Math.min(96, (U - pad * 2 - 36) / 3) : 0;
  const keyL = portrait ? rowH * 2 : U * 0.61;
  const chordL = portrait ? rowH : U * 0.265;
  const keyU0 = portrait ? pad : U - pad - keyL;
  const chordU0 = portrait ? U - pad - chordL : pad;
  const bellowsU0 = portrait ? keyU0 + keyL + 6 : chordU0 + chordL + 6;
  const bellowsL = portrait ? chordU0 - bellowsU0 - 6 : keyU0 - bellowsU0 - 6;
  const edge = '#3b0606';
  const defs =
    lg('ac-red', [[0, '#f87171'], [0.12, '#dc2626'], [0.5, '#b91c1c'], [0.85, '#7f1d1d'], [1, '#450a0a']], ...(portrait ? ([0, 0, 1, 0.35] as const) : ([0, 0, 0.35, 1] as const))) +
    across('ac-chrome', portrait, SILVER) +
    along('ac-chromeA', portrait, SILVER) +
    along('ac-fold', portrait, [[0, '#0c0a09'], [0.35, '#44403c'], [0.5, '#a8a29e'], [0.62, '#e7e5e4'], [0.78, '#57534e'], [1, '#0c0a09']]) +
    rg('ac-pearl', [[0, '#ffffff'], [0.55, '#f1ece3'], [0.9, '#cfc6b6'], [1, '#a39a88']], 0.38, 0.3, 0.8) +
    lg('ac-bg', [[0, '#fff1f2'], [1, '#fecdd3']]);
  let art = rect(0, 0, w, h, 0, 'url(#ac-bg)');

  // ---- bellows: dark leather with raised pale ridges, a serrated silhouette ----
  const bv0 = pad + V * 0.04;
  const bW = V - bv0 * 2;
  art += f.rect(bellowsU0, bv0 + 4, bellowsL, bW - 8, 3, '#0c0a09');
  const fl = Math.max(11, Math.min(18, bellowsL / 4));
  const folds = Math.max(2, Math.round(bellowsL / fl));
  const pitch = bellowsL / folds;
  for (let i = 0; i < folds; i++) {
    const u = bellowsU0 + i * pitch;
    art += f.rect(u + pitch * 0.18, bv0, pitch * 0.64, bW, pitch * 0.3, 'url(#ac-fold)', 'stroke="#0c0a09" stroke-width="1"');
  }
  // corner guards on the bellows' edges, where it meets the boxes
  for (const u of [bellowsU0 - 2, bellowsU0 + bellowsL - 6]) {
    art += f.rect(u, bv0 - 3, 8, bW + 6, 3, 'url(#ac-chromeA)', 'stroke="#334155" stroke-width="1.5"');
  }

  // ---- boxes ----
  const box = (u0: number, L: number): string => {
    const vv0 = pad;
    const vL = V - pad * 2;
    let o = f.rect(u0 + 3, vv0 + 5, L, vL, 16, 'rgba(0,0,0,.2)');
    o += f.rect(u0, vv0, L, vL, 16, 'url(#ac-red)', `stroke="${edge}" stroke-width="3"`);
    // a pale celluloid sheen
    o += f.rect(u0 + 7, vv0 + 5, L - 14, vL * 0.12, 8, 'rgba(255,255,255,.22)');
    return o;
  };
  art += box(keyU0, keyL) + box(chordU0, chordL);
  // chrome grille strip on the outer end of each box, with vent slits and screws
  const grille = (u0: number, L: number, atEnd: boolean): string => {
    const gl = Math.min(L * 0.12, 16);
    const u = atEnd ? u0 + L - gl - 4 : u0 + 4;
    let o = f.rect(u, pad + 8, gl, V - pad * 2 - 16, 4, 'url(#ac-chrome)', 'stroke="#334155" stroke-width="1.5"');
    for (let k = 0; k < 9; k++) o += f.line(u + gl * 0.2, pad + 16 + k * ((V - pad * 2 - 32) / 8), u + gl * 0.8, pad + 16 + k * ((V - pad * 2 - 32) / 8), 'rgba(15,23,42,.55)', 1.5);
    return o;
  };
  art += grille(keyU0, keyL, !portrait) + (portrait ? '' : grille(chordU0, chordL, false));

  // ---- buttons ----
  const zones: Zone[] = [];
  const rows = [pentaFrom(72, 5), pentaFrom(60, 5)];
  // keys: portrait = columns across v, rows along u; landscape = columns along u, rows across v
  const kCols = 5;
  const kPitch = portrait ? (V - pad * 2) / kCols : (keyL - 30) / kCols;
  const kRowPitch = portrait ? rowH : (V - pad * 2) / 2;
  const kRad = Math.min(kPitch / 2 - 4, kRowPitch / 2 - 5, 40);
  rows.forEach((notes, r) => {
    notes.forEach((m, i) => {
      const u = portrait ? keyU0 + rowH * (r + 0.5) : keyU0 + 8 + kPitch * (i + 0.5);
      const v = portrait ? pad + kPitch * (i + 0.5) : pad + kRowPitch * (r + 0.5);
      const cx = f.X(u, v);
      const cy = f.Y(u, v);
      zones.push({
        id: `a${m}`,
        shape: { t: 'ell', cx, cy, rx: Math.max(kRad + 4, Math.min(kPitch, kRowPitch) / 2 - 0.4), ry: Math.max(kRad + 4, Math.min(kPitch, kRowPitch) / 2 - 0.4) },
        role: 'play',
        voices: [inst('accordion', tune(m, harmony), 0.8)],
      });
      art += zg(
        `a${m}`,
        ell(cx + 1.5, cy + 3, kRad + 1, kRad + 1, 'rgba(0,0,0,.35)') +
          ell(cx, cy, kRad, kRad, 'url(#ac-chrome)', 'stroke="#334155" stroke-width="1.5"') +
          ell(cx, cy, kRad * 0.82, kRad * 0.82, 'url(#ac-pearl)', 'stroke="#a39a88" stroke-width="1.5"') +
          ell(cx - kRad * 0.24, cy - kRad * 0.3, kRad * 0.3, kRad * 0.18, 'rgba(255,255,255,.95)') +
          ell(cx, cy, kRad * 0.34, kRad * 0.34, 'none', 'stroke="rgba(120,110,95,.35)" stroke-width="1.2"'),
      );
    });
  });
  // chord buttons: coloured pearl in a chrome ring. Portrait: a row of 4; landscape: 2 x 2.
  const cCols = portrait ? 4 : 2;
  const cRows = portrait ? 1 : 2;
  const cPu = portrait ? chordL : (chordL - 20) / cRows;
  const cPv = (V - pad * 2) / (portrait ? 4 : 2);
  const cRad = Math.min(cPv / 2 - 4, cPu / 2 - 5, 44);
  ACC_CHORDS.forEach(([name, midis, col], k) => {
    const a = portrait ? k : k % 2;
    const b = portrait ? 0 : Math.floor(k / 2);
    const u = portrait ? chordU0 + chordL / 2 : chordU0 + 14 + cPu * (b + 0.5);
    const v = pad + cPv * (a + 0.5);
    const cx = f.X(u, v);
    const cy = f.Y(u, v);
    void cCols;
    zones.push({
      id: `a:${name}`,
      shape: { t: 'ell', cx, cy, rx: Math.max(cRad + 4, Math.min(cPu, cPv) / 2 - 0.4), ry: Math.max(cRad + 4, Math.min(cPu, cPv) / 2 - 0.4) },
      role: 'play',
      voices: midis.map((m) => inst('accordion', tune(m, harmony), 0.9)),
    });
    art += zg(
      `a:${name}`,
      ell(cx + 1.5, cy + 3, cRad + 1, cRad + 1, 'rgba(0,0,0,.35)') +
        ell(cx, cy, cRad, cRad, 'url(#ac-chrome)', 'stroke="#334155" stroke-width="1.5"') +
        ell(cx, cy, cRad * 0.82, cRad * 0.82, col, 'stroke="rgba(0,0,0,.35)" stroke-width="1.5"') +
        ell(cx, cy, cRad * 0.58, cRad * 0.58, 'none', 'stroke="rgba(255,255,255,.3)" stroke-width="2"') +
        ell(cx - cRad * 0.24, cy - cRad * 0.3, cRad * 0.3, cRad * 0.17, 'rgba(255,255,255,.8)') +
        `<text x="${cx.toFixed(1)}" y="${(cy + cRad * 0.2).toFixed(1)}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${Math.round(cRad * 0.52)}" fill="rgba(255,255,255,.92)" stroke="rgba(0,0,0,.35)" stroke-width="1">${name}</text>`,
    );
  });
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
