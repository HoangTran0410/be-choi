import { majorFrom, pentaFrom, tune } from './scale';
import { ell, Frame, line, linGrad, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { inst, note, RAINBOW } from './voices';

type BarKind = 'xylo' | 'bell' | 'marimba' | 'vibraphone';

const STYLE: Record<BarKind, { name: string; tubes: boolean; bg: string; color: (i: number) => string }> = {
  xylo: { name: 'Đàn xylophone', tubes: false, bg: '#fde68a', color: (i) => RAINBOW[i % 8]! },
  bell: {
    name: 'Đàn glockenspiel',
    tubes: false,
    bg: '#bfdbfe',
    color: (i) => ['#e0f2fe', '#dbeafe', '#e0e7ff', '#ede9fe', '#fae8ff', '#fce7f3', '#ffe4e6', '#fef9c3'][i]!,
  },
  marimba: { name: 'Đàn marimba', tubes: true, bg: '#fed7aa', color: (i) => shade('#7c2d12', i * 0.07) },
  vibraphone: { name: 'Đàn vibraphone', tubes: true, bg: '#c7d2fe', color: (i) => shade('#94a3b8', i * 0.05 - 0.1) },
};

/**
 * Xylophone, glockenspiel, marimba, vibraphone: eight bars from C4 to C5, long for
 * low and short for high. Marimba and vibraphone hang a resonator tube under every
 * bar. Portrait turns it on its side (high at the top) so each bar is a fat row.
 */
export function layoutBars(kind: BarKind, w: number, h: number, harmony: Harmony): Board {
  const st = STYLE[kind];
  const portrait = h > w;
  const f = new Frame(w, h, portrait, true);
  const notes = majorFrom(60, 8);
  const pad = 4;
  const sw = (f.U - pad * 2) / 8;
  const barArea = (f.V - pad * 2) * (st.tubes ? 0.62 : 1);
  const vc = pad + barArea / 2;
  const voiceOf = (m: number) => {
    const t = tune(m, harmony);
    return kind === 'xylo' ? note('xylo', t, 0.9) : kind === 'bell' ? note('bell', t, 0.9) : inst(kind, t);
  };
  const defs = linGrad('bar-gl', 'rgba(255,255,255,.55)', 'rgba(255,255,255,0)');
  let art = rect(0, 0, w, h, 0, st.bg);
  const railA = vc - barArea * 0.3;
  const railB = vc + barArea * 0.3;
  const frameCol = kind === 'bell' || kind === 'vibraphone' ? '#475569' : '#78350f';
  art += f.rect(pad, railA - 5, f.U - pad * 2, 10, 5, frameCol);
  art += f.rect(pad, railB - 5, f.U - pad * 2, 10, 5, frameCol);
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const len = barArea * (0.98 - i * 0.075);
    const bt = sw * 0.88;
    const u = pad + i * sw + (sw - bt) / 2;
    const col = st.color(i);
    const dim = harmony === 'pentatonic' && tune(m, harmony) !== m;
    if (st.tubes) {
      const tl = (f.V - pad * 2) * 0.34 * (0.98 - i * 0.085);
      const tv = pad + barArea + 4;
      art += f.rect(
        u + bt * 0.1,
        tv,
        bt * 0.8,
        tl,
        bt * 0.25,
        kind === 'marimba' ? '#a16207' : '#94a3b8',
        'stroke="rgba(0,0,0,.25)" stroke-width="1.5"',
      );
      art += f.rect(u + bt * 0.28, tv + 4, bt * 0.14, tl - 10, 3, 'rgba(255,255,255,.35)');
      art += f.ell(u + bt / 2, tv + tl, bt * 0.4, bt * 0.12, 'rgba(0,0,0,.35)');
    }
    const v = vc - len / 2;
    zones.push({ id: `b${m}`, shape: f.shapeRect(pad + i * sw, v, sw, len), role: 'play', voices: [voiceOf(m)], dim });
    art += zg(
      `b${m}`,
      f.rect(u, v, bt, len, bt * 0.28, col, `stroke="${shade(col, -0.35)}" stroke-width="2" ${dim ? 'opacity=".55"' : ''}`) +
        f.rect(u + bt * 0.14, v + 5, bt * 0.2, len - 10, 4, 'url(#bar-gl)') +
        f.ell(u + bt / 2, railA, bt * 0.07, bt * 0.07, 'rgba(0,0,0,.4)') +
        f.ell(u + bt / 2, railB, bt * 0.07, bt * 0.07, 'rgba(0,0,0,.4)'),
    );
  });
  return { kind, family: 'bars', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, st.name), glide: true };
}

/**
 * Kalimba: a wooden box with metal tines of different lengths, long for low and
 * short for high, fanned out from a bridge. Always upright. Tines are pentatonic.
 */
export function layoutTines(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const n = portrait ? 5 : 7;
  const notes = pentaFrom(72, n);
  const pad = 4;
  const sw = (w - pad * 2) / n;
  const boxTop = h * 0.66;
  const defs = linGrad('kal-wood', '#d97706', '#92400e');
  let art = rect(0, 0, w, h, 0, '#fef3c7');
  art += rect(pad, boxTop, w - pad * 2, h - boxTop - pad, 28, 'url(#kal-wood)', 'stroke="#78350f" stroke-width="3"');
  art += ell(w / 2, boxTop + (h - boxTop) * 0.55, Math.min(w, h) * 0.1, Math.min(w, h) * 0.1, '#3b1d08');
  art += rect(pad + 8, boxTop - 6, w - pad * 2 - 16, 14, 7, '#44403c');
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const len = (boxTop - 6 - pad) * (0.98 - (i / (n - 1)) * 0.42);
    const cx = pad + i * sw + sw / 2;
    const t = tune(m, harmony);
    zones.push({
      id: `t${m}`,
      shape: { t: 'rect', x: pad + i * sw, y: boxTop - 6 - len, w: sw, h: len + 12 },
      role: 'play',
      voices: [inst('kalimba', t)],
    });
    art += zg(
      `t${m}`,
      rect(cx - sw * 0.2, boxTop - 6 - len, sw * 0.4, len + 8, sw * 0.14, '#cbd5e1', 'stroke="#64748b" stroke-width="2"') +
        rect(cx - sw * 0.2 + 3, boxTop - 6 - len + 6, sw * 0.1, len - 6, 3, 'rgba(255,255,255,.7)') +
        ell(cx, boxTop - 6 - len + sw * 0.12, sw * 0.12, sw * 0.06, '#94a3b8'),
    );
  });
  return { kind: 'kalimba', family: 'tines', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Đàn kalimba'), glide: true };
}

/** Wind chimes: metal tubes hanging from a bar, long for low and short for high; hold one to still it. */
export function layoutChimes(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const n = portrait ? 5 : 8;
  const notes = pentaFrom(72, n);
  const pad = 4;
  const sw = (w - pad * 2) / n;
  let art = rect(0, 0, w, h, 0, '#e0f2fe');
  art += rect(pad, 8, w - pad * 2, 16, 8, '#92400e');
  art += line(w / 2, 24, w / 2, 56, '#78350f', 3);
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const cx = pad + i * sw + sw / 2;
    const len = (h - 70) * (0.98 - (i / (n - 1)) * 0.5);
    const top = 44;
    art += line(cx, 24, cx, top, '#78350f', 2.5);
    const tw = Math.min(sw * 0.5, 44);
    zones.push({
      id: `c${m}`,
      shape: { t: 'rect', x: pad + i * sw, y: top - 4, w: sw, h: len + 8 },
      role: 'play',
      voices: [inst('chimes', tune(m, harmony))],
      mute: true,
    });
    art += zg(
      `c${m}`,
      rect(cx - tw / 2, top, tw, len, tw * 0.3, i % 2 ? '#cbd5e1' : '#94a3b8', 'stroke="#475569" stroke-width="2"') +
        rect(cx - tw / 2 + 5, top + 8, tw * 0.22, len - 16, 4, 'rgba(255,255,255,.6)') +
        ell(cx, top + len, tw * 0.5, tw * 0.14, 'rgba(0,0,0,.35)'),
    );
  });
  art += ell(w / 2, h - 12, w * 0.3, 6, 'rgba(0,0,0,.08)');
  return { kind: 'chimes', family: 'chimes', w, h, portrait, harmony, zones, svg: wrap(w, h, '', art, 'Chuông gió'), glide: true };
}
