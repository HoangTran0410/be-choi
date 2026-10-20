import { ell, radGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { instHz } from './voices';

type ShakeKind = 'maracas' | 'tambourine' | 'castanets';

/**
 * Shakers. Tap one, or wave a finger back and forth across it (or shake the
 * device, where the browser allows) — every stroke is a shake. The tambourine has
 * a skin in the middle (a dull thump) and jingles round the rim.
 */
export function layoutShake(kind: ShakeKind, w: number, h: number, harmony: Harmony): Board {
  const zones: Zone[] = [];
  const defs =
    radGrad('sh-skin', '#fffbeb', '#fcd34d') + radGrad('sh-mar', '#fecaca', '#dc2626') + radGrad('sh-mar2', '#bfdbfe', '#2563eb');
  let art = rect(0, 0, w, h, 0, '#fef9c3');
  if (kind === 'maracas') {
    const mw = w * 0.5;
    const specs = [
      { id: 'maraca:left', cx: w * 0.25, fill: 'url(#sh-mar)', stroke: '#7f1d1d', hz: 400, tilt: -12 },
      { id: 'maraca:right', cx: w * 0.75, fill: 'url(#sh-mar2)', stroke: '#1e3a8a', hz: 520, tilt: 12 },
    ];
    for (const s of specs) {
      const headR = Math.min(mw * 0.4, h * 0.27);
      const hy = h * 0.34;
      zones.push({
        id: s.id,
        shape: { t: 'rect', x: s.cx - mw / 2 + 4, y: 4, w: mw - 8, h: h - 8 },
        role: 'shake',
        voices: [instHz('maracas', s.hz)],
      });
      art += zg(
        s.id,
        `<g transform="rotate(${s.tilt} ${s.cx} ${h * 0.5})">` +
          rect(
            s.cx - headR * 0.16,
            hy + headR * 0.7,
            headR * 0.32,
            h * 0.46,
            headR * 0.12,
            '#b45309',
            'stroke="#78350f" stroke-width="3"',
          ) +
          ell(s.cx, hy, headR * 0.82, headR, s.fill, `stroke="${s.stroke}" stroke-width="4"`) +
          ell(s.cx - headR * 0.25, hy - headR * 0.3, headR * 0.18, headR * 0.3, 'rgba(255,255,255,.6)') +
          [0, 1, 2, 3, 4]
            .map((i) =>
              ell(
                s.cx - headR * 0.4 + i * headR * 0.2,
                hy + Math.sin(i * 2) * headR * 0.3,
                headR * 0.06,
                headR * 0.06,
                'rgba(255,255,255,.75)',
              ),
            )
            .join('') +
          `</g>`,
      );
    }
  } else if (kind === 'tambourine') {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 8;
    zones.push({
      id: 'tamb:head',
      shape: { t: 'ell', cx, cy, rx: R * 0.5, ry: R * 0.5 },
      role: 'shake',
      voices: [instHz('tambourine', 300)],
    });
    zones.push({ id: 'tamb:rim', shape: { t: 'ell', cx, cy, rx: R, ry: R }, role: 'shake', voices: [instHz('tambourine', 620)] });
    art += zg('tamb:rim', ell(cx, cy, R, R, '#b45309', 'stroke="#78350f" stroke-width="5"'));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + 0.2;
      const jx = cx + Math.cos(a) * R * 0.78;
      const jy = cy + Math.sin(a) * R * 0.78;
      art += zg(
        'tamb:rim',
        ell(jx - 7, jy, R * 0.1, R * 0.1, '#e5e7eb', 'stroke="#64748b" stroke-width="2.5"') +
          ell(jx + 7, jy, R * 0.1, R * 0.1, '#f1f5f9', 'stroke="#64748b" stroke-width="2.5"'),
        'jingle',
      );
    }
    art += zg(
      'tamb:head',
      ell(cx, cy, R * 0.6, R * 0.6, 'url(#sh-skin)', 'stroke="#a16207" stroke-width="4"') +
        ell(cx - R * 0.15, cy - R * 0.18, R * 0.14, R * 0.08, 'rgba(255,255,255,.8)'),
    );
  } else {
    const specs = [
      { id: 'cast:left', cx: w * 0.27, hz: 1700, rot: -14 },
      { id: 'cast:right', cx: w * 0.73, hz: 2100, rot: 14 },
    ];
    const sw = w * 0.4;
    const shellH = Math.min(h * 0.62, sw * 1.1);
    for (const s of specs) {
      zones.push({
        id: s.id,
        shape: { t: 'rect', x: s.cx - w * 0.23, y: 4, w: w * 0.46, h: h - 8 },
        role: 'shake',
        voices: [instHz('castanets', s.hz)],
      });
      art += zg(
        s.id,
        `<g transform="rotate(${s.rot} ${s.cx} ${h * 0.5})">` +
          ell(s.cx, h * 0.5, sw / 2, shellH / 2, '#b91c1c', 'stroke="#450a0a" stroke-width="5"') +
          ell(s.cx, h * 0.5, sw * 0.34, shellH * 0.34, '#dc2626', `stroke="${shade('#b91c1c', -0.4)}" stroke-width="3"`) +
          ell(s.cx - sw * 0.12, h * 0.5 - shellH * 0.16, sw * 0.08, shellH * 0.06, 'rgba(255,255,255,.6)') +
          ell(s.cx, h * 0.5 - shellH * 0.5, 7, 7, '#fde68a') +
          `</g>`,
      );
    }
  }
  return {
    kind,
    family: 'shake',
    w,
    h,
    portrait: h > w,
    harmony,
    zones,
    svg: wrap(w, h, defs, art, kind === 'maracas' ? 'Maracas' : kind === 'tambourine' ? 'Trống lắc tay' : 'Phách castanet'),
    glide: false,
  };
}
