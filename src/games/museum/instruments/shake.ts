import { lg, rg, rnd } from './art';
import { SILVER } from './brass';
import { ell, line, rect, shade, wrap, zg } from './svg';
import type { Board, Harmony, Zone } from './types';
import { instHz } from './voices';

type ShakeKind = 'maracas' | 'tambourine' | 'castanets';

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** An egg-shaped outline: round on top, narrowing into a neck at the bottom (flip = -1: neck on top). */
function eggPath(cx: number, cy: number, R: number, Ry = R, flip = 1): string {
  const p = (x: number, y: number) => `${r1(cx + x * R)} ${r1(cy + y * Ry * flip)}`;
  return (
    `M${p(0, -1)} C${p(0.55, -1)} ${p(0.86, -0.55)} ${p(0.86, -0.05)} C${p(0.86, 0.5)} ${p(0.4, 0.85)} ${p(0.17, 0.97)}` +
    ` L${p(-0.17, 0.97)} C${p(-0.4, 0.85)} ${p(-0.86, 0.5)} ${p(-0.86, -0.05)} C${p(-0.86, -0.55)} ${p(-0.55, -1)} ${p(0, -1)} Z`
  );
}

/**
 * Shakers. Tap one, or wave a finger back and forth across it (or shake the
 * device, where the browser allows) - every stroke is a shake. The tambourine has
 * a skin in the middle (a dull thump) and jingles round the rim.
 */
export function layoutShake(kind: ShakeKind, w: number, h: number, harmony: Harmony): Board {
  const zones: Zone[] = [];
  let defs =
    lg('sh-bg', [[0, '#fffbe6'], [1, '#fde68a']]) +
    lg('sh-wood', [[0, '#7a3a0e'], [0.25, '#c8742a'], [0.45, '#e9a458'], [0.7, '#b45f1c'], [1, '#5c2a08']], 0, 0, 1, 0) +
    lg('sh-chrome', SILVER.map(([o, c]) => [o, c] as [number, string]), 0, 0, 1, 1);
  let art = rect(0, 0, w, h, 0, 'url(#sh-bg)');
  if (kind === 'maracas') {
    const mw = w * 0.5;
    const specs = [
      { id: 'maraca:left', cx: w * 0.25, hz: 400, tilt: -12, base: '#dc2626', hi: '#fecaca', dk: '#7f1d1d', band: '#fde047', n: 'l' },
      { id: 'maraca:right', cx: w * 0.75, hz: 520, tilt: 12, base: '#2563eb', hi: '#bfdbfe', dk: '#1e3a8a', band: '#fef08a', n: 'r' },
    ];
    for (const s of specs) {
      const headR = Math.min(mw * 0.4, h * 0.27);
      const hy = h * 0.34;
      const handleTop = hy + headR * 0.9;
      const handleLen = h * 0.46;
      const hw = headR * 0.3;
      defs +=
        rg(`mr-${s.n}`, [[0, s.hi], [0.3, shade(s.base, 0.25)], [0.7, s.base], [1, s.dk]], 0.5, 0.5, 0.75, 0.34, 0.28) +
        `<clipPath id="mr-clip-${s.n}"><path d="${eggPath(s.cx, hy, headR)}"/></clipPath>`;
      zones.push({
        id: s.id,
        shape: { t: 'rect', x: s.cx - mw / 2 + 4, y: 4, w: mw - 8, h: h - 8 },
        role: 'shake',
        voices: [instHz('maracas', s.hz)],
      });
      // handle: turned wood with lathe rings, a collar and a round knob
      let handle = '';
      handle += `<path d="M${r1(s.cx - hw * 0.5)} ${r1(handleTop - 4)} L${r1(s.cx + hw * 0.5)} ${r1(handleTop - 4)} L${r1(s.cx + hw * 0.62)} ${r1(handleTop + handleLen * 0.8)} L${r1(s.cx - hw * 0.62)} ${r1(handleTop + handleLen * 0.8)} Z" fill="url(#sh-wood)" stroke="#4a2008" stroke-width="2.5"/>`;
      for (const t of [0.12, 0.2, 0.55, 0.62]) {
        const y = handleTop + handleLen * t;
        handle += rect(s.cx - hw * 0.62, y, hw * 1.24, 4, 2, 'rgba(60,25,4,.55)') + rect(s.cx - hw * 0.62, y - 1.5, hw * 1.24, 1.5, 1, 'rgba(255,225,170,.5)');
      }
      handle += ell(s.cx, handleTop + handleLen * 0.88, hw * 0.95, handleLen * 0.12, 'url(#sh-wood)', 'stroke="#4a2008" stroke-width="2.5"');
      handle += ell(s.cx - hw * 0.25, handleTop + handleLen * 0.84, hw * 0.2, handleLen * 0.04, 'rgba(255,235,190,.6)');
      handle += rect(s.cx - headR * 0.3, handleTop - 10, headR * 0.6, 14, 6, 'url(#sh-wood)', 'stroke="#4a2008" stroke-width="2.5"');
      // painted head with a pattern band and a scatter of seeds in the shell
      let paint = '';
      const wave = (y0: number, amp: number, col: string, sw: number) => {
        let d = `M${r1(s.cx - headR)} ${r1(y0)}`;
        const seg = 8;
        for (let k = 0; k < seg; k++) {
          const x0 = s.cx - headR + (k * headR * 2) / seg;
          const x1 = s.cx - headR + ((k + 1) * headR * 2) / seg;
          d += ` Q${r1((x0 + x1) / 2)} ${r1(y0 + (k % 2 ? amp : -amp))} ${r1(x1)} ${r1(y0)}`;
        }
        return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
      };
      paint += wave(hy - headR * 0.32, headR * 0.12, s.band, headR * 0.1);
      paint += wave(hy + headR * 0.26, headR * 0.12, s.band, headR * 0.1);
      paint += rect(s.cx - headR, hy - headR * 0.06, headR * 2, headR * 0.12, 0, 'rgba(255,255,255,.55)');
      for (let k = 0; k < 9; k++) paint += ell(s.cx - headR * 0.8 + k * headR * 0.2, hy + headR * 0.03, headR * 0.035, headR * 0.035, s.dk, 'opacity=".75"');
      let seeds = '';
      for (let k = 0; k < 46; k++) {
        const ax = s.cx + (rnd(k * 3 + 1) - 0.5) * headR * 1.7;
        const ay = hy + (rnd(k * 3 + 2) - 0.5) * headR * 1.9;
        const rot = Math.round(rnd(k + 7) * 180);
        seeds += `<ellipse cx="${r1(ax)}" cy="${r1(ay)}" rx="${r1(headR * 0.042)}" ry="${r1(headR * 0.022)}" transform="rotate(${rot} ${r1(ax)} ${r1(ay)})" fill="${rnd(k) > 0.5 ? 'rgba(40,15,0,.35)' : 'rgba(255,255,255,.4)'}"/>`;
      }
      art += zg(
        s.id,
        `<g transform="rotate(${s.tilt} ${r1(s.cx)} ${r1(h * 0.5)})">` +
          handle +
          `<path d="${eggPath(s.cx + 3, hy + 5, headR)}" fill="rgba(0,0,0,.18)"/>` +
          `<path d="${eggPath(s.cx, hy, headR)}" fill="url(#mr-${s.n})" stroke="${s.dk}" stroke-width="3.5"/>` +
          `<g clip-path="url(#mr-clip-${s.n})">${paint}${seeds}` +
          // a gloss streak and a dark lower rim for roundness
          ell(s.cx - headR * 0.3, hy - headR * 0.42, headR * 0.16, headR * 0.34, 'rgba(255,255,255,.7)', `transform="rotate(25 ${r1(s.cx - headR * 0.3)} ${r1(hy - headR * 0.42)})"`) +
          ell(s.cx + headR * 0.32, hy + headR * 0.55, headR * 0.5, headR * 0.2, 'rgba(0,0,0,.16)') +
          `</g></g>`,
      );
    }
  } else if (kind === 'tambourine') {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 8;
    const skinR = R * 0.76;
    defs +=
      rg('tb-wood', [[0, '#e0a050'], [0.82, '#b9651f'], [0.9, '#8a4512'], [1, '#4a210a']], 0.42, 0.38, 0.75) +
      rg('tb-skin', [[0, '#fffdf3'], [0.55, '#fbeec6'], [0.9, '#e9d49a'], [1, '#c9a95a']], 0.4, 0.34, 0.75) +
      rg('tb-zil', [[0, '#ffffff'], [0.45, '#d3dae3'], [0.85, '#8b95a4'], [1, '#5b6472']], 0.36, 0.3, 0.8);
    zones.push({
      id: 'tamb:head',
      shape: { t: 'ell', cx, cy, rx: R * 0.5, ry: R * 0.5 },
      role: 'shake',
      voices: [instHz('tambourine', 300)],
    });
    zones.push({ id: 'tamb:rim', shape: { t: 'ell', cx, cy, rx: R, ry: R }, role: 'shake', voices: [instHz('tambourine', 620)] });
    // the wooden shell: grain rings, a thumb hole at the bottom and the slots the jingles hang in
    let rim = ell(cx + 2, cy + 5, R, R, 'rgba(0,0,0,.2)') + ell(cx, cy, R, R, 'url(#tb-wood)', 'stroke="#3d1a06" stroke-width="4"');
    for (let k = 0; k < 6; k++) rim += ell(cx, cy, R * (0.8 + k * 0.032), R * (0.8 + k * 0.032), 'none', `stroke="${k % 2 ? 'rgba(255,225,170,.22)' : 'rgba(60,25,4,.22)'}" stroke-width="1.4"`);
    rim += `<path d="M${r1(cx - R * 0.8)} ${r1(cy - R * 0.45)} A${r1(R * 0.92)} ${r1(R * 0.92)} 0 0 1 ${r1(cx + R * 0.1)} ${r1(cy - R * 0.92)}" fill="none" stroke="rgba(255,240,200,.45)" stroke-width="5" stroke-linecap="round"/>`;
    rim += ell(cx, cy + R * 0.88, R * 0.12, R * 0.045, '#1c0a02', 'stroke="#6b3410" stroke-width="2"');
    art += zg('tamb:rim', rim);
    const J = 7;
    for (let i = 0; i < J; i++) {
      const a = Math.PI / 2 + (Math.PI * 2 * (i + 0.5)) / J;
      const jr = R * 0.88;
      const jx = cx + Math.cos(a) * jr;
      const jy = cy + Math.sin(a) * jr;
      const zr = R * 0.088;
      // tangent direction (zils sit side by side along the rim)
      const tx = -Math.sin(a) * zr * 0.75;
      const ty = Math.cos(a) * zr * 0.75;
      const zil = (x: number, y: number, k: number) =>
        ell(x, y, zr, zr, 'url(#tb-zil)', 'stroke="#475569" stroke-width="2"') +
        ell(x, y, zr * 0.62, zr * 0.62, 'none', 'stroke="rgba(71,85,105,.45)" stroke-width="1.5"') +
        ell(x, y, zr * 0.18, zr * 0.18, '#1e293b') +
        ell(x - zr * 0.3, y - zr * 0.34, zr * 0.28, zr * 0.14, `rgba(255,255,255,${k ? 0.7 : 0.9})`);
      art += zg(
        'tamb:rim',
        `<g transform="rotate(${r1((a * 180) / Math.PI)} ${r1(jx)} ${r1(jy)})">${rect(jx - R * 0.06, jy - R * 0.02, R * 0.12, R * 0.04, 2, '#1c0a02')}</g>` +
          zil(jx - tx, jy - ty, 0) +
          zil(jx + tx, jy + ty, 1) +
          line(jx - tx * 1.7, jy - ty * 1.7, jx + tx * 1.7, jy + ty * 1.7, 'rgba(0,0,0,.18)', 1.4),
        'jingle',
      );
    }
    let tacks = '';
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      tacks += ell(cx + Math.cos(a) * skinR * 0.985, cy + Math.sin(a) * skinR * 0.985, 2.2, 2.2, 'url(#sh-chrome)', 'stroke="#64748b" stroke-width=".8"');
    }
    art += zg(
      'tamb:head',
      ell(cx, cy, skinR + 3, skinR + 3, 'rgba(0,0,0,.35)') +
        ell(cx, cy, skinR, skinR, 'url(#tb-skin)', 'stroke="#8a6a2c" stroke-width="3"') +
        ell(cx, cy, skinR * 0.9, skinR * 0.9, 'none', 'stroke="rgba(150,120,50,.28)" stroke-width="1.5"') +
        tacks +
        ell(cx - skinR * 0.3, cy - skinR * 0.36, skinR * 0.3, skinR * 0.12, 'rgba(255,255,255,.75)', `transform="rotate(-30 ${r1(cx - skinR * 0.3)} ${r1(cy - skinR * 0.36)})"`),
    );
  } else {
    const specs = [
      { id: 'cast:left', cx: w * 0.27, hz: 1700, rot: -14, c0: '#e7893a', c1: '#a8501a', c2: '#4a1a06', n: 'l' },
      { id: 'cast:right', cx: w * 0.73, hz: 2100, rot: 14, c0: '#d9742e', c1: '#97441a', c2: '#3d1405', n: 'r' },
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
      defs +=
        rg(`ct-${s.n}`, [[0, s.c0], [0.55, s.c1], [1, s.c2]], 0.4, 0.36, 0.78) +
        rg(`ct-in-${s.n}`, [[0, shade(s.c2, 0.1)], [0.7, shade(s.c1, -0.1)], [1, shade(s.c0, 0.1)]], 0.62, 0.66, 0.7);
      const cy = h * 0.54;
      const rx = sw / 2;
      const ry = shellH / 2;
      const shell = eggPath(s.cx, cy, rx / 0.86, ry, -1);
      const hingeY = cy - ry * 0.97;
      defs += `<clipPath id="ct-clip-${s.n}"><path d="${shell}"/></clipPath>`;
      // fan of ribs radiating from the hinge, like a sea shell
      let ribs = '';
      for (let k = 0; k < 11; k++) {
        const t = (k / 10 - 0.5) * 2; // -1..1
        const ex = s.cx + t * rx * 0.98;
        const ey = cy + ry * (0.78 + 0.2 * (1 - Math.abs(t)) * 0.5 + 0.1 * Math.abs(t) * -1);
        ribs += `<path d="M${r1(s.cx + t * rx * 0.05)} ${r1(hingeY + 6)} Q${r1(s.cx + t * rx * 0.75)} ${r1(cy - ry * 0.1)} ${r1(ex)} ${r1(ey)}" fill="none" stroke="rgba(40,12,2,.32)" stroke-width="2.6"/>`;
        ribs += `<path d="M${r1(s.cx + t * rx * 0.05 + 3)} ${r1(hingeY + 6)} Q${r1(s.cx + t * rx * 0.75 + 3)} ${r1(cy - ry * 0.1)} ${r1(ex + 3)} ${r1(ey)}" fill="none" stroke="rgba(255,225,170,.28)" stroke-width="1.4"/>`;
      }
      const hx = s.cx;
      const hy2 = hingeY + ry * 0.12;
      const loop = `M${r1(hx - rx * 0.12)} ${r1(hy2)} C${r1(hx - rx * 0.5)} ${r1(hy2 - ry * 0.7)} ${r1(hx + rx * 0.5)} ${r1(hy2 - ry * 0.7)} ${r1(hx + rx * 0.12)} ${r1(hy2)}`;
      const cord =
        `<path d="${loop}" fill="none" stroke="#7f1d1d" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="${loop}" fill="none" stroke="#fecaca" stroke-width="3" stroke-dasharray="3 5" stroke-linecap="round"/>` +
        ell(hx - rx * 0.12, hy2, 5, 4, '#1c0a02') +
        ell(hx + rx * 0.12, hy2, 5, 4, '#1c0a02') +
        ell(hx, hy2 - ry * 0.52, 8, 7, '#b91c1c', 'stroke="#7f1d1d" stroke-width="2"') +
        ell(hx - 2, hy2 - ry * 0.52 - 2, 3, 2, 'rgba(255,255,255,.6)');
      art += zg(
        s.id,
        `<g transform="rotate(${s.rot} ${r1(s.cx)} ${r1(h * 0.5)})">` +
          // the second half, peeking out behind
          `<g transform="translate(${r1(rx * 0.16)} ${r1(ry * 0.1)})"><path d="${shell}" fill="rgba(0,0,0,.22)" transform="translate(5 6)"/><path d="${shell}" fill="${shade(s.c2, 0.04)}" stroke="#240a02" stroke-width="3"/></g>` +
          `<path d="${shell}" fill="url(#ct-${s.n})" stroke="#240a02" stroke-width="4"/>` +
          `<g clip-path="url(#ct-clip-${s.n})">${ribs}</g>` +
          `<path d="${shell}" fill="none" stroke="rgba(255,225,170,.3)" stroke-width="3" transform="translate(-1.5 -1.5) scale(.985)" style="transform-origin:${r1(s.cx)}px ${r1(cy)}px"/>` +
          ell(s.cx - rx * 0.3, cy + ry * 0.05, rx * 0.12, ry * 0.3, 'rgba(255,255,255,.4)', `transform="rotate(20 ${r1(s.cx - rx * 0.3)} ${r1(cy + ry * 0.05)})"`) +
          cord +
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
