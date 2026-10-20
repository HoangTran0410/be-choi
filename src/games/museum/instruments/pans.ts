import { majorFrom, pentaFrom, tune } from './scale';
import { ell, line, radGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { inst, instHz } from './voices';

type PanKind = 'steelpan' | 'handpan';

/**
 * Steel drum and handpan, seen from above: a hollow dish with note fields hammered
 * into it — one in the middle and a ring of six around, rising clockwise. Touch
 * a field and it lights up. Steel pan is bright silver-blue, handpan warm bronze.
 */
export function layoutPan(kind: PanKind, w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 6;
  const steel = kind === 'steelpan';
  const ring = kind === 'steelpan' && harmony === 'free' ? majorFrom(60, 6) : pentaFrom(steel ? 60 : 62, 6);
  const centerNote = kind === 'steelpan' ? (harmony === 'free' ? 71 : 74) : 60;
  const defs =
    radGrad('pan-dish', steel ? '#cbd5e1' : '#fcd34d', steel ? '#475569' : '#a16207') +
    radGrad('pan-pad', steel ? '#f1f5f9' : '#fef3c7', steel ? '#94a3b8' : '#d97706');
  let art = rect(0, 0, w, h, 0, steel ? '#e0f2fe' : '#fef3c7');
  art += ell(cx, cy + R * 0.06, R * 1.02, R * 1.02, 'rgba(0,0,0,.12)');
  art += ell(cx, cy, R, R, 'url(#pan-dish)', `stroke="${steel ? '#1e293b' : '#713f12'}" stroke-width="5"`);
  art += ell(cx, cy, R * 0.94, R * 0.94, 'none', 'stroke="rgba(255,255,255,.45)" stroke-width="3"');
  if (!steel)
    for (let i = 0; i < 12; i++)
      art += ell(
        cx + Math.cos((i * Math.PI) / 6) * R * 0.9,
        cy + Math.sin((i * Math.PI) / 6) * R * 0.9,
        R * 0.025,
        R * 0.025,
        'rgba(60,30,0,.4)',
      );
  const zones: Zone[] = [];
  const padStroke = `stroke="${steel ? '#334155' : '#78350f'}" stroke-width="3.5"`;
  zones.push({
    id: `n${centerNote}`,
    shape: { t: 'ell', cx, cy, rx: R * 0.27, ry: R * 0.27 },
    role: 'play',
    voices: [inst(kind, tune(centerNote, harmony))],
  });
  art += zg(
    `n${centerNote}`,
    ell(cx, cy, R * 0.27, R * 0.27, 'url(#pan-pad)', padStroke) +
      ell(cx - R * 0.07, cy - R * 0.08, R * 0.08, R * 0.05, 'rgba(255,255,255,.7)'),
  );
  ring.forEach((m, j) => {
    const a = ((210 + 60 * j) * Math.PI) / 180;
    const px = cx + Math.cos(a) * R * 0.66;
    const py = cy + Math.sin(a) * R * 0.66;
    zones.push({
      id: `n${m}`,
      shape: { t: 'ell', cx: px, cy: py, rx: R * 0.27, ry: R * 0.26 },
      role: 'play',
      voices: [inst(kind, tune(m, harmony))],
    });
    art += zg(
      `n${m}`,
      ell(px, py, R * 0.27, R * 0.26, 'url(#pan-pad)', padStroke) +
        ell(px - R * 0.07, py - R * 0.07, R * 0.08, R * 0.045, 'rgba(255,255,255,.7)'),
    );
  });
  void shade;
  return {
    kind,
    family: 'pan',
    w,
    h,
    portrait,
    harmony,
    zones,
    svg: wrap(w, h, defs, art, steel ? 'Trống thép' : 'Trống handpan'),
    glide: true,
  };
}

/**
 * A gong hanging in a frame. Strike the boss in the middle for a deep, booming
 * note, the rim for a lower, softer wash. Rest a finger on it afterwards to damp it.
 */
export function layoutGong(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const cx = w / 2;
  const R = Math.min(w * 0.46, h * 0.43);
  const cy = h * 0.52;
  const defs = radGrad('gg-disc', '#fde68a', '#92400e') + radGrad('gg-boss', '#fef9c3', '#b45309');
  let art = rect(0, 0, w, h, 0, '#fde8e8');
  // frame
  art += rect(cx - R - 18, 10, 14, h - 24, 7, '#7c2d12');
  art += rect(cx + R + 4, 10, 14, h - 24, 7, '#7c2d12');
  art += rect(cx - R - 18, 6, R * 2 + 36, 16, 8, '#9a3412');
  art += line(cx - R * 0.5, 22, cx - R * 0.35, cy - R * 0.9, '#78350f', 4);
  art += line(cx + R * 0.5, 22, cx + R * 0.35, cy - R * 0.9, '#78350f', 4);
  const zones: Zone[] = [];
  zones.push({
    id: 'gong:boss',
    shape: { t: 'ell', cx, cy, rx: R * 0.42, ry: R * 0.42 },
    role: 'play',
    voices: [instHz('gong', 147)],
    mute: true,
  });
  zones.push({
    id: 'gong:rim',
    shape: { t: 'ell', cx, cy, rx: R, ry: R },
    role: 'play',
    voices: [instHz('gong', 110)],
    mute: true,
    small: false,
  });
  art += zg(
    'gong:rim',
    ell(cx, cy, R, R, 'url(#gg-disc)', 'stroke="#78350f" stroke-width="6"') +
      ell(cx, cy, R * 0.82, R * 0.82, 'none', 'stroke="rgba(120,53,15,.35)" stroke-width="3"') +
      ell(cx, cy, R * 0.64, R * 0.64, 'none', 'stroke="rgba(120,53,15,.25)" stroke-width="3"'),
  );
  art += zg(
    'gong:boss',
    ell(cx, cy, R * 0.42, R * 0.42, 'url(#gg-boss)', 'stroke="#92400e" stroke-width="4"') +
      ell(cx - R * 0.12, cy - R * 0.14, R * 0.12, R * 0.07, 'rgba(255,255,255,.7)'),
  );
  return {
    kind: 'gong',
    family: 'gong',
    w,
    h,
    portrait,
    harmony,
    zones: [zones[0]!, zones[1]!],
    svg: wrap(w, h, defs, art, 'Cồng chiêng'),
    glide: false,
  };
}
