import { lg, rg } from './art';
import { across, along, BRASS, BRASS_TONE, SILVER, tubeStroke } from './brass';
import { pentaFrom, tune } from './scale';
import { Frame, rect, wrap, zg } from './svg';
import type { Board, Harmony, Voice, Zone } from './types';
import { note } from './voices';

type TubeKind = 'flute' | 'trumpet' | 'sax';

const TUBE: Record<TubeKind, { name: string; holes: number; bg: [string, string] }> = {
  flute: { name: 'Sáo', holes: 4, bg: ['#f0f9ff', '#bae6fd'] },
  trumpet: { name: 'Kèn trumpet', holes: 3, bg: ['#fffbeb', '#fde68a'] },
  sax: { name: 'Kèn saxophone', holes: 4, bg: ['#fff7ed', '#fed7aa'] },
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
  const sax = kind === 'sax';
  const flute = kind === 'flute';
  const bv = sax ? vc + V * 0.1 : vc; // centre line of the tube
  const blowR = Math.max(Math.min(th * 0.5, U * 0.1), 40);

  const silverTube = flute;
  let defs =
    lg('tb-bg', [[0, sp.bg[0]], [1, sp.bg[1]]]) +
    across('tb-tube', portrait, silverTube ? SILVER : BRASS) +
    along('tb-casing', portrait, silverTube ? SILVER : BRASS) +
    rg('tb-bellin', [[0, '#1c0f02'], [0.7, '#5a3408'], [1, '#c98d12']], 0.5, 0.5, 0.6) +
    rg('tb-pearl', [[0, '#ffffff'], [0.5, '#f5ece0'], [0.85, '#cdbfae'], [1, '#9a8c7c']], 0.38, 0.32, 0.75) +
    rg('tb-ring', [[0, '#fff7d6'], [0.5, '#e2b13c'], [1, '#7a4a08']], 0.4, 0.35, 0.8) +
    rg('tb-ringS', [[0, '#ffffff'], [0.5, '#c4ccd8'], [1, '#6b7280']], 0.4, 0.35, 0.8) +
    rg('tb-pad', [[0, '#7c5a3a'], [0.6, '#3b2615'], [1, '#1a0f06']], 0.38, 0.3, 0.8) +
    lg('tb-ebony', [[0, '#3a3a3f'], [0.3, '#15151a'], [1, '#050507']], ...(portrait ? [1, 0, 0, 0] : [0, 1, 0, 0])) ;
  let art = rect(0, 0, w, h, 0, 'url(#tb-bg)');
  const edge = silverTube ? '#4b5563' : '#7a4a08';

  // a soft floor shadow under everything
  if (!portrait) art += f.ell(U * 0.5, bv + th * (flute ? 0.55 : 1.18), U * 0.42, th * 0.09, 'rgba(60,30,0,.14)');

  // ---- holes / valves / keys positions ----
  const u0 = kind === 'trumpet' ? U * 0.335 : sax ? U * 0.3 : U * 0.32;
  const u1 = kind === 'trumpet' ? U * 0.71 : sax ? U * 0.78 : U * 0.9;
  const step = (u1 - u0) / n;
  const hr = Math.min(step / 2 - 1, th * 0.46, 46);
  const centers = Array.from({ length: n }, (_, i) => u0 + step * (i + 0.5));

  if (kind === 'trumpet') {
    const t0 = th * 0.3; // pipe thickness
    const bu0 = U * 0.7;
    const bh = Math.min(V * 0.46, th * 1.3);
    const uRim = U - bh * 0.15 - 2;
    const lw = th * 0.16;
    const vTop = bv - th * 1.1;
    const vBot = bv + th * 1.1;
    const r = th * 0.2;
    // big tuning loop above, valve-slide loop below
    const loop = (ua: number, ub: number, vFar: number, va: number, vb: number) => {
      const s = vFar < bv ? 1 : -1;
      return f.d([
        ['M', ua, va],
        ['L', ua, vFar + s * r],
        ['Q', ua, vFar, ua + r, vFar],
        ['L', ub - r, vFar],
        ['Q', ub, vFar, ub, vFar + s * r],
        ['L', ub, vb],
      ]);
    };
    art += tubeStroke(loop(U * 0.26, bu0 - U * 0.012, vTop, bv - th * 0.1, bv - t0 * 0.2), lw, BRASS_TONE);
    art += tubeStroke(loop(u0 + step * 0.5, centers[n - 1]!, vBot, bv + th * 0.1, bv + th * 0.1), lw, BRASS_TONE);
    art += tubeStroke(loop(u0 + step * 0.5 - r * 1.6, centers[n - 1]! + r * 1.6, vBot + th * 0.14, bv + th * 0.1, bv + th * 0.1), lw * 0.6, BRASS_TONE);
    // leadpipe and main pipe
    art += tubeStroke(f.d([['M', U * 0.1, bv], ['L', bu0 + 6, bv]]), t0, BRASS_TONE);
    // mouthpiece
    art += `<path d="${f.d([
      ['M', U * 0.025, bv - th * 0.2],
      ['L', U * 0.07, bv - th * 0.17],
      ['C', U * 0.09, bv - th * 0.16, U * 0.1, bv - th * 0.14, U * 0.125, bv - th * 0.14],
      ['L', U * 0.125, bv + th * 0.14],
      ['C', U * 0.1, bv + th * 0.14, U * 0.09, bv + th * 0.16, U * 0.07, bv + th * 0.17],
      ['L', U * 0.025, bv + th * 0.2],
      ['Z'],
    ])}" fill="url(#tb-tube)" stroke="${edge}" stroke-width="2"/>`;
    art += f.ell(U * 0.025, bv, 4, th * 0.2, 'url(#tb-tube)', `stroke="${edge}" stroke-width="2"`);
    art += f.ell(U * 0.029, bv, 3, th * 0.14, '#2a1503');
    // valve casings
    centers.forEach((cu, i) => {
      const cw = hr * 1.5;
      art += f.rect(cu - cw / 2, bv - th * 0.66, cw, th * 1.32, cw * 0.18, 'url(#tb-casing)', `stroke="${edge}" stroke-width="2.4"`);
      art += f.rect(cu - cw * 0.58, bv - th * 0.7, cw * 1.16, th * 0.1, 4, 'url(#tb-casing)', `stroke="${edge}" stroke-width="2"`);
      art += f.rect(cu - cw * 0.58, bv + th * 0.6, cw * 1.16, th * 0.1, 4, 'url(#tb-casing)', `stroke="${edge}" stroke-width="2"`);
      // valve cap screw ring & a name stamp on the casing
      art += f.line(cu - cw * 0.35, bv - th * 0.56, cu + cw * 0.35, bv - th * 0.56, 'rgba(255,255,255,.5)', 2);
      void i;
    });
    // bell
    art += `<path d="${f.d([
      ['M', bu0, bv - t0 / 2],
      ['C', bu0 + U * 0.07, bv - t0 / 2, uRim - U * 0.08, bv - bh * 0.5, uRim, bv - bh],
      ['L', uRim, bv + bh],
      ['C', uRim - U * 0.08, bv + bh * 0.5, bu0 + U * 0.07, bv + t0 / 2, bu0, bv + t0 / 2],
      ['Z'],
    ])}" fill="url(#tb-tube)" stroke="${edge}" stroke-width="2.4"/>`;
    // a lacquer streak down the flare and the engraved band
    art += `<path d="${f.d([
      ['M', bu0 + U * 0.03, bv - t0 * 0.3],
      ['C', bu0 + U * 0.1, bv - t0 * 0.3, uRim - U * 0.08, bv - bh * 0.35, uRim - 6, bv - bh * 0.78],
    ])}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="5" stroke-linecap="round"/>`;
    art += f.ell(uRim, bv, bh * 0.15, bh, 'url(#tb-bellin)', `stroke="#fde68a" stroke-width="4"`);
    art += f.ell(uRim, bv, bh * 0.15, bh, 'none', `stroke="${edge}" stroke-width="1.5" transform-box="fill-box"`);
    art += f.ell(uRim - bh * 0.05, bv - bh * 0.3, bh * 0.03, bh * 0.4, 'rgba(255,255,255,.28)');
  } else if (sax) {
    const tn = th * 0.3;
    const tw = th * 0.74;
    const ub = U * 0.84;
    const bwB = tw * 0.42;
    const bwT = Math.min(tw * 1.25, U * 0.14);
    const top = V * 0.07;
    const H = bv - top;
    // neck from the mouthpiece curving down into the body
    art += tubeStroke(f.d([['M', U * 0.1, vc], ['C', U * 0.19, vc, U * 0.19, bv, U * 0.25, bv]]), tn, BRASS_TONE);
    // conical body
    art += `<path d="${f.d([
      ['M', U * 0.2, bv - tn / 2],
      ['L', ub, bv - tw / 2],
      ['L', ub, bv + tw / 2],
      ['L', U * 0.2, bv + tn / 2],
      ['Z'],
    ])}" fill="url(#tb-tube)" stroke="${edge}" stroke-width="2.4"/>`;
    // rods along the body
    art += f.line(U * 0.28, bv - tw * 0.58, ub - bwB, bv - tw * 0.58, 'rgba(120,70,8,.9)', 4);
    art += f.line(U * 0.28, bv - tw * 0.58, ub - bwB, bv - tw * 0.58, 'rgba(255,240,180,.9)', 1.5);
    // bow and bell column
    art += `<path d="${f.d([
      ['M', ub - bwB, bv + tw * 0.5],
      ['L', ub - bwB, bv],
      ['C', ub - bwB, bv - H * 0.6, ub - bwT * 0.75, top + H * 0.12, ub - bwT, top],
      ['L', ub + bwT, top],
      ['C', ub + bwT * 0.75, top + H * 0.12, ub + bwB, bv - H * 0.6, ub + bwB, bv],
      ['L', ub + bwB, bv + tw * 0.5],
      ['C', ub + bwB, bv + tw * 0.5 + tw * 0.4, ub - bwB, bv + tw * 0.5 + tw * 0.4, ub - bwB, bv + tw * 0.5],
      ['Z'],
    ])}" fill="url(#tb-casing)" stroke="${edge}" stroke-width="2.4"/>`;
    art += `<path d="${f.d([
      ['M', ub - bwB * 0.4, bv + tw * 0.4],
      ['L', ub - bwB * 0.45, bv - H * 0.1],
      ['C', ub - bwB * 0.5, bv - H * 0.45, ub - bwT * 0.8, top + H * 0.3, ub - bwT * 0.78, top + 10],
    ])}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="5" stroke-linecap="round"/>`;
    art += f.ell(ub, top, bwT, bwT * 0.2, 'url(#tb-bellin)', `stroke="#fde68a" stroke-width="4"`);
    // brace rod and a few little side keys
    art += f.line(U * 0.5, bv - tw * 0.5, ub - bwB, bv - tw * 0.5, 'rgba(0,0,0,.18)', 2);
    [0.4, 0.56, 0.68].forEach((t) => {
      art += f.ell(U * t, bv - tw * 0.62, hr * 0.32, hr * 0.2, 'url(#tb-ring)', `stroke="${edge}" stroke-width="1.6"`);
    });
    // mouthpiece: ebonite with a brass ligature and a reed
    art += f.rect(U * 0.04, vc - th * 0.1, U * 0.07, th * 0.2, th * 0.06, 'url(#tb-ebony)', 'stroke="#000" stroke-width="1.5"');
    art += f.rect(U * 0.085, vc - th * 0.13, U * 0.022, th * 0.26, 3, 'url(#tb-tube)', `stroke="${edge}" stroke-width="1.5"`);
    art += f.rect(U * 0.04, vc + th * 0.06, U * 0.05, th * 0.05, 2, '#e8cf8e');
  } else {
    // ---- flute: a slim silver tube ----
    const ft = th * 0.56;
    const bodyU0 = U * 0.12;
    const bodyU1 = U * 0.96;
    art += f.rect(bodyU0, bv - ft / 2, bodyU1 - bodyU0, ft, ft * 0.18, 'url(#tb-tube)', `stroke="${edge}" stroke-width="2.4"`);
    // joints (rings) and the foot
    [0.3, 0.62, 0.92].forEach((t) => {
      art += f.rect(U * t - 6, bv - ft * 0.56, 12, ft * 1.12, 4, 'url(#tb-tube)', `stroke="${edge}" stroke-width="2"`);
    });
    // rods and posts above and below the keys
    for (const s of [-1, 1]) {
      const rv = bv + s * ft * 0.66;
      art += f.line(U * 0.2, rv, bodyU1 - 14, rv, 'rgba(60,70,85,.85)', 4);
      art += f.line(U * 0.2, rv, bodyU1 - 14, rv, 'rgba(255,255,255,.85)', 1.4);
      for (let k = 0; k < 6; k++) art += f.ell(U * (0.24 + k * 0.13), rv, 5, 5, 'url(#tb-ringS)', `stroke="${edge}" stroke-width="1.5"`);
    }
    // head joint: crown, lip plate and the embouchure hole
    art += f.rect(U * 0.04, bv - ft * 0.42, U * 0.08, ft * 0.84, ft * 0.2, 'url(#tb-tube)', `stroke="${edge}" stroke-width="2.4"`);
    art += f.rect(U * 0.02, bv - ft * 0.34, U * 0.04, ft * 0.68, ft * 0.25, 'url(#tb-ringS)', `stroke="${edge}" stroke-width="2"`);
    art += f.ell(U * 0.095, bv, U * 0.05, ft * 0.62, 'url(#tb-ringS)', `stroke="${edge}" stroke-width="2.4"`);
    art += f.ell(U * 0.095, bv, U * 0.026, ft * 0.26, '#0f172a');
    art += f.ell(U * 0.092, bv - ft * 0.08, U * 0.012, ft * 0.1, 'rgba(255,255,255,.25)');
  }

  // ---- finger holes / keys (zones) ----
  const zones: Zone[] = [];
  const holes: string[] = [];
  for (let i = 0; i < n; i++) {
    const cu = centers[i]!;
    const id = `hole${i}`;
    holes.push(id);
    zones.push({ id, shape: f.shapeEll(cu, bv, hr, hr), role: 'hole', voices: [] });
    let g = '';
    const kf = 0.78;
    if (flute) {
      // an open tone hole in a silver key cup; covered = a polished cap over it
      g += f.ell(cu, bv, kf * hr * 1.02, kf * hr * 1.02, 'rgba(0,0,0,.18)', 'transform="translate(2 3)"');
      g += f.ell(cu, bv, kf * hr, kf * hr, 'url(#tb-ringS)', `stroke="${edge}" stroke-width="3"`);
      g += f.ell(cu, bv, kf * hr * 0.62, kf * hr * 0.62, '#0b1220', 'stroke="#334155" stroke-width="2"');
      g += f.ell(cu - kf * hr * 0.2, bv - kf * hr * 0.22, kf * hr * 0.2, kf * hr * 0.12, 'rgba(255,255,255,.35)');
      g += `<g class="cap">${f.ell(cu, bv, kf * hr * 0.8, kf * hr * 0.8, 'url(#tb-ringS)', `stroke="${edge}" stroke-width="2.5"`)}${f.ell(cu - kf * hr * 0.22, bv - kf * hr * 0.26, kf * hr * 0.28, kf * hr * 0.14, 'rgba(255,255,255,.85)')}${f.ell(cu, bv, kf * hr * 0.3, kf * hr * 0.3, 'none', 'stroke="rgba(71,85,105,.5)" stroke-width="1.5"')}</g>`;
    } else if (kind === 'trumpet') {
      g += f.ell(cu, bv, hr * 1.08, hr * 1.08, 'rgba(0,0,0,.2)', 'transform="translate(2 4)"');
      g += f.ell(cu, bv, hr * 1.04, hr * 1.04, 'url(#tb-ringS)', `stroke="#4b5563" stroke-width="3"`);
      g += f.ell(cu, bv, hr * 0.86, hr * 0.86, 'url(#tb-ring)', `stroke="${edge}" stroke-width="2"`);
      g += f.ell(cu, bv, hr * 0.64, hr * 0.64, 'url(#tb-pearl)', 'stroke="#8a7a68" stroke-width="2"');
      g += f.ell(cu - hr * 0.2, bv - hr * 0.22, hr * 0.2, hr * 0.12, 'rgba(255,255,255,.95)');
      g += `<g class="cap">${f.ell(cu, bv, hr * 1.0, hr * 1.0, 'rgba(50,25,0,.5)')}${f.ell(cu, bv, hr * 0.6, hr * 0.6, 'rgba(0,0,0,.28)', 'stroke="rgba(255,255,255,.3)" stroke-width="1.5"')}</g>`;
    } else {
      // sax: brass key cup with a pearl; covered = a leather pad
      g += f.ell(cu, bv, hr * 1.04, hr * 1.04, 'rgba(0,0,0,.2)', 'transform="translate(2 3)"');
      g += f.ell(cu, bv, hr, hr, 'url(#tb-ring)', `stroke="${edge}" stroke-width="3"`);
      g += f.ell(cu, bv, hr * 0.66, hr * 0.66, 'url(#tb-pearl)', 'stroke="#8a7a68" stroke-width="2"');
      g += f.ell(cu - hr * 0.2, bv - hr * 0.24, hr * 0.2, hr * 0.12, 'rgba(255,255,255,.95)');
      g += `<g class="cap">${f.ell(cu, bv, hr * 0.82, hr * 0.82, 'url(#tb-pad)', 'stroke="#fde68a" stroke-width="2"')}${f.ell(cu - hr * 0.22, bv - hr * 0.26, hr * 0.26, hr * 0.12, 'rgba(255,255,255,.5)')}</g>`;
    }
    art += zg(id, g, 'hole');
  }

  // mouthpiece touch target: a soft ring that says "blow here"
  const mu = U * 0.09;
  zones.push({ id: 'blow', shape: f.shapeEll(mu, vc, blowR, blowR), role: 'blow', voices: [] });
  art += zg(
    'blow',
    f.ell(mu, vc, blowR, blowR, 'rgba(255,255,255,.28)', 'stroke="#38bdf8" stroke-width="4.5" stroke-dasharray="10 8"') +
      f.ell(mu, vc, blowR * 0.22, blowR * 0.22, 'rgba(14,165,233,.55)'),
    'blow',
  );

  const scale5 = pentaFrom(flute ? 72 : 60, n + 1);
  const fingering = (cov: boolean[]): Voice => {
    if (kind === 'trumpet') {
      const down = (cov[1] ? 1 : 0) + (cov[0] ? 2 : 0) + (cov[2] ? 3 : 0);
      return note('trumpet', tune(72 - down, harmony), 0.9);
    }
    const c = cov.filter(Boolean).length;
    const m = scale5[n - c]!;
    return note(kind, tune(m, harmony), 0.9);
  };
  void defs;
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
