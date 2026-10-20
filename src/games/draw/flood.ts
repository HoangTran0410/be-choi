/**
 * Paint-bucket maths for colouring pages. Pure over typed arrays, no canvas.
 *
 * The page's lines are the "walls". Tapping inside a closed shape floods that shape
 * and nothing else; if the lines have a gap the colour simply spreads further, which
 * is never wrong, only more colourful.
 */

/** 1 where the line art has ink (dark and visible), 0 elsewhere. */
export function wallsFromRgba(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const walls = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < walls.length; i++, p += 4) {
    const a = rgba[p + 3] ?? 0;
    if (a < 110) continue;
    const lum = 0.299 * (rgba[p] ?? 0) + 0.587 * (rgba[p + 1] ?? 0) + 0.114 * (rgba[p + 2] ?? 0);
    if (lum < 170) walls[i] = 1;
  }
  return walls;
}

/** The closest open (non-wall) pixel within `r` of (x, y), or null. A finger lands on a line half the time. */
export function nearestOpen(walls: Uint8Array, w: number, h: number, x: number, y: number, r = 8): { x: number; y: number } | null {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx >= 0 && cy >= 0 && cx < w && cy < h && walls[cy * w + cx] === 0) return { x: cx, y: cy };
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= w || py >= h || walls[py * w + px] !== 0) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD && d <= r * r) {
        bestD = d;
        best = { x: px, y: py };
      }
    }
  }
  return best;
}

export interface Region {
  /** 1 inside the flooded area. */
  mask: Uint8Array;
  count: number;
}

/** Scanline flood fill from (sx, sy) over the open pixels. Null when the start is a wall or off the page. */
export function floodRegion(walls: Uint8Array, w: number, h: number, sx: number, sy: number): Region | null {
  const x0 = Math.round(sx);
  const y0 = Math.round(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h || walls[y0 * w + x0] !== 0) return null;
  const mask = new Uint8Array(w * h);
  let count = 0;
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    const row = y * w;
    while (x >= 0 && walls[row + x] === 0 && mask[row + x] === 0) x--;
    x++;
    let above = false;
    let below = false;
    while (x < w && walls[row + x] === 0 && mask[row + x] === 0) {
      mask[row + x] = 1;
      count++;
      if (y > 0) {
        const open = walls[row - w + x] === 0 && mask[row - w + x] === 0;
        if (open && !above) stack.push(x, y - 1);
        above = open;
      }
      if (y < h - 1) {
        const open = walls[row + w + x] === 0 && mask[row + w + x] === 0;
        if (open && !below) stack.push(x, y + 1);
        below = open;
      }
      x++;
    }
  }
  return { mask, count };
}

/** Grow a region by `n` pixels (4-neighbourhood) so colour tucks under the lines instead of leaving a pale halo. */
export function growMask(mask: Uint8Array, w: number, h: number, n: number): Uint8Array {
  let cur = mask;
  for (let k = 0; k < n; k++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i] === 1) continue;
        if ((x > 0 && cur[i - 1] === 1) || (x < w - 1 && cur[i + 1] === 1) || (y > 0 && cur[i - w] === 1) || (y < h - 1 && cur[i + w] === 1)) next[i] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

/** `#rrggbb` → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Write `hex` into every masked pixel of `rgba` (fully opaque). */
export function paintMask(rgba: Uint8ClampedArray, mask: Uint8Array, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i] === 0) continue;
    rgba[p] = r;
    rgba[p + 1] = g;
    rgba[p + 2] = b;
    rgba[p + 3] = 255;
  }
}
