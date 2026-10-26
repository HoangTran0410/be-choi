/**
 * Game colours are pastels (they also tint each game's stage). The home tiles want the bold,
 * candy look instead: the same hue, deeper, as a top-to-bottom gradient with a darker edge
 * underneath so the tile reads as a button you can press down.
 */
export interface TilePaint {
  top: string;
  bottom: string;
  edge: string;
}

function hueSat(hex: string): { h: number; s: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return { h: 210, s: 0.8 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { h: 210, s: 0 };
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h: (h + 360) % 360, s };
}

export function tilePaint(hex: string): TilePaint {
  const { h: hue, s } = hueSat(hex);
  // White words must stay readable: yellows lean towards amber and sit darker than other hues.
  const yellow = hue >= 40 && hue <= 75;
  const h = Math.round(yellow ? hue - 8 : hue);
  const sat = s < 0.15 ? 20 : yellow ? 92 : 78;
  const l = yellow ? 50 : 58;
  return {
    top: `hsl(${h} ${sat}% ${l + 8}%)`,
    bottom: `hsl(${h} ${sat}% ${l - 4}%)`,
    edge: `hsl(${h} ${sat}% ${l - 18}%)`,
  };
}

/** Inline style for an element painted by `tilePaint`. */
export function tileStyle(hex: string): string {
  const p = tilePaint(hex);
  return `--tile-top:${p.top};--tile-bottom:${p.bottom};--tile-edge:${p.edge}`;
}
