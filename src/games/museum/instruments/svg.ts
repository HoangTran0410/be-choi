import type { Shape } from './types';

export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Mix a #rrggbb colour toward white (amt > 0) or black (amt < 0). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const t = amt >= 0 ? 255 : 0;
    return Math.round(c + (t - c) * Math.abs(amt));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const rect = (x: number, y: number, w: number, h: number, r: number, fill: string, extra = ''): string =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(0, w))}" height="${r1(Math.max(0, h))}" rx="${r1(r)}" fill="${fill}" ${extra}/>`;
export const ell = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = ''): string =>
  `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(Math.max(0, rx))}" ry="${r1(Math.max(0, ry))}" fill="${fill}" ${extra}/>`;
export const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, extra = ''): string =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${r1(sw)}" stroke-linecap="round" ${extra}/>`;
export const path = (d: string, fill: string, extra = ''): string => `<path d="${d}" fill="${fill}" ${extra}/>`;
/** A zone's drawing. CSS animates `.hit`; JS finds it by `data-z`. */
export const zg = (id: string, inner: string, cls = ''): string => `<g class="z ${cls}" data-z="${id}">${inner}</g>`;

export function linGrad(id: string, c1: string, c2: string, vertical = true): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
}
export function radGrad(id: string, c1: string, c2: string): string {
  return `<radialGradient id="${id}" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
}

export function wrap(w: number, h: number, defs: string, inner: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}" width="${r1(w)}" height="${r1(h)}" role="img" aria-label="${label}"><defs>${defs}</defs>${inner}</svg>`;
}

/**
 * A frame in "instrument coordinates": `u` runs along the instrument's main axis
 * and `v` across it. Landscape draws u → x, v → y. Portrait turns the instrument
 * on its side (u → y, v → x) so keys and bars stay 72 px tall on a phone.
 * `flipU` makes u run bottom-to-top in portrait, so a higher note is higher up.
 */
export class Frame {
  readonly U: number;
  readonly V: number;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly portrait: boolean,
    readonly flipU = false,
  ) {
    this.U = portrait ? h : w;
    this.V = portrait ? w : h;
  }
  private fu(u: number): number {
    return this.portrait && this.flipU ? this.U - u : u;
  }
  X(u: number, v: number): number {
    return this.portrait ? v : u;
  }
  Y(u: number, v: number): number {
    return this.portrait ? this.fu(u) : v;
  }
  /** Box from (u, v) of size (du, dv), as a screen rect. */
  box(u: number, v: number, du: number, dv: number): { x: number; y: number; w: number; h: number } {
    if (!this.portrait) return { x: u, y: v, w: du, h: dv };
    const u0 = this.flipU ? this.U - u - du : u;
    return { x: v, y: u0, w: dv, h: du };
  }
  rect(u: number, v: number, du: number, dv: number, r: number, fill: string, extra = ''): string {
    const b = this.box(u, v, du, dv);
    return rect(b.x, b.y, b.w, b.h, r, fill, extra);
  }
  shapeRect(u: number, v: number, du: number, dv: number): Shape {
    const b = this.box(u, v, du, dv);
    return { t: 'rect', ...b };
  }
  ell(u: number, v: number, ru: number, rv: number, fill: string, extra = ''): string {
    return this.portrait ? ell(this.X(u, v), this.Y(u, v), rv, ru, fill, extra) : ell(u, v, ru, rv, fill, extra);
  }
  shapeEll(u: number, v: number, ru: number, rv: number): Shape {
    return this.portrait ? { t: 'ell', cx: this.X(u, v), cy: this.Y(u, v), rx: rv, ry: ru } : { t: 'ell', cx: u, cy: v, rx: ru, ry: rv };
  }
  line(u1: number, v1: number, u2: number, v2: number, stroke: string, sw: number, extra = ''): string {
    return line(this.X(u1, v1), this.Y(u1, v1), this.X(u2, v2), this.Y(u2, v2), stroke, sw, extra);
  }
  /** A path from instrument-space points: each command's numbers are u,v pairs. */
  d(cmds: Array<[string, ...number[]]>): string {
    return cmds
      .map(([c, ...n]) => {
        const out: number[] = [];
        for (let i = 0; i < n.length; i += 2) out.push(r1(this.X(n[i]!, n[i + 1]!)), r1(this.Y(n[i]!, n[i + 1]!)));
        return `${c}${out.join(' ')}`;
      })
      .join('');
  }
}

/** Does the point lie inside the shape? */
export function inShape(s: Shape, x: number, y: number): boolean {
  if (s.t === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  const dx = (x - s.cx) / s.rx;
  const dy = (y - s.cy) / s.ry;
  return dx * dx + dy * dy <= 1;
}

export function shapeSize(s: Shape): number {
  return s.t === 'rect' ? Math.min(s.w, s.h) : Math.min(s.rx, s.ry) * 2;
}

export function shapeCenter(s: Shape): { x: number; y: number } {
  return s.t === 'rect' ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : { x: s.cx, y: s.cy };
}
