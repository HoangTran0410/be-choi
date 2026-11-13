import { majorFrom, tune } from './scale';
import { lg, type Stop } from './art';
import { Frame, linGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { inst, note } from './voices';

const WHITE = majorFrom(60, 8); // C4 … C5
/** Black key after white key i (between i and i+1), as MIDI. */
const BLACK: Array<[number, number]> = [
  [0, 61],
  [1, 63],
  [3, 66],
  [4, 68],
  [5, 70],
];

/**
 * Piano and organ: eight white keys (C4–C5) with the five black keys between them.
 * Landscape lays the keys left to right; portrait turns the keyboard on its side
 * (low at the bottom, high at the top) so each white key is still a fat target.
 * In pentatonic mode the black keys and F and B are snapped to a neighbour, and
 * drawn faded, so nothing can sound out of tune.
 */
export function layoutKeyboard(kind: 'piano' | 'organ', w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const f = new Frame(w, h, portrait, true);
  const pad = Math.max(6, Math.min(w, h) * 0.025);
  // The organ has a pipe panel above (landscape) / beside (portrait) the keys.
  const panel = kind === 'organ' ? 0.3 : 0.1;
  const v0 = pad + f.V * panel;
  const keyLen = f.V - v0 - pad;
  const u0 = pad;
  const kw = (f.U - pad * 2) / 8;
  const voiceOf = (m: number) => (kind === 'piano' ? note('piano', tune(m, harmony), 1) : inst('organ', tune(m, harmony), 0.8));

  const zones: Zone[] = [];
  let art = '';
  // gradients: `lenG` runs along a key (back → front), `widG` across the keyboard
  const gx = portrait ? 1 : 0;
  const gy = portrait ? 0 : 1;
  const lenG = (id: string, s: Stop[]) => lg(id, s, 0, 0, gx, gy);
  const widG = (id: string, s: Stop[]) => lg(id, s, 0, 0, gy, gx);
  const defs =
    lenG('kb-w', [
      [0, '#cfcac0'],
      [0.06, '#f4f1ea'],
      [0.5, '#fffdf8'],
      [0.88, '#f1ede4'],
      [1, '#d8d3c8'],
    ]) +
    lenG('kb-w-dim', [
      [0, '#a3a3a8'],
      [1, '#d4d4d8'],
    ]) +
    lenG('kb-lip', [
      [0, '#e9e5da'],
      [0.4, '#c9c4b8'],
      [1, '#9c978b'],
    ]) +
    widG('kb-b-body', [
      [0, '#000'],
      [0.25, '#2d2d33'],
      [0.5, '#3a3a42'],
      [0.75, '#222226'],
      [1, '#000'],
    ]) +
    lenG('kb-b-top', [
      [0, '#4a4a52'],
      [0.7, '#202024'],
      [1, '#0e0e10'],
    ]) +
    lenG('kb-b-bevel', [
      [0, '#52525b'],
      [0.45, '#18181b'],
      [1, '#050506'],
    ]) +
    lenG('kb-case', [
      [0, '#3a312c'],
      [0.5, '#171210'],
      [1, '#0a0807'],
    ]) +
    lenG('kb-felt', [
      [0, '#b91c1c'],
      [1, '#7f1d1d'],
    ]) +
    linGrad('kb-wood', '#c2761d', '#6b3410') +
    widG('kb-pipe', [
      [0, '#6b7280'],
      [0.2, '#f8fafc'],
      [0.45, '#b6bcc6'],
      [0.75, '#f1f5f9'],
      [1, '#6b7280'],
    ]);

  // Case
  art += rect(0, 0, w, h, 0, kind === 'piano' ? 'url(#kb-case)' : 'url(#kb-wood)');
  if (kind === 'organ') {
    // pipes: tall, shorter toward the high end
    const n = 8;
    for (let i = 0; i < n; i++) {
      const pl = f.V * panel * (0.9 - i * 0.07);
      const pw = (f.U - pad * 2) / n;
      art += f.rect(u0 + i * pw + pw * 0.15 + 2, pad + 3, pw * 0.7, pl, pw * 0.2, 'rgba(0,0,0,.25)');
      art += f.rect(u0 + i * pw + pw * 0.15, pad, pw * 0.7, pl, pw * 0.2, 'url(#kb-pipe)', 'stroke="#6b7280" stroke-width="1.5"');
      art += f.ell(u0 + i * pw + pw * 0.5, pad + pl * 0.82, pw * 0.2, pl * 0.1, '#1c1917');
      art += f.ell(u0 + i * pw + pw * 0.5, pad + pl * 0.82, pw * 0.2, pl * 0.1, 'none', 'stroke="#9ca3af" stroke-width="1"');
    }
  } else {
    // the fallboard with a red felt strip, and a gloss line
    art += f.rect(u0, pad, f.U - pad * 2, f.V * panel - 2, 6, '#1d1815', 'stroke="#000" stroke-opacity=".5" stroke-width="1.5"');
    art += f.rect(u0 + 6, pad + 4, f.U - pad * 2 - 12, 3, 2, 'rgba(255,255,255,.14)');
    art += f.rect(u0, v0 - 7, f.U - pad * 2, 7, 1, 'url(#kb-felt)');
    art += f.rect(u0 + f.U * 0.4, pad + f.V * panel * 0.45, f.U * 0.2 - pad, 2, 1, 'rgba(212,175,55,.6)');
  }

  const kd = Math.min(8, kw * 0.12);
  WHITE.forEach((m, i) => {
    const dim = harmony === 'pentatonic' && tune(m, harmony) !== m;
    const sh = f.shapeRect(u0 + i * kw, v0, kw, keyLen);
    zones.push({ id: `k${m}`, shape: sh, role: 'play', voices: [voiceOf(m)], dim });
    const ku = u0 + i * kw + 1.5;
    const kww = kw - 3;
    // the key: square at the back, rounded at the front
    const body = f.d([
      ['M', ku, v0],
      ['L', ku + kww, v0],
      ['L', ku + kww, v0 + keyLen - kd],
      ['Q', ku + kww, v0 + keyLen, ku + kww - kd, v0 + keyLen],
      ['L', ku + kd, v0 + keyLen],
      ['Q', ku, v0 + keyLen, ku, v0 + keyLen - kd],
      ['Z'],
    ]);
    art += zg(
      `k${m}`,
      `<path d="${body}" fill="${dim ? 'url(#kb-w-dim)' : 'url(#kb-w)'}" stroke="#8a857a" stroke-width="1.2"/>` +
        f.rect(ku, v0 + keyLen * 0.93, kww, keyLen * 0.07, 3, 'url(#kb-lip)') +
        f.rect(ku + 2, v0 + 2, 2.5, keyLen * 0.9, 1, 'rgba(255,255,255,.9)') +
        f.rect(ku + kww - 4.5, v0 + 2, 3, keyLen * 0.9, 1, 'rgba(0,0,0,.07)'),
    );
  });
  // Black keys are drawn and tested first so they win over the white key under them.
  const blackZones: Zone[] = [];
  BLACK.forEach(([after, m]) => {
    const bw = kw * 0.62;
    const bl = keyLen * 0.6;
    const cu = u0 + (after + 1) * kw;
    const dim = harmony === 'pentatonic';
    blackZones.push({
      id: `k${m}`,
      shape: f.shapeRect(cu - bw / 2, v0, bw, bl),
      role: 'play',
      voices: [voiceOf(m)],
      small: true,
      dim,
    });
    const bu = cu - bw / 2;
    art += zg(
      `k${m}`,
      f.rect(bu + 2.5, v0 + 4, bw, bl, Math.min(7, bw * 0.18), 'rgba(0,0,0,.28)') + // shadow on the white keys
        f.rect(bu, v0, bw, bl, Math.min(7, bw * 0.18), dim ? '#71717a' : 'url(#kb-b-body)', 'stroke="#000" stroke-width="1.2"') +
        (dim
          ? ''
          : f.rect(bu + bw * 0.14, v0 + 2, bw * 0.72, bl * 0.74, Math.min(5, bw * 0.12), 'url(#kb-b-top)') +
            f.rect(bu + bw * 0.1, v0 + bl * 0.78, bw * 0.8, bl * 0.2, Math.min(5, bw * 0.12), 'url(#kb-b-bevel)') +
            f.rect(bu + bw * 0.2, v0 + 5, bw * 0.12, bl * 0.62, 2, 'rgba(255,255,255,.2)')),
    );
  });

  return {
    kind,
    family: 'keyboard',
    w,
    h,
    portrait,
    harmony,
    zones: [...blackZones, ...zones],
    svg: wrap(w, h, defs, art, kind === 'piano' ? 'Đàn piano' : 'Đàn organ'),
    glide: true,
  };
}

export { shade };
