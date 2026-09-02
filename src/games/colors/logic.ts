import { COLORS, type ColorDef } from '../../core/content';
import { pick, shuffle, svgEl } from '../../core/dom';

/** Every basket receives this many balls per round. */
export const BALLS_PER_BASKET = 2;

export interface ColorBall {
  color: ColorDef;
  /** Unique within a round. */
  id: number;
}

export interface ColorRound {
  /** Baskets on the board, in display order. Distinct colours. */
  baskets: ColorDef[];
  /** Balls in the tray, shuffled: exactly `BALLS_PER_BASKET` per basket colour. */
  balls: ColorBall[];
}

/** Rounds 0 and 1 use 2 baskets, later rounds use 3. */
export function basketCount(roundIndex: number): number {
  return roundIndex < 2 ? 2 : 3;
}

export function makeColorRound(roundIndex: number, rng: () => number = Math.random): ColorRound {
  const baskets = pick(COLORS, basketCount(roundIndex), rng);
  const balls: ColorBall[] = [];
  for (const color of baskets) {
    for (let i = 0; i < BALLS_PER_BASKET; i++) balls.push({ color, id: balls.length });
  }
  return { baskets, balls: shuffle(balls, rng) };
}

/** Gradient ids must be unique per document, so every ball gets its own. */
let gradientSeq = 0;

/** A basket in `hex`: rounded handle, rim and a woven trapezoid body (100×100 box). */
export function basketSvg(hex: string): SVGSVGElement {
  return svgEl(
    `<svg viewBox="0 0 100 100" class="colors-basket-svg" aria-hidden="true">` +
      `<path d="M27,42 A23,23 0 0 1 73,42" fill="none" stroke="${hex}" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M13,46 H87 L79,90 Q78,95 73,95 H27 Q22,95 21,90 Z" fill="${hex}" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M18,63 H82 M21,77 H79 M35,50 L37,92 M50,50 V92 M65,50 L63,92" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>` +
      `<rect x="8" y="38" width="84" height="14" rx="7" fill="${hex}" stroke="rgba(0,0,0,.18)" stroke-width="3"/>` +
      `<rect x="11" y="41" width="78" height="5" rx="2.5" fill="rgba(255,255,255,.35)"/>` +
      `</svg>`,
  );
}

/** A glossy ball in `hex`: solid circle under a radial highlight/shade gradient. */
export function ballSvg(hex: string): SVGSVGElement {
  const id = `colors-shine-${++gradientSeq}`;
  return svgEl(
    `<svg viewBox="0 0 100 100" class="colors-ball-svg" aria-hidden="true">` +
      `<defs><radialGradient id="${id}" cx="34%" cy="30%" r="75%">` +
      `<stop offset="0%" stop-color="#fff" stop-opacity=".92"/>` +
      `<stop offset="38%" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset="50%" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#000" stop-opacity=".3"/>` +
      `</radialGradient></defs>` +
      `<circle cx="50" cy="50" r="46" fill="${hex}"/>` +
      `<circle cx="50" cy="50" r="46" fill="url(#${id})" stroke="rgba(0,0,0,.18)" stroke-width="3"/>` +
      `</svg>`,
  );
}
