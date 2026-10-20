import { majorFrom, pentaFrom, tune } from './scale';
import { ell, Frame, line, linGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, StrumSpec, Voice, Zone } from './types';
import { inst, note } from './voices';

type FretKind = 'guitar' | 'ukulele' | 'banjo' | 'bass';

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
const BODY: Record<FretKind, string> = { guitar: '#c2410c', ukulele: '#f59e0b', banjo: '#f8fafc', bass: '#dc2626' };

function voiceFor(kind: FretKind, m: number | null, harmony: Harmony): Voice | null {
  if (m === null) return null;
  const t = tune(m, harmony);
  if (kind === 'guitar') return note('guitar', t, 1.4);
  if (kind === 'bass') return note('bass', t, 0.9);
  return inst(kind, t);
}

/**
 * Guitar, ukulele, banjo, bass. Four big chord cells along the neck (C, Am, F, G);
 * swipe across the strings on the body to strum them (a tap strums them all).
 * Landscape lays the instrument on its side; portrait holds it upright.
 */
export function layoutFret(kind: FretKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const vc = V / 2;
  const strings = VOICINGS[kind].C!.length;
  const neckU0 = U * 0.07;
  const neckU1 = U * 0.58;
  const nh = V * (kind === 'bass' ? 0.5 : 0.56);
  const cell = (neckU1 - neckU0) / 4;
  const sp = (nh * 0.84) / (strings - 1);
  const stringV = (j: number) => vc + (j - (strings - 1) / 2) * sp;
  const defs =
    linGrad('fr-neck', '#92400e', '#78350f', false) + linGrad('fr-body', shade(BODY[kind], 0.25), shade(BODY[kind], -0.15), false);
  let art = rect(0, 0, w, h, 0, '#fef3c7');

  // Body
  const bu = U * 0.74;
  const bodyStroke = `stroke="${shade(BODY[kind], -0.45)}" stroke-width="3"`;
  if (kind === 'banjo') {
    art += f.ell(bu, vc, U * 0.2, V * 0.4, '#a1a1aa');
    art += f.ell(bu, vc, U * 0.185, V * 0.37, 'url(#fr-body)', bodyStroke);
    art += f.ell(bu, vc, U * 0.12, V * 0.24, 'rgba(0,0,0,.05)');
  } else if (kind === 'bass') {
    art += f.ell(bu - U * 0.04, vc - V * 0.12, U * 0.14, V * 0.26, 'url(#fr-body)', bodyStroke);
    art += f.ell(bu + U * 0.06, vc + V * 0.08, U * 0.15, V * 0.3, 'url(#fr-body)', bodyStroke);
    art += f.rect(bu - U * 0.02, vc - V * 0.2, U * 0.04, V * 0.4, 6, '#18181b');
    art += f.rect(bu + U * 0.08, vc - V * 0.2, U * 0.04, V * 0.4, 6, '#18181b');
  } else {
    const small = kind === 'ukulele' ? 0.82 : 1;
    art += f.ell(bu - U * 0.07 * small, vc, U * 0.13 * small, V * 0.3 * small, 'url(#fr-body)', bodyStroke);
    art += f.ell(bu + U * 0.07 * small, vc, U * 0.16 * small, V * 0.4 * small, 'url(#fr-body)', bodyStroke);
    art += f.ell(bu, vc, U * 0.05, V * 0.08, '#1c1917');
  }
  // Neck + headstock
  art += f.rect(U * 0.01, vc - nh * 0.34, neckU0 + U * 0.02, nh * 0.68, 12, '#451a03');
  for (let j = 0; j < strings; j++) {
    art += f.ell(U * 0.03, vc + (j - (strings - 1) / 2) * ((nh * 0.55) / strings) * 1.5, 5, 5, '#e5e7eb');
  }
  art += f.rect(neckU0, vc - nh / 2, neckU1 - neckU0 + U * 0.04, nh, 6, 'url(#fr-neck)');
  for (let c = 1; c <= 4; c++) art += f.line(neckU0 + c * cell, vc - nh / 2, neckU0 + c * cell, vc + nh / 2, '#d6d3d1', 4);

  // Chord cells
  const zones: Zone[] = [];
  CHORDS.forEach((name, c) => {
    const col = CHORD_COLORS[name]!;
    const u = neckU0 + c * cell;
    zones.push({ id: `chord:${name}`, shape: f.shapeRect(u, vc - nh / 2, cell, nh), role: 'chord', voices: [] });
    let g = f.rect(u + 3, vc - nh / 2 + 3, cell - 6, nh - 6, 8, col, 'opacity=".34"');
    for (const [fu, fv] of DOTS[name]!) {
      g += f.ell(
        u + fu * cell,
        vc - nh / 2 + fv * nh,
        Math.min(cell, nh) * 0.14,
        Math.min(cell, nh) * 0.14,
        col,
        'stroke="#fff" stroke-width="3"',
      );
    }
    art += zg(`chord:${name}`, g, 'chord');
  });

  // Strings (animated by the player; endpoints are in data-p)
  const u0 = U * 0.045;
  const u1 = bu + U * 0.12;
  const lines: number[] = [];
  const strDefs: string[] = [];
  for (let j = 0; j < strings; j++) {
    const v = stringV(j);
    const p = [f.X(u0, v), f.Y(u0, v), f.X(u1, v), f.Y(u1, v)];
    lines.push(portrait ? p[0]! : p[1]!);
    const thick = kind === 'bass' ? 3 + (strings - 1 - j) * 0.9 : 1.6 + (strings - 1 - j) * 0.5;
    strDefs.push(
      `<path class="str" data-s="${j}" data-p="${p.map((n) => Math.round(n * 10) / 10).join(',')}" d="M${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}L${p[2]!.toFixed(1)} ${p[3]!.toFixed(1)}" stroke="${kind === 'banjo' ? '#64748b' : '#fafaf9'}" stroke-width="${thick.toFixed(1)}" stroke-linecap="round" fill="none"/>`,
    );
  }
  art += f.rect(bu + U * 0.05, vc - nh * 0.5, U * 0.02, nh, 4, '#27272a'); // bridge
  art += strDefs.join('');

  // Strum area: the body
  const strumShape = f.shapeRect(neckU1, V * 0.03, U * 0.97 - neckU1, V * 0.94);
  zones.push({ id: 'strum', shape: strumShape, role: 'strum', voices: [] });
  art += zg('strum', f.rect(neckU1, V * 0.03, U * 0.97 - neckU1, V * 0.94, 20, 'rgba(255,255,255,.2)'), 'strum');

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
  const defs = linGrad('hp-wood', '#d97706', '#78350f', false);
  let art = rect(0, 0, w, h, 0, '#fdf2f8');
  // Frame: curved neck over the top, pillar on the right, soundbox at the bottom
  art += `<path d="M${pad} ${topY(0) - 8} Q${w * 0.55} ${topY(0) - 22} ${w - pad - pillar / 2} ${topY(n - 1) + 4}" stroke="url(#hp-wood)" stroke-width="18" fill="none" stroke-linecap="round"/>`;
  art += rect(w - pad - pillar, topY(n - 1), pillar, h * 0.9 - topY(n - 1), pillar / 2, 'url(#hp-wood)');
  art += `<path d="M${pad} ${botY(0) + 2} L${w - pad} ${botY(n - 1) + 2} L${w - pad} ${h - pad} L${pad} ${h - pad} Z" fill="url(#hp-wood)" stroke="#451a03" stroke-width="3" stroke-linejoin="round"/>`;
  art += ell(w * 0.35, h * 0.96, w * 0.05, h * 0.012, '#1c1917');
  const zones: Zone[] = [];
  const lines: number[] = [];
  notes.forEach((m, i) => {
    const x = pad + i * sw + sw / 2;
    const y1 = topY(i);
    const y2 = botY(i) + 2;
    const isC = m % 12 === 0;
    lines.push(x);
    zones.push({
      id: `s${m}`,
      shape: { t: 'rect', x: pad + i * sw, y: y1, w: sw, h: y2 - y1 },
      role: 'play',
      voices: [inst('harp', tune(m, harmony))],
    });
    art += zg(
      `s${m}`,
      `<path class="str" data-s="${i}" data-p="${x.toFixed(1)},${y1.toFixed(1)},${x.toFixed(1)},${y2.toFixed(1)}" d="M${x.toFixed(1)} ${y1.toFixed(1)}L${x.toFixed(1)} ${y2.toFixed(1)}" stroke="${isC ? '#ef4444' : '#78350f'}" stroke-width="${isC ? 4 : 3}" stroke-linecap="round" fill="none"/>` +
        ell(x, y1, 6, 6, '#e5e7eb', 'stroke="#78350f" stroke-width="2"'),
    );
  });
  void line;
  return { kind: 'harp', family: 'harp', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Đàn hạc'), glide: true };
}

/**
 * Violin: four strings from the scroll to the bridge. Put a finger on a string and
 * draw it along: where the finger is decides the note (higher toward the bridge),
 * and moving it keeps the bow going. Every note is C pentatonic or C major.
 */
export function layoutViolin(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, false);
  const U = f.U;
  const V = f.V;
  const bands = 5;
  const u0 = U * 0.1;
  const bw = (U * 0.8) / bands;
  const sw = V / 4;
  const opens = [55, 62, 69, 76];
  const defs = linGrad('vn-wood', '#b45309', '#7c2d12', false) + linGrad('vn-fb', '#292524', '#0c0a09', false);
  let art = rect(0, 0, w, h, 0, '#ecfccb');
  // body
  const bu = U * 0.7;
  art += f.ell(bu - U * 0.06, V / 2, U * 0.12, V * 0.3, 'url(#vn-wood)', 'stroke="#431407" stroke-width="3"');
  art += f.ell(bu + U * 0.08, V / 2, U * 0.15, V * 0.4, 'url(#vn-wood)', 'stroke="#431407" stroke-width="3"');
  art += f.rect(bu - U * 0.12, V * 0.43, U * 0.1, V * 0.14, 10, 'url(#vn-wood)');
  // f-holes
  art += f.rect(bu + U * 0.02, V * 0.28, U * 0.1, 5, 3, '#1c1917');
  art += f.rect(bu + U * 0.02, V * 0.67, U * 0.1, 5, 3, '#1c1917');
  // fingerboard and scroll
  art += f.rect(U * 0.1, V * 0.02, U * 0.6, V * 0.96, 10, 'url(#vn-fb)');
  art += f.ell(U * 0.04, V / 2, U * 0.04, V * 0.08, '#78350f');
  art += f.rect(U * 0.04, V / 2 - V * 0.16, U * 0.08, V * 0.32, 8, '#451a03');
  art += f.rect(bu + U * 0.07, V / 2 - V * 0.17, U * 0.02, V * 0.34, 4, '#fde68a');
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
    const vs = v + sw / 2;
    const ux1 = U * 0.06;
    const ux2 = bu + U * 0.1;
    const p = [f.X(ux1, vs), f.Y(ux1, vs), f.X(ux2, vs), f.Y(ux2, vs)].map((n) => Math.round(n * 10) / 10);
    art += `<path class="str" data-s="${s}" data-p="${p.join(',')}" d="M${p[0]} ${p[1]}L${p[2]} ${p[3]}" stroke="#e7e5e4" stroke-width="${1.8 + (3 - s) * 0.6}" stroke-linecap="round" fill="none"/>`;
  }
  // frets: a faint line between the places, and two dots like the marks on a real fingerboard
  for (let b = 1; b < bands; b++) art += f.line(u0 + b * bw, V * 0.04, u0 + b * bw, V * 0.96, 'rgba(255,255,255,.13)', 2);
  for (const b of [1, 3]) art += f.ell(u0 + (b + 0.5) * bw, V / 2, 5, 5, 'rgba(255,255,255,.2)');
  return { kind: 'violin', family: 'bow', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Đàn violin'), glide: false };
}
