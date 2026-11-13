import { majorFrom, pentaFrom, tune } from './scale';
import { lg, rnd, type Stop } from './art';
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
  marimba: { name: 'Đàn marimba', tubes: true, bg: '#fed7aa', color: (i) => shade('#7c2d12', i * 0.035) },
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
  const metal = kind === 'bell' || kind === 'vibraphone';
  const gu = portrait ? [0, 0, 0, 1] : [0, 0, 1, 0]; // gradient along the keyboard (across one bar)
  const alongU = (id: string, stops: Stop[]) => lg(id, stops, gu[0], gu[1], gu[2], gu[3]);
  let defs =
    linGrad('bar-gl', 'rgba(255,255,255,.55)', 'rgba(255,255,255,0)') +
    lg('bar-bg', [[0, shade(st.bg, 0.4)], [1, st.bg]]) +
    alongU('bar-rail', metal
      ? [[0, '#64748b'], [0.25, '#e2e8f0'], [0.5, '#94a3b8'], [0.8, '#cbd5e1'], [1, '#475569']]
      : [[0, '#6b3410'], [0.3, '#c0782a'], [0.55, '#8f4f16'], [1, '#4a2308']]) +
    alongU('bar-tube', kind === 'marimba'
      ? [[0, '#5a3108'], [0.22, '#e9b25a'], [0.45, '#b9772a'], [0.8, '#8a521a'], [1, '#4a2806']]
      : [[0, '#64748b'], [0.2, '#f8fafc'], [0.45, '#b6bec9'], [0.8, '#8a94a3'], [1, '#475569']]);
  let art = rect(0, 0, w, h, 0, 'url(#bar-bg)');
  const railA = vc - barArea * 0.3;
  const railB = vc + barArea * 0.3;
  art += f.rect(pad + 3, railA - 4, f.U - pad * 2, 12, 6, 'rgba(0,0,0,.16)');
  art += f.rect(pad + 3, railB - 4, f.U - pad * 2, 12, 6, 'rgba(0,0,0,.16)');
  art += f.rect(pad, railA - 5, f.U - pad * 2, 10, 5, 'url(#bar-rail)', 'stroke="rgba(0,0,0,.3)" stroke-width="1.2"');
  art += f.rect(pad, railB - 5, f.U - pad * 2, 10, 5, 'url(#bar-rail)', 'stroke="rgba(0,0,0,.3)" stroke-width="1.2"');
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const len = barArea * (0.98 - i * 0.075);
    const bt = sw * 0.88;
    const u = pad + i * sw + (sw - bt) / 2;
    const col = st.color(i);
    const dim = harmony === 'pentatonic' && tune(m, harmony) !== m;
    defs += alongU(`bar-c${i}`, metal
      ? [[0, shade(col, -0.3)], [0.2, shade(col, 0.35)], [0.45, col], [0.7, shade(col, -0.08)], [1, shade(col, -0.35)]]
      : [[0, shade(col, -0.32)], [0.16, shade(col, 0.05)], [0.34, shade(col, 0.32)], [0.6, col], [1, shade(col, -0.36)]]);
    if (st.tubes) {
      const tl = (f.V - pad * 2) * 0.34 * (0.98 - i * 0.085);
      const tv = pad + barArea + 4;
      art += f.rect(u + bt * 0.1 + 3, tv + 3, bt * 0.8, tl, bt * 0.25, 'rgba(0,0,0,.18)');
      art += f.rect(u + bt * 0.1, tv, bt * 0.8, tl, bt * 0.25, 'url(#bar-tube)', 'stroke="rgba(0,0,0,.3)" stroke-width="1.2"');
      art += f.ell(u + bt / 2, tv + tl - 1, bt * 0.38, bt * 0.11, '#1c1208', 'stroke="rgba(255,255,255,.3)" stroke-width="1.4"');
    }
    const v = vc - len / 2;
    zones.push({ id: `b${m}`, shape: f.shapeRect(pad + i * sw, v, sw, len), role: 'play', voices: [voiceOf(m)], dim });
    let grain = '';
    if (!metal && kind === 'marimba')
      for (let k = 1; k < 6; k++) grain += f.line(u + (bt * k) / 6, v + 6, u + (bt * k) / 6 + (rnd(i * 7 + k) - 0.5) * 3, v + len - 6, 'rgba(255,220,170,.14)', 1.2);
    if (metal) for (let k = 1; k < 9; k++) grain += f.line(u + 5, v + (len * k) / 9, u + bt - 5, v + (len * k) / 9, 'rgba(255,255,255,.08)', 1);
    art += zg(
      `b${m}`,
      f.rect(u + 2, v + 4, bt, len, bt * 0.22, 'rgba(0,0,0,.2)') +
        f.rect(u, v, bt, len, bt * 0.22, `url(#bar-c${i})`, `stroke="${shade(col, -0.45)}" stroke-width="1.8" ${dim ? 'opacity=".55"' : ''}`) +
        grain +
        f.rect(u + bt * 0.12, v + 4, bt * 0.18, len - 8, 4, 'url(#bar-gl)') +
        f.rect(u + 3, v + len - 7, bt - 6, 3, 1.5, 'rgba(0,0,0,.18)') +
        f.ell(u + bt / 2, railA, bt * 0.07, bt * 0.07, 'rgba(0,0,0,.55)', 'stroke="rgba(255,255,255,.3)" stroke-width="1"') +
        f.ell(u + bt / 2, railB, bt * 0.07, bt * 0.07, 'rgba(0,0,0,.55)', 'stroke="rgba(255,255,255,.3)" stroke-width="1"'),
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

/** Wind chimes: metal tubes hanging from a wooden ring, long for low and short for high; hold one to still it. */
export function layoutChimes(w: number, h: number, harmony: Harmony): Board {
  const portrait = h > w;
  const n = portrait ? 5 : 8;
  const notes = pentaFrom(72, n);
  const pad = 4;
  const sw = (w - pad * 2) / n;
  const defs =
    lg('ch-bg', [[0, '#f0f9ff'], [1, '#bae6fd']]) +
    lg('ch-wood', [[0, '#e0954a'], [0.35, '#b9651f'], [1, '#5c2a08']], 0, 0, 0, 1) +
    lg('ch-cord', [[0, '#4a2f12'], [0.5, '#d9b27a'], [1, '#4a2f12']], 0, 0, 1, 0) +
    lg('ch-tubeA', [[0, '#52607a'], [0.18, '#dbe3ee'], [0.34, '#ffffff'], [0.55, '#9aa7ba'], [0.85, '#d1d8e3'], [1, '#475569']], 0, 0, 1, 0) +
    lg('ch-tubeB', [[0, '#6b4a1e'], [0.18, '#f3d58a'], [0.34, '#fff4c6'], [0.55, '#c98d12'], [0.85, '#e7b43a'], [1, '#5a3a0a']], 0, 0, 1, 0);
  let art = rect(0, 0, w, h, 0, 'url(#ch-bg)');
  // wooden suspension bar with grain, a hook to hang it from
  art += rect(pad, 8, w - pad * 2, 18, 9, 'url(#ch-wood)', 'stroke="#3d1a06" stroke-width="2.5"');
  for (let k = 0; k < 5; k++) art += line(pad + 12, 12 + k * 3, w - pad - 12, 12 + k * 3 + (k % 2 ? 1 : -1), k % 2 ? 'rgba(255,225,170,.25)' : 'rgba(60,25,4,.25)', 1.2);
  art += line(w / 2, 4, w / 2, -4, '#78350f', 3);
  art += `<path d="M${(w / 2 - 14).toFixed(1)} 22 L${(w / 2).toFixed(1)} 2 L${(w / 2 + 14).toFixed(1)} 22" fill="none" stroke="#3b2410" stroke-width="3.5" stroke-linecap="round"/>`;
  const zones: Zone[] = [];
  notes.forEach((m, i) => {
    const cx = pad + i * sw + sw / 2;
    const len = (h - 70) * (0.98 - (i / (n - 1)) * 0.5);
    const top = 50;
    const tw = Math.min(sw * 0.5, 44);
    zones.push({
      id: `c${m}`,
      shape: { t: 'rect', x: pad + i * sw, y: top - 4, w: sw, h: len + 8 },
      role: 'play',
      voices: [inst('chimes', tune(m, harmony))],
      mute: true,
    });
    const gold = i % 2 === 1;
    art += line(cx, 26, cx, top + 10, '#3b2410', 3.6) + line(cx, 26, cx, top + 10, 'url(#ch-cord)', 1.8);
    art += zg(
      `c${m}`,
      // the tube: shaded cylinder with a dark brass plug at the top, a threaded eye, and a hollow mouth below
      rect(cx - tw / 2 + 3, top + 3, tw, len, tw * 0.22, 'rgba(0,0,0,.14)') +
        rect(cx - tw / 2, top, tw, len, tw * 0.22, `url(#${gold ? 'ch-tubeB' : 'ch-tubeA'})`, `stroke="${gold ? '#6b4a0e' : '#475569'}" stroke-width="2"`) +
        rect(cx - tw / 2, top + 4, tw, tw * 0.28, tw * 0.1, gold ? '#8a5a0b' : '#64748b') +
        rect(cx - tw / 2 + 2, top + 5, tw - 4, 2, 1, 'rgba(255,255,255,.55)') +
        ell(cx, top + 14, 3.2, 3.2, '#1c1208', 'stroke="rgba(255,255,255,.5)" stroke-width="1.2"') +
        rect(cx - tw / 2, top + len * 0.5, tw, 2.5, 1, 'rgba(0,0,0,.15)') +
        ell(cx, top + len, tw * 0.5, tw * 0.13, '#0f172a', `stroke="${gold ? '#f3d58a' : '#e2e8f0'}" stroke-width="1.8"`),
    );
  });
  art += ell(w / 2, h - 12, w * 0.3, 6, 'rgba(0,0,0,.08)');
  return { kind: 'chimes', family: 'chimes', w, h, portrait, harmony, zones, svg: wrap(w, h, defs, art, 'Chuông gió'), glide: true };
}
