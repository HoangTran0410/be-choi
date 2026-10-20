import { majorFrom, tune } from './scale';
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
  const defs = linGrad('kb-w', '#ffffff', '#e5e7eb') + linGrad('kb-b', '#3f3f46', '#09090b') + linGrad('kb-wood', '#b45309', '#78350f');

  // Case
  art += rect(0, 0, w, h, 0, kind === 'piano' ? '#1f1a17' : 'url(#kb-wood)');
  if (kind === 'organ') {
    // pipes: tall, shorter toward the high end
    const n = 8;
    for (let i = 0; i < n; i++) {
      const pl = f.V * panel * (0.9 - i * 0.07);
      const pw = (f.U - pad * 2) / n;
      art += f.rect(
        u0 + i * pw + pw * 0.15,
        pad,
        pw * 0.7,
        pl,
        pw * 0.2,
        i % 2 ? '#d6d3d1' : '#e7e5e4',
        'stroke="#a8a29e" stroke-width="2"',
      );
      art += f.ell(u0 + i * pw + pw * 0.5, pad + pl * 0.82, pw * 0.16, pl * 0.1, '#44403c');
    }
  } else {
    art += f.rect(u0, pad, f.U - pad * 2, f.V * panel - 2, 6, '#2b2420');
  }

  WHITE.forEach((m, i) => {
    const dim = harmony === 'pentatonic' && tune(m, harmony) !== m;
    const sh = f.shapeRect(u0 + i * kw, v0, kw, keyLen);
    zones.push({ id: `k${m}`, shape: sh, role: 'play', voices: [voiceOf(m)], dim });
    art += zg(
      `k${m}`,
      f.rect(
        u0 + i * kw + 1.5,
        v0,
        kw - 3,
        keyLen,
        Math.min(10, kw * 0.12),
        dim ? '#d4d4d8' : 'url(#kb-w)',
        'stroke="#a1a1aa" stroke-width="1.5"',
      ) + f.rect(u0 + i * kw + 3, v0 + keyLen * 0.88, kw - 6, keyLen * 0.08, 4, 'rgba(0,0,0,.07)'),
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
    art += zg(
      `k${m}`,
      f.rect(cu - bw / 2, v0, bw, bl, Math.min(8, bw * 0.2), dim ? '#71717a' : 'url(#kb-b)') +
        f.rect(cu - bw / 2 + bw * 0.15, v0 + 3, bw * 0.2, bl * 0.8, 3, 'rgba(255,255,255,.18)'),
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
