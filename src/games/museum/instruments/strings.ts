import { majorFrom, pentaFrom, tune } from './scale';
import { lg, rg, rnd, type Stop } from './art';
import { outline } from './fret';
import { ell, Frame, line, r1, rect, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { inst, note } from './voices';

export { layoutFret } from './fret';

/**
 * A harp: strings long for low and short for high between a curved neck and a
 * soundboard. Slide a finger across them for a glissando. Always upright; five
 * strings on a phone held upright, eight when there is room.
 */
export function layoutHarp(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const n = portrait ? 5 : 8;
  const notes = pentaFrom(portrait ? 72 : 60, n);
  const pad = 4;
  const pillar = 12;
  const sw = (w - pad * 2) / n;
  const topY = (i: number) => h * (0.06 + 0.38 * (i / (n - 1)));
  const botY = (i: number) => h * (0.9 - 0.1 * (i / (n - 1)));
  const defs =
    lg('hp-wood', [[0, '#7a3d0f'], [0.3, '#d98a30'], [0.55, '#a45a1a'], [1, '#4a2208']], 0, 0, 1, 0) +
    lg('hp-wood-v', [[0, '#e39a3c'], [0.5, '#b0631c'], [1, '#6a3410']], 0, 0, 0, 1) +
    lg('hp-gold', [[0, '#8a5e10'], [0.3, '#fde68a'], [0.6, '#d4a02a'], [1, '#7a520c']], 0, 0, 1, 0) +
    rg('hp-peg', [[0, '#fff3b0'], [0.6, '#d9a62a'], [1, '#7a520c']], 0.4, 0.35, 0.7) +
    rg('hp-bg', [[0, '#fff4f9'], [1, '#f7d3e3']], 0.5, 0.45, 0.8);
  let art = `<rect width="${r1(w)}" height="${r1(h)}" fill="url(#hp-bg)"/>`;
  // Frame: curved neck over the top, pillar on the right, soundbox at the bottom
  const neckD = `M${pad} ${topY(0) - 8} Q${w * 0.55} ${topY(0) - 22} ${w - pad - pillar / 2} ${topY(n - 1) + 4}`;
  art += `<path d="${neckD}" stroke="rgba(0,0,0,.18)" stroke-width="20" fill="none" stroke-linecap="round" transform="translate(3 5)"/>`;
  art += `<path d="${neckD}" stroke="#3a1a06" stroke-width="22" fill="none" stroke-linecap="round"/>`;
  art += `<path d="${neckD}" stroke="url(#hp-wood-v)" stroke-width="17" fill="none" stroke-linecap="round"/>`;
  art += `<path d="${neckD}" stroke="rgba(255,235,190,.5)" stroke-width="3" fill="none" stroke-linecap="round" transform="translate(0 -4)"/>`;
  // pillar: a fluted column with a gold capital and a base
  const py0 = topY(n - 1);
  const py1 = h * 0.93;
  art += rect(w - pad - pillar + 3, py0 + 3, pillar + 2, py1 - py0, pillar / 2, 'rgba(0,0,0,.18)');
  art += rect(w - pad - pillar - 2, py0 - 4, pillar + 4, py1 - py0 + 4, pillar / 2.5, 'url(#hp-wood)', 'stroke="#3a1a06" stroke-width="2"');
  for (let k = 1; k < 3; k++) art += line(w - pad - pillar + (pillar * k) / 3, py0 + 14, w - pad - pillar + (pillar * k) / 3, py1 - 8, 'rgba(0,0,0,.22)', 1.2);
  art += rect(w - pad - pillar - 6, py0 - 6, pillar + 12, 12, 5, 'url(#hp-gold)', 'stroke="#6b4a0a" stroke-width="1.5"');
  // soundbox
  const boxD = `M${pad} ${botY(0) + 2} L${w - pad} ${botY(n - 1) + 2} L${w - pad} ${h - pad} L${pad} ${h - pad} Z`;
  art += `<path d="${boxD}" fill="#000" opacity=".2" transform="translate(3 5)"/>`;
  art += `<path d="${boxD}" fill="url(#hp-wood-v)" stroke="#3a1a06" stroke-width="3" stroke-linejoin="round"/>`;
  for (let k = 1; k < 12; k++) {
    const yy = botY(0) + 2 + ((h - pad - botY(0) - 2) * k) / 12;
    art += `<path d="M${pad + 6} ${yy.toFixed(1)} Q${w * 0.5} ${(yy + (rnd(k) - 0.5) * 8).toFixed(1)} ${w - pad - 6} ${(yy + (rnd(k + 9) - 0.5) * 6).toFixed(1)}" stroke="${k % 2 ? 'rgba(255,230,180,.16)' : 'rgba(60,25,5,.16)'}" stroke-width="1.4" fill="none"/>`;
  }
  // gold trim along the top edge of the soundbox, and a row of small gold studs
  art += line(pad + 2, botY(0) + 8, w - pad - 2, botY(n - 1) + 8, 'url(#hp-gold)', 6);
  for (let k = 0; k < 9; k++) {
    const t = (k + 0.5) / 9;
    art += ell(pad + (w - pad * 2) * t, botY(0) + 8 + (botY(n - 1) - botY(0)) * t + 22, 3.2, 3.2, 'url(#hp-peg)');
  }
  art += ell(w * 0.35, h * 0.955, w * 0.07, h * 0.014, '#1c0f06', 'stroke="url(#hp-gold)" stroke-width="2.5"');
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const x = pad + i * sw + sw / 2;
    const y1 = topY(i);
    const y2 = botY(i) + 2;
    const isC = m % 12 === 0;
    zones.push({
      id: `s${m}`,
      shape: { t: 'rect', x: pad + i * sw, y: y1, w: sw, h: y2 - y1 },
      role: 'play',
      voices: [inst('harp', tune(m, harmony))],
    });
    art += zg(
      `s${m}`,
      `<path d="M${(x + 2).toFixed(1)} ${(y1 + 2).toFixed(1)}L${(x + 2).toFixed(1)} ${y2.toFixed(1)}" stroke="rgba(0,0,0,.2)" stroke-width="3" stroke-linecap="round" fill="none"/>` +
        `<path class="str" data-s="${i}" data-p="${x.toFixed(1)},${y1.toFixed(1)},${x.toFixed(1)},${y2.toFixed(1)}" d="M${x.toFixed(1)} ${y1.toFixed(1)}L${x.toFixed(1)} ${y2.toFixed(1)}" stroke="${isC ? '#e11d48' : '#e9b949'}" stroke-width="${isC ? 3.6 : 3}" stroke-linecap="round" fill="none"/>` +
        ell(x, y1, 8, 8, 'url(#hp-peg)', 'stroke="#6b4a0a" stroke-width="1.6"') +
        ell(x, y1, 2.6, 2.6, '#4a2f08'),
    );
  });
  void line;
  return { kind: 'harp', family: 'harp', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Đàn hạc'), glide: true };
}

/**
 * Violin: four strings from the scroll to the bridge. Put a finger on a string and
 * draw it along: where the finger is decides the note (higher toward the bridge),
 * and moving it keeps the bow going. Every note is C pentatonic or C major.
 *
 * The drawing is a violin seen from the front: maple scroll and pegs, an ebony
 * fingerboard narrowing toward the nut, a flamed varnished body with f-holes, a bridge
 * with cut-outs, tailpiece and chin rest. The four rows the child touches span the whole height.
 */
export function layoutViolin(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const vc = V / 2;
  const bands = 5;
  const u0 = U * 0.09;
  const bw = (U * 0.6) / bands;
  const sw = V / 4;
  const opens = [55, 62, 69, 76];
  const ax = portrait ? 1 : 0;
  const ay = portrait ? 0 : 1;
  const across = (id: string, s: Stop[]) => lg(id, s, 0, 0, ax, ay);
  const defs =
    rg('vn-wood', [[0, '#e08a32'], [0.45, '#b5551a'], [0.85, '#7a2d0e'], [1, '#4a1a08']], 0.45, 0.55, 0.7) +
    across('vn-fb', [[0, '#3a3532'], [0.2, '#171412'], [0.7, '#0a0908'], [1, '#050404']]) +
    across('vn-maple', [[0, '#f0c987'], [0.5, '#d9a45c'], [1, '#a8702f']]) +
    across('vn-ebony', [[0, '#4a4440'], [0.3, '#1c1917'], [1, '#050404']]) +
    rg('vn-bg', [[0, '#f3fbdc'], [1, '#d8eeb0']], 0.5, 0.45, 0.8);
  let art = `<rect width="${r1(w)}" height="${r1(h)}" fill="url(#vn-bg)"/>`;
  // body
  const bodyU0 = U * 0.38;
  const L = U * 0.985 - bodyU0;
  const H = Math.min(V * 0.37, L * 0.3);
  const bodyD = outline(
    f,
    bodyU0,
    L,
    vc,
    H,
    [0.0, -0.5],
    [
      [0.06, -0.66, 0.18, -0.8, 0.28, -0.78],
      [0.37, -0.76, 0.4, -0.56, 0.46, -0.54],
      [0.52, -0.52, 0.58, -1.0, 0.74, -1.0],
      [0.92, -1.0, 1.0, -0.7, 1.0, 0],
    ],
  );
  const shadowT = `translate(${r1(w * 0.008)} ${r1(h * 0.012)})`;
  art += `<path d="${bodyD}" fill="#000" opacity=".2" transform="${shadowT}"/>`;
  art += `<path d="${bodyD}" fill="url(#vn-wood)" stroke="#2a0e04" stroke-width="3"/>`;
  const defs2 = `<clipPath id="vn-clip"><path d="${bodyD}"/></clipPath>`;
  // flamed maple: slanted stripes, clipped to the body
  let flame = '';
  for (let i = 0; i < 26; i++) {
    const uu = bodyU0 + (i / 26) * L;
    flame += `<path d="${f.d([
      ['M', uu, vc - H * 1.05],
      ['C', uu + L * 0.02, vc - H * 0.3, uu - L * 0.02, vc + H * 0.3, uu + L * 0.03, vc + H * 1.05],
    ])}" fill="none" stroke="${i % 2 ? 'rgba(255,214,150,.13)' : 'rgba(60,18,4,.14)'}" stroke-width="${r1(2 + rnd(i) * 4)}"/>`;
  }
  art += `<g clip-path="url(#vn-clip)">${flame}${f.ell(bodyU0 + L * 0.3, vc - H * 0.4, L * 0.22, H * 0.16, 'rgba(255,255,255,.18)')}</g>`;
  art += `<path d="${bodyD}" fill="none" stroke="rgba(255,225,170,.45)" stroke-width="1.4" clip-path="url(#vn-clip)"/>`;
  // f-holes
  const bridgeU = bodyU0 + L * 0.62;
  for (const sgn of [-1, 1]) {
    const fv = vc + sgn * H * 0.36;
    art += `<path d="${f.d([
      ['M', bridgeU - L * 0.1, fv - sgn * H * 0.04],
      ['C', bridgeU - L * 0.06, fv - sgn * H * 0.2, bridgeU - L * 0.0, fv + sgn * H * 0.1, bridgeU + L * 0.04, fv + sgn * H * 0.04],
      ['C', bridgeU + L * 0.07, fv, bridgeU + L * 0.1, fv + sgn * H * 0.05, bridgeU + L * 0.11, fv + sgn * H * 0.14],
    ])}" fill="none" stroke="#150905" stroke-width="5" stroke-linecap="round"/>`;
    art += f.ell(bridgeU - L * 0.1, fv - sgn * H * 0.04, 4.2, 4.2, '#150905');
    art += f.ell(bridgeU + L * 0.11, fv + sgn * H * 0.14, 4.2, 4.2, '#150905');
  }
  // tailpiece and chin rest
  const tailU = U * 0.985 - L * 0.08;
  art += f.ell(bodyU0 + L * 0.9, vc + H * 0.58, L * 0.085, H * 0.28, 'url(#vn-ebony)', 'stroke="#000" stroke-width="1.5"');
  art += `<path d="${f.d([
    ['M', bridgeU + L * 0.13, vc - H * 0.1],
    ['L', tailU, vc - H * 0.2],
    ['L', tailU, vc + H * 0.2],
    ['L', bridgeU + L * 0.13, vc + H * 0.1],
    ['Z'],
  ])}" fill="url(#vn-ebony)" stroke="#000" stroke-width="1.5"/>`;
  for (let s = 0; s < 4; s++) art += f.ell(tailU - L * 0.02, vc + (s - 1.5) * H * 0.11, 3.6, 3.6, 'url(#vn-maple)', 'stroke="#000" stroke-width="1"');
  // neck, pegbox and scroll
  const nutU = u0;
  art += f.rect(U * 0.04, vc - V * 0.12, nutU - U * 0.04 + 8, V * 0.24, 6, 'url(#vn-maple)', 'stroke="#6b3d12" stroke-width="2"');
  art += f.ell(U * 0.022, vc, U * 0.026, V * 0.1, 'url(#vn-maple)', 'stroke="#6b3d12" stroke-width="2"');
  art += f.ell(U * 0.022, vc, U * 0.014, V * 0.055, 'none', 'stroke="#6b3d12" stroke-width="1.6"');
  art += f.ell(U * 0.022, vc, U * 0.005, V * 0.02, '#6b3d12');
  for (let s = 0; s < 4; s++) {
    const side = s % 2 ? 1 : -1;
    const pu = U * 0.052 + s * U * 0.012;
    art += f.line(pu, vc + side * V * 0.06, pu, vc + side * V * 0.165, '#1c1917', 7);
    art += f.ell(pu, vc + side * V * 0.165, U * 0.012, V * 0.03, 'url(#vn-ebony)', 'stroke="#000" stroke-width="1"');
  }
  // the fingerboard narrows toward the nut
  const fbHalf0 = V * 0.15;
  const fbHalf1 = V * 0.235;
  const fbU1 = u0 + bw * bands + U * 0.01;
  const fbD = f.d([
    ['M', nutU, vc - fbHalf0],
    ['L', fbU1, vc - fbHalf1],
    ['L', fbU1, vc + fbHalf1],
    ['L', nutU, vc + fbHalf0],
    ['Z'],
  ]);
  art += `<path d="${fbD}" fill="#000" opacity=".25" transform="${shadowT}"/>`;
  art += `<path d="${fbD}" fill="url(#vn-fb)" stroke="#000" stroke-width="2"/>`;
  art += f.line(nutU + 1, vc - fbHalf0 + 2, fbU1 - 3, vc - fbHalf1 + 4, 'rgba(255,255,255,.18)', 2.5);
  art += f.rect(nutU - 3, vc - fbHalf0 - 2, 6, fbHalf0 * 2 + 4, 2, '#e9e2cf', 'stroke="#8a7f66" stroke-width="1"');
  // bridge with cut-outs
  const brH = H * 0.5;
  art += f.rect(bridgeU - 5 + 3, vc - brH + 3, 12, brH * 2, 4, 'rgba(0,0,0,.25)');
  art += f.rect(bridgeU - 5, vc - brH, 12, brH * 2, 4, '#f1d9a4', 'stroke="#8a6a3a" stroke-width="1.5"');
  for (const sgn of [-1, 1]) art += f.ell(bridgeU + 1, vc + sgn * brH * 0.55, 3, brH * 0.24, '#b98f4f');
  art += f.ell(bridgeU + 1, vc, 3, brH * 0.18, '#b98f4f');

  const zones: Zone[] = [];
  const midis = (s: number) => (harmony === 'pentatonic' ? pentaFrom(opens[s]!, bands) : majorFrom(opens[s]!, bands));
  for (let s = 0; s < 4; s++) {
    const ms = midis(s);
    const v = s * sw;
    for (let b = 0; b < bands; b++) {
      const u = u0 + b * bw;
      const m = ms[b]!;
      zones.push({ id: `v${s}-${b}`, shape: f.shapeRect(u, v, bw, sw), role: 'bow', voices: [note('violin', m, 0.8)] });
      // no dashed boxes: the touchable places are quiet, and the one under the finger lights up
      art += zg(`v${s}-${b}`, f.rect(u + 2, v + sw * 0.08, bw - 4, sw * 0.84, 10, 'rgba(251,191,36,0)'), 'cell');
    }
  }
  // faint position lines and two dots like the marks on a real fingerboard
  for (let b = 1; b < bands; b++) {
    const t = (b * bw) / (fbU1 - nutU);
    const half = fbHalf0 + (fbHalf1 - fbHalf0) * t;
    art += f.line(u0 + b * bw, vc - half + 4, u0 + b * bw, vc + half - 4, 'rgba(255,255,255,.1)', 2);
  }
  for (const b of [1, 3]) art += f.ell(u0 + (b + 0.5) * bw, vc, 4.5, 4.5, 'rgba(255,255,255,.22)');
  // strings: nut → tailpiece, spreading toward the bridge
  const strU2 = bridgeU + L * 0.13;
  const nutSpread = fbHalf0 * 0.72;
  const brSpread = brH * 0.8;
  const cols = ['#e8c37a', '#e5e7eb', '#f1f5f9', '#fafaf9'];
  for (let s = 0; s < 4; s++) {
    const k = (s - 1.5) / 1.5;
    const vs1 = vc + k * nutSpread;
    const vs2 = vc + k * brSpread;
    const p = [f.X(u0, vs1), f.Y(u0, vs1), f.X(strU2, vs2), f.Y(strU2, vs2)].map((n) => Math.round(n * 10) / 10);
    const thick = 1.8 + (3 - s) * 0.6;
    art += `<path d="M${p[0]! + 1.5} ${p[1]! + 2.5}L${p[2]! + 1.5} ${p[3]! + 2.5}" stroke="rgba(0,0,0,.28)" stroke-width="${thick}" stroke-linecap="round" fill="none"/>`;
    art += `<path class="str" data-s="${s}" data-p="${p.join(',')}" d="M${p[0]} ${p[1]}L${p[2]} ${p[3]}" stroke="${cols[s]}" stroke-width="${thick}" stroke-linecap="round" fill="none"/>`;
  }
  return {
    kind: 'violin',
    family: 'bow',
    w,
    h,
    portrait,
    harmony,
    zones,
    svg: wrap(w, h, defs + defs2, art, 'Đàn violin'),
    glide: false,
  };
}
