import { chromeGrad, lg, rg, rnd } from './art';
import { tune } from './scale';
import { Frame, ell, r1, shade, wrap, zg } from './svg';
import type { Board, Harmony, StrumSpec, Voice, Zone } from './types';
import { inst, note } from './voices';

export type FretKind = 'guitar' | 'ukulele' | 'banjo' | 'bass';

/** Open-position voicings in C major, one MIDI note per string (low → high), null = muted. */
const VOICINGS: Record<FretKind, Record<string, (number | null)[]>> = {
  guitar: {
    C: [null, 48, 52, 55, 60, 64],
    Am: [null, 45, 52, 57, 60, 64],
    F: [41, 48, 53, 57, 60, 65],
    G: [43, 47, 50, 55, 59, 67],
  },
  ukulele: {
    C: [67, 60, 64, 72],
    Am: [67, 60, 64, 69],
    F: [69, 60, 65, 69],
    G: [67, 62, 67, 71],
  },
  banjo: {
    C: [64, 48, 55, 60, 64],
    Am: [64, 45, 57, 60, 64],
    F: [65, 48, 53, 57, 65],
    G: [67, 50, 55, 59, 62],
  },
  bass: {
    C: [48, 55, 60, 64],
    Am: [45, 52, 57, 60],
    F: [41, 48, 53, 57],
    G: [43, 50, 55, 59],
  },
};
const CHORD_COLORS: Record<string, string> = { C: '#ef4444', Am: '#f59e0b', F: '#22c55e', G: '#3b82f6' };
const CHORDS = ['C', 'Am', 'F', 'G'];
/** Where the finger dots go on each chord cell: (fraction along the cell, string index from the low side). */
const DOTS: Record<string, Array<[number, number]>> = {
  C: [
    [0.3, 0.7],
    [0.7, 0.4],
  ],
  Am: [
    [0.5, 0.6],
    [0.5, 0.35],
  ],
  F: [
    [0.3, 0.3],
    [0.7, 0.55],
    [0.7, 0.8],
  ],
  G: [
    [0.3, 0.25],
    [0.6, 0.5],
    [0.8, 0.8],
  ],
};

const NAMES: Record<FretKind, string> = { guitar: 'Đàn guitar', ukulele: 'Đàn ukulele', banjo: 'Đàn banjo', bass: 'Đàn bass' };

function voiceFor(kind: FretKind, m: number | null, harmony: Harmony): Voice | null {
  if (m === null) return null;
  const t = tune(m, harmony);
  if (kind === 'guitar') return note('guitar', t, 1.4);
  if (kind === 'bass') return note('bass', t, 0.9);
  return inst(kind, t);
}

/** One cubic piece of an outline: two control points and an end, as (fraction of length, fraction of half-width). */
type Seg = [number, number, number, number, number, number];

/**
 * A closed body outline from the upper half only: the lower half is the mirror image
 * (`low` stretches it a little, so the lower horn can differ from the upper one).
 */
export function outline(f: Frame, u0: number, L: number, vc: number, H: number, start: [number, number], segs: Seg[], low = 1): string {
  const P = (uf: number, vf: number, k = 1): [number, number] => [u0 + uf * L, vc + vf * H * k];
  const cmd = (c: string, pts: Array<[number, number]>) => [c, ...pts.flat()] as [string, ...number[]];
  const cmds: Array<[string, ...number[]]> = [cmd('M', [P(start[0], start[1])])];
  for (const s of segs) cmds.push(cmd('C', [P(s[0], s[1]), P(s[2], s[3]), P(s[4], s[5])]));
  // back along the mirror image
  const ends: Array<[number, number]> = [start, ...segs.map((s): [number, number] => [s[4], s[5]])];
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]!;
    const to = ends[i]!;
    cmds.push(cmd('C', [P(s[2], -s[3], low), P(s[0], -s[1], low), P(to[0], -to[1], low)]));
  }
  cmds.push(['Z']);
  return f.d(cmds);
}

const WOUND = '#d9a766';
const STEEL = '#e8ecf1';

/**
 * Guitar, ukulele, banjo, bass. Four big chord cells along the neck (C, Am, F, G);
 * swipe across the strings on the body to strum them (a tap strums them all).
 * Landscape lays the instrument on its side; portrait holds it upright.
 *
 * The drawing is a top-down view of the real thing: spruce top with sunburst, binding,
 * sound hole with rosette, bridge and saddle, rosewood fingerboard with fret wires and
 * inlays, a headstock with tuners (banjo: a drum head; bass: a solid body with pickups).
 * The strings are the `.str` paths fx.ts vibrates; a faint shadow lies under each.
 */
export function layoutFret(kind: FretKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const vc = V / 2;
  const n = VOICINGS[kind].C!.length;
  const neckU0 = U * 0.1;
  const neckU1 = U * 0.6;
  const nh = V * (kind === 'bass' ? 0.44 : kind === 'banjo' ? 0.4 : kind === 'ukulele' ? 0.44 : 0.5);
  const cell = (neckU1 - neckU0) / 4;
  const sp = (nh * 0.78) / (n - 1);
  const stringV = (j: number) => vc + (j - (n - 1) / 2) * sp;
  // gradients run across the instrument (screen y when lying down, x when upright)
  const ax = portrait ? 1 : 0;
  const ay = portrait ? 0 : 1;
  const across = (id: string, s: Array<[number, string, number?]>) => lg(id, s, 0, 0, ax, ay);

  const isUke = kind === 'ukulele';
  const woodMid = isUke ? '#d9964a' : '#e6b25a';
  const woodEdge = isUke ? '#7a3f12' : '#7b3d10';
  let defs =
    across('fr-fb', [
      [0, '#5a3420'],
      [0.12, '#3b2014'],
      [0.5, '#2a160d'],
      [0.88, '#3b2014'],
      [1, '#5a3420'],
    ]) +
    across('fr-neck', [
      [0, '#e2b27a'],
      [0.5, '#c58b52'],
      [1, '#9a6535'],
    ]) +
    across('fr-head', [
      [0, '#3a2013'],
      [0.5, '#24130a'],
      [1, '#150a05'],
    ]) +
    rg(
      'fr-top',
      [
        [0, '#f6d78e'],
        [0.4, woodMid],
        [0.8, shade(woodMid, -0.3)],
        [1, woodEdge],
      ],
      0.45,
      0.5,
      0.7,
    ) +
    rg(
      'fr-hole',
      [
        [0, '#000'],
        [0.7, '#0c0603'],
        [1, '#2b1708'],
      ],
      0.5,
      0.5,
      0.5,
      0.5,
      0.7,
    ) +
    across('fr-bridge', [
      [0, '#6b3f26'],
      [0.35, '#3a2012'],
      [1, '#1f0f07'],
    ]) +
    chromeGrad('fr-chrome', portrait ? 'x' : 'y') +
    lg('fr-fret', [[0, '#8b9099'], [0.4, '#f8fafc'], [0.7, '#c5cad2'], [1, '#7b8089']], ay, ax, 0, 0) +
    rg('fr-pearl', [[0, '#ffffff'], [0.6, '#e8e1d0'], [1, '#bdb29a']], 0.5, 0.5, 0.5, 0.35, 0.3) +
    rg(
      'fr-head-skin',
      [
        [0, '#ffffff'],
        [0.75, '#f3efe6'],
        [1, '#ddd5c2'],
      ],
      0.42,
      0.4,
      0.7,
    ) +
    rg(
      'fr-pot',
      [
        [0, '#e8c07a'],
        [1, '#8a5a24'],
      ],
      0.4,
      0.4,
      0.8,
    ) +
    rg(
      'fr-bassbody',
      [
        [0, '#ef4444'],
        [0.55, '#b91c1c'],
        [0.9, '#5c0a0a'],
        [1, '#2a0505'],
      ],
      0.45,
      0.45,
      0.75,
    ) +
    rg('fr-bg', [[0, '#fff6dc'], [1, '#f6dca0']], 0.5, 0.45, 0.8);
  let art = `<rect width="${r1(w)}" height="${r1(h)}" fill="url(#fr-bg)"/>`;

  // ---- geometry of the body ----
  const bodyU1 = U * 0.985;
  let bodyU0 = U * 0.52;
  let bodyH = V * 0.46; // half-width of the widest part
  let L = bodyU1 - bodyU0;
  let potR = 0;
  if (kind === 'ukulele') {
    bodyU0 = U * 0.56;
    L = bodyU1 - bodyU0;
    bodyH = Math.min(V * 0.36, L * 0.46);
  } else if (kind === 'banjo') {
    potR = Math.min(U * 0.21, V * 0.45);
    bodyU0 = bodyU1 - potR * 2;
    L = potR * 2;
  } else if (kind === 'bass') {
    bodyU0 = U * 0.57;
    L = bodyU1 - bodyU0;
    bodyH = Math.min(V * 0.4, L * 0.5);
  } else {
    bodyH = Math.min(V * 0.46, L * 0.52);
  }
  const bodyD = (() => {
    if (kind === 'banjo') return '';
    if (kind === 'bass') {
      // an offset double-cutaway solid body: a long upper horn up the neck, a shorter lower one,
      // a waist and a wide lower bout. Points are (t along the body, s across it).
      const P = (t: number, sv: number): [number, number] => [bodyU0 + t * L, vc + sv * bodyH];
      const C = (...pts: Array<[number, number]>): [string, ...number[]] => ['C', ...pts.flat()] as [string, ...number[]];
      return f.d([
        ['M', ...P(0.3, -0.64)],
        ['L', ...P(0.04, -0.65)],
        C(P(-0.06, -0.65), P(-0.1, -0.79), P(-0.02, -0.85)),
        C(P(0.1, -0.92), P(0.2, -0.88), P(0.3, -0.9)),
        C(P(0.42, -0.92), P(0.5, -0.78), P(0.58, -0.8)),
        C(P(0.66, -0.82), P(0.7, -1.0), P(0.84, -1.0)),
        C(P(0.97, -1.0), P(1.0, -0.8), P(1.0, -0.45)),
        ['L', ...P(1.0, 0.45)],
        C(P(1.0, 0.8), P(0.97, 1.0), P(0.84, 1.0)),
        C(P(0.7, 1.0), P(0.64, 0.82), P(0.56, 0.82)),
        C(P(0.48, 0.82), P(0.42, 0.9), P(0.34, 0.9)),
        C(P(0.26, 0.9), P(0.2, 0.86), P(0.16, 0.8)),
        C(P(0.1, 0.72), P(0.16, 0.65), P(0.3, 0.64)),
        ['Z'],
      ]);
    }
    // dreadnought / concert ukulele: shoulders, a waist, a big lower bout
    const waistD = kind === 'ukulele' ? 0.8 : 0.7;
    return outline(
      f,
      bodyU0,
      L,
      vc,
      bodyH,
      [0.0, -0.58],
      [
        [0.1, -0.64, 0.2, -0.78, 0.31, -0.78],
        [0.4, -0.78, 0.42, -waistD, 0.5, -waistD],
        [0.58, -waistD, 0.6, -1.0, 0.76, -1.0],
        [0.92, -1.0, 1.0, -0.62, 1.0, 0],
      ],
    );
  })();

  // ---- neck, headstock and tuners (below the body so the body overlaps the neck joint) ----
  const headU0 = U * 0.012;
  const headH = nh * 1.04;
  const shadow = (s: string) => `<g transform="translate(${r1(w * 0.008)} ${r1(h * 0.012)})" opacity=".2">${s}</g>`;
  const neckEnd = kind === 'bass' ? bodyU0 + L * 0.3 : neckU1 + U * 0.02;
  const neckPath = f.d([
    ['M', neckU0 - 4, vc - nh * 0.52],
    ['L', neckEnd, vc - nh * 0.56],
    ['L', neckEnd, vc + nh * 0.56],
    ['L', neckU0 - 4, vc + nh * 0.52],
    ['Z'],
  ]);
  // headstock outline: a rounded trapezoid that widens away from the nut
  const hp = f.d([
    ['M', neckU0, vc - nh * 0.46],
    ['C', neckU0 - U * 0.02, vc - nh * 0.5, headU0 + U * 0.045, vc - headH / 2, headU0 + U * 0.018, vc - headH / 2],
    ['C', headU0, vc - headH / 2, headU0 - 1, vc - headH * 0.2, headU0 - 1, vc],
    ['C', headU0 - 1, vc + headH * 0.2, headU0, vc + headH / 2, headU0 + U * 0.018, vc + headH / 2],
    ['C', headU0 + U * 0.045, vc + headH / 2, neckU0 - U * 0.02, vc + nh * 0.5, neckU0, vc + nh * 0.46],
    ['Z'],
  ]);
  art += shadow(`<path d="${neckPath}" fill="#000"/><path d="${hp}" fill="#000"/>`);
  art += `<path d="${neckPath}" fill="url(#fr-neck)" stroke="#6b3d1a" stroke-width="1.5"/>`;
  art += `<path d="${hp}" fill="url(#fr-head)" stroke="#0d0603" stroke-width="2"/>`;
  // gloss on the headstock
  art += `<path d="${f.d([
    ['M', headU0 + 5, vc - headH * 0.44],
    ['L', neckU0 - 6, vc - nh * 0.4],
  ])}" stroke="rgba(255,255,255,.22)" stroke-width="3" stroke-linecap="round" fill="none"/>`;

  // string ends: one tuner post per string, alternating sides, staggered along the headstock
  const half = Math.ceil(n / 2);
  const stringU0 = (j: number): number => {
    const side = j < half ? j : n - 1 - j; // 0 = outermost on its side
    const k = side;
    return headU0 + U * 0.075 - k * (U * 0.024);
  };
  for (let j = 0; j < n; j++) {
    const u = stringU0(j);
    const v = stringV(j);
    const top = j < half;
    const edge = top ? vc - headH * 0.5 : vc + headH * 0.5;
    const outV = top ? edge - nh * 0.04 : edge + nh * 0.04;
    // shaft to the button, then the pearl button
    art += f.line(u, v, u, outV, '#9ca3af', 3);
    art += f.ell(u, outV, U * 0.008, nh * 0.055, 'url(#fr-pearl)', 'stroke="#6b7280" stroke-width="1.4"');
    art += f.ell(u, v, 6.5, 6.5, 'url(#fr-chrome)', 'stroke="#4b5563" stroke-width="1"');
    art += f.ell(u, v, 2.4, 2.4, '#374151');
  }

  // ---- body ----
  const clipId = 'fr-clip';
  if (kind === 'banjo') {
    const cu = bodyU0 + potR;
    const cv = vc;
    const R = potR;
    art += shadow(f.ell(cu, cv, R, R, '#000'));
    art += f.ell(cu, cv, R, R, 'url(#fr-pot)', 'stroke="#4a2a0c" stroke-width="2"');
    // bracket hooks and nuts around the rim
    const lugs = 24;
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      const cx = cu + Math.cos(a) * R * 0.94;
      const cy = cv + Math.sin(a) * R * 0.94;
      art += f.ell(cx, cy, R * 0.035, R * 0.035, 'url(#fr-chrome)', 'stroke="#4b5563" stroke-width="1"');
    }
    art += f.ell(cu, cv, R * 0.9, R * 0.9, 'url(#fr-chrome)', 'stroke="#4b5563" stroke-width="1.5"');
    art += f.ell(cu, cv, R * 0.84, R * 0.84, '#9ca3af');
    art += f.ell(cu, cv, R * 0.8, R * 0.8, 'url(#fr-head-skin)', 'stroke="#c9bfa8" stroke-width="2"');
    // a drum-head sheen
    art += f.ell(cu - R * 0.25, cv - R * 0.28, R * 0.35, R * 0.18, 'rgba(255,255,255,.55)');
    // tailpiece
    art += f.rect(cu + R * 0.62, cv - R * 0.2, R * 0.28, R * 0.4, 6, 'url(#fr-chrome)', 'stroke="#4b5563" stroke-width="1.5"');
  } else {
    art += shadow(`<path d="${bodyD}" fill="#000"/>`);
    defs += `<clipPath id="${clipId}"><path d="${bodyD}"/></clipPath>`;
    if (kind === 'bass') {
      art += `<path d="${bodyD}" fill="url(#fr-bassbody)" stroke="#1f0505" stroke-width="2.5"/>`;
    } else {
      // outer dark ring, cream binding, then the top
      art += `<path d="${bodyD}" fill="url(#fr-top)" stroke="#3a1c08" stroke-width="3"/>`;
      art += `<path d="${bodyD}" fill="none" stroke="#f3e3bd" stroke-width="2.6" clip-path="url(#${clipId})"/>`;
    }
    // grain, clipped to the outline
    let grain = '';
    const lines = 22;
    for (let i = 0; i < lines; i++) {
      const vv = vc + ((i + 0.5) / lines - 0.5) * 2 * bodyH * 1.02;
      const sway = (rnd(i + 3) - 0.5) * bodyH * 0.05;
      const dark = rnd(i + 11) > 0.45;
      grain += `<path d="${f.d([
        ['M', bodyU0, vv],
        ['C', bodyU0 + L * 0.35, vv + sway, bodyU0 + L * 0.65, vv - sway, bodyU1, vv + sway * 0.4],
      ])}" fill="none" stroke="${dark ? 'rgba(92,48,12,.13)' : 'rgba(255,244,214,.18)'}" stroke-width="${r1(0.8 + rnd(i) * 1.2)}"/>`;
    }
    art += `<g clip-path="url(#${clipId})">${grain}</g>`;
    // big soft sheen on the upper bout
    art += `<g clip-path="url(#${clipId})">${f.ell(bodyU0 + L * 0.3, vc - bodyH * 0.45, L * 0.3, bodyH * 0.2, 'rgba(255,255,255,.16)')}${f.ell(bodyU0 + L * 0.72, vc - bodyH * 0.55, L * 0.18, bodyH * 0.1, 'rgba(255,255,255,.14)')}</g>`;
  }

  // ---- body details ----
  const bridgeU = kind === 'banjo' ? bodyU0 + potR * 1.32 : bodyU0 + L * (kind === 'bass' ? 0.78 : 0.76);
  if (kind === 'guitar' || kind === 'ukulele') {
    const hu = bodyU0 + L * (kind === 'ukulele' ? 0.36 : 0.38);
    const hr = Math.min(L * (kind === 'ukulele' ? 0.1 : 0.115), bodyH * 0.4);
    // rosette: wood ring, ivory ring, black ring, then the hole
    art += f.ell(hu, vc, hr * 1.32, hr * 1.32, '#4a260c');
    art += f.ell(hu, vc, hr * 1.2, hr * 1.2, '#f1e3c0');
    art += f.ell(hu, vc, hr * 1.12, hr * 1.12, '#241208');
    art += f.ell(hu, vc, hr * 1.04, hr * 1.04, '#c78f4a');
    art += f.ell(hu, vc, hr, hr, 'url(#fr-hole)');
    // the lit rim inside the hole
    art += `<path d="${f.d([
      ['M', hu - hr * 0.8, vc - hr * 0.5],
      ['C', hu - hr * 0.5, vc - hr * 0.88, hu + hr * 0.4, vc - hr * 0.9, hu + hr * 0.8, vc - hr * 0.45],
    ])}" fill="none" stroke="rgba(255,226,170,.28)" stroke-width="2.2" stroke-linecap="round"/>`;
    if (kind === 'guitar') {
      // tortoiseshell pickguard
      const pu = hu + hr * 1.5;
      art += `<path d="${f.d([
        ['M', pu, vc + hr * 1.45],
        ['C', pu + hr * 0.7, vc + hr * 1.3, pu + hr * 1.4, vc + hr * 1.5, pu + hr * 1.7, vc + hr * 2.1],
        ['C', pu + hr * 1.5, vc + hr * 2.8, pu + hr * 0.6, vc + hr * 2.9, pu - hr * 0.2, vc + hr * 2.5],
        ['C', pu - hr * 0.6, vc + hr * 2.1, pu - hr * 0.4, vc + hr * 1.6, pu, vc + hr * 1.45],
        ['Z'],
      ])}" fill="rgba(46,18,6,.5)" stroke="rgba(0,0,0,.25)" stroke-width="1"/>`;
    }
  }
  // bridge + saddle
  const bw = kind === 'banjo' ? nh * 0.9 : nh * 1.12;
  if (kind === 'bass') {
    art += f.rect(bridgeU - U * 0.016, vc - bw / 2, U * 0.032, bw, 4, 'url(#fr-chrome)', 'stroke="#374151" stroke-width="1.5"');
    for (let j = 0; j < n; j++) art += f.ell(bridgeU, stringV(j), 4, 6, '#d1d5db', 'stroke="#4b5563" stroke-width="1.2"');
    // pearl pickguard under the pickups
    art += f.rect(bodyU0 + L * 0.4, vc - bodyH * 0.74, L * 0.4, bodyH * 1.3, bodyH * 0.16, 'rgba(248,244,232,.96)', 'stroke="#7c6f55" stroke-width="1.6"');
    art += f.rect(bodyU0 + L * 0.42, vc - bodyH * 0.7, L * 0.04, bodyH * 1.2, 4, 'rgba(255,255,255,.7)');
    // pickups: two black covers with chrome pole pieces, then knobs
    for (const [pu, ph] of [
      [bodyU0 + L * 0.5, nh * 0.7],
      [bodyU0 + L * 0.63, nh * 0.7],
    ] as const) {
      art += f.rect(pu - U * 0.014, vc - ph / 2, U * 0.028, ph, 5, '#18181b', 'stroke="#000" stroke-width="1.5"');
      for (let j = 0; j < n; j++) art += f.ell(pu, stringV(j), 2.6, 2.6, '#d1d5db');
    }
    art += f.ell(bodyU0 + L * 0.62, vc + bodyH * 0.74, bodyH * 0.08, bodyH * 0.08, 'url(#fr-chrome)', 'stroke="#374151" stroke-width="1.5"');
    art += f.ell(bodyU0 + L * 0.77, vc + bodyH * 0.74, bodyH * 0.08, bodyH * 0.08, 'url(#fr-chrome)', 'stroke="#374151" stroke-width="1.5"');
    art += `<g clip-path="url(#${clipId})">${f.ell(bodyU0 + L * 0.3, vc - bodyH * 0.55, L * 0.28, bodyH * 0.12, 'rgba(255,255,255,.2)')}</g>`;
  } else if (kind === 'banjo') {
    art += f.rect(bridgeU - 5, vc - bw * 0.3, 10, bw * 0.6, 3, '#e9d9b8', 'stroke="#7c5a2a" stroke-width="1.5"');
    art += f.rect(bridgeU - 1.5, vc - bw * 0.3, 3, bw * 0.6, 1, '#3a2412');
  } else {
    art += f.rect(bridgeU - U * 0.02, vc - bw / 2, U * 0.04, bw, 8, 'url(#fr-bridge)', 'stroke="#140803" stroke-width="1.5"');
    art += f.rect(bridgeU - 2.5, vc - nh * 0.46, 5, nh * 0.92, 2, '#f6efe0', 'stroke="#b8ad94" stroke-width="1"'); // bone saddle
    for (let j = 0; j < n; j++) art += f.ell(bridgeU + U * 0.011, stringV(j), 2.8, 2.8, '#f6efe0', 'stroke="#2a160d" stroke-width="1"');
    art += f.rect(bridgeU - U * 0.016, vc - bw / 2 + 3, U * 0.005, bw - 6, 2, 'rgba(255,255,255,.18)');
  }

  // ---- fingerboard, frets, inlays ----
  art += shadow(f.rect(neckU0, vc - nh / 2, neckU1 - neckU0 + U * 0.012, nh, 4, '#000'));
  art += f.rect(neckU0, vc - nh / 2, neckU1 - neckU0 + U * 0.012, nh, 4, 'url(#fr-fb)', 'stroke="#1a0c06" stroke-width="1.5"');
  // wood grain on the fingerboard
  for (let i = 0; i < 9; i++) {
    const vv = vc - nh / 2 + ((i + 0.6) / 9) * nh;
    art += f.line(neckU0 + 4, vv, neckU1 + U * 0.01, vv + (rnd(i + 40) - 0.5) * 3, 'rgba(255,230,190,.07)', 1.2);
  }
  // a thin light glint along the top edge
  art += f.line(neckU0 + 4, vc - nh / 2 + 3, neckU1 + U * 0.01, vc - nh / 2 + 3, 'rgba(255,235,200,.16)', 2);
  for (let c = 1; c <= 5; c++) {
    const fu = neckU0 + c * cell + (c === 5 ? U * 0.0 : 0);
    if (c === 5) break;
    art += f.line(fu + 1.5, vc - nh / 2 + 1.5, fu + 1.5, vc + nh / 2 - 1.5, 'rgba(0,0,0,.28)', 4.5);
    art += f.line(fu, vc - nh / 2 + 1.5, fu, vc + nh / 2 - 1.5, 'url(#fr-fret)', 4.2);
  }
  // inlays (pearl dots at the edge, like the side markers), then the bone nut
  for (const c of [1, 3]) art += f.ell(neckU0 + (c + 0.5) * cell, vc + nh / 2 - 7, 3.2, 3.2, 'url(#fr-pearl)');
  art += f.rect(neckU0 - 3, vc - nh * 0.495, 7, nh * 0.99, 2, '#f4ecd6', 'stroke="#a89c7f" stroke-width="1"');

  // ---- chord cells: a quiet colour wash and glossy finger dots ----
  const zones: Zone[] = [];
  CHORDS.forEach((name, c) => {
    const col = CHORD_COLORS[name]!;
    const u = neckU0 + c * cell;
    defs += rg(`fr-d-${name}`, [[0, shade(col, 0.6)], [0.55, col], [1, shade(col, -0.25)]], 0.5, 0.5, 0.55, 0.36, 0.3);
    zones.push({ id: `chord:${name}`, shape: f.shapeRect(u, vc - nh / 2, cell, nh), role: 'chord', voices: [] });
    let g = f.rect(u + 3, vc - nh / 2 + 3, cell - 6, nh - 6, 6, col, 'opacity=".38"');
    for (const [fu, fv] of DOTS[name]!) {
      const dr = Math.min(cell, nh) * 0.15;
      const du = u + fu * cell;
      const dv = vc - nh / 2 + fv * nh;
      g += f.ell(du + 2, dv + 3, dr, dr, 'rgba(0,0,0,.28)');
      g += f.ell(du, dv, dr, dr, `url(#fr-d-${name})`, 'stroke="#fff" stroke-width="2.5"');
    }
    art += zg(`chord:${name}`, g, 'chord');
  });

  // ---- strings: a faint shadow, then the live string (fx.ts bends it) ----
  const u1 = bridgeU;
  const lines: number[] = [];
  let strShadow = '';
  const strLive: string[] = [];
  for (let j = 0; j < n; j++) {
    const v = stringV(j);
    const u0 = stringU0(j);
    const p = [f.X(u0, v), f.Y(u0, v), f.X(u1, v), f.Y(u1, v)];
    lines.push(portrait ? p[0]! : p[1]!);
    const rel = (n - 1 - j) / (n - 1); // 1 = thickest
    const thick = kind === 'bass' ? 3.2 + rel * 1.8 : kind === 'ukulele' ? 1.9 + rel * 0.5 : 1.2 + rel * 2.2;
    const wound = kind === 'bass' ? true : kind === 'ukulele' ? false : kind === 'banjo' ? j >= 3 : j < 3;
    const color = kind === 'ukulele' ? '#f8fafc' : kind === 'bass' ? '#d5dbe3' : wound ? WOUND : STEEL;
    const s = (dx: number, dy: number) =>
      `M${(p[0]! + dx).toFixed(1)} ${(p[1]! + dy).toFixed(1)}L${(p[2]! + dx).toFixed(1)} ${(p[3]! + dy).toFixed(1)}`;
    strShadow += `<path d="${s(portrait ? 2.4 : 1, portrait ? 1 : 3)}" stroke="rgba(0,0,0,.22)" stroke-width="${thick.toFixed(1)}" stroke-linecap="round" fill="none"/>`;
    strLive.push(
      `<path class="str" data-s="${j}" data-p="${p.map((q) => Math.round(q * 10) / 10).join(',')}" d="${s(0, 0)}" stroke="${color}" stroke-width="${thick.toFixed(1)}" stroke-linecap="round" fill="none"/>`,
    );
  }
  art += strShadow + strLive.join('');
  void ell;

  // Strum area: the body
  const strumShape = f.shapeRect(neckU1, V * 0.03, U * 0.97 - neckU1, V * 0.94);
  zones.push({ id: 'strum', shape: strumShape, role: 'strum', voices: [] });
  art += zg('strum', f.rect(neckU1, V * 0.03, U * 0.97 - neckU1, V * 0.94, 20, 'rgba(255,255,255,0)'), 'strum');

  const chords: StrumSpec['chords'] = {};
  for (const name of CHORDS) chords[name] = VOICINGS[kind][name]!.map((m) => voiceFor(kind, m, harmony));
  return {
    kind,
    family: 'fret',
    w,
    h,
    portrait,
    harmony,
    zones: [zones[zones.length - 1]!, ...zones.slice(0, -1)],
    svg: wrap(w, h, defs, art, NAMES[kind]),
    glide: false,
    strum: { axis: portrait ? 'x' : 'y', lines, chords, order: CHORDS },
  };
}
