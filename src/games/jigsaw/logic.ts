import { ANIMALS, FRUITS, VEHICLES, type Item } from '../../core/content';
import { randInt, shuffle } from '../../core/dom';

export interface JigsawPiece {
  /** Row of the cell this piece belongs to. */
  r: number;
  /** Column of the cell this piece belongs to. */
  c: number;
  /** Unique within a round. */
  id: number;
}

export interface JigsawRound {
  item: Item;
  /** Pastel picture background, one of `PICTURE_BGS`. */
  bg: string;
  cols: number;
  rows: number;
  /** Tray order (shuffled): exactly one piece per cell. */
  pieces: JigsawPiece[];
}

export const PICTURE_BGS: readonly string[] = ['#fecaca', '#fde68a', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8'];

/** Everything that can be a picture: animals, vehicles and fruits. */
export const PICTURES: readonly Item[] = [...ANIMALS, ...VEHICLES, ...FRUITS];

/** Fraction of the picture side taken by the emoji. */
export const EMOJI_SCALE = 0.72;

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Rounds 0–1: 2×2, rounds 2–3: 3×2, then 3×3. */
export function gridFor(round: number): { cols: number; rows: number } {
  if (round < 2) return { cols: 2, rows: 2 };
  if (round < 4) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export function makeJigsawRound(round: number, rng: () => number = Math.random, excludeEmoji?: string): JigsawRound {
  const pool = PICTURES.filter((i) => i.emoji !== excludeEmoji);
  const item = pool[randInt(0, pool.length - 1, rng)];
  if (!item) throw new Error('jigsaw: nothing to draw');
  const bg = PICTURE_BGS[randInt(0, PICTURE_BGS.length - 1, rng)] ?? '#fde68a';
  const { cols, rows } = gridFor(round);
  const cells: JigsawPiece[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ r, c, id: cells.length });
  }
  return { item, bg, cols, rows, pieces: shuffle(cells, rng) };
}

/**
 * Paint the picture on an offscreen `size`×`size` canvas: a radial gradient from
 * white to `bg` with the emoji centred on it, and return it as a PNG data URL.
 * `null` when no 2d context is available (jsdom).
 */
export function renderPicture(emoji: string, size: number, bg: string): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const mid = size / 2;
  const g = c.createRadialGradient(mid, mid * 0.9, size * 0.05, mid, mid, size * 0.72);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, bg);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  c.font = `${Math.round(size * EMOJI_SCALE)}px ${EMOJI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0, 0, 0, 0.22)';
  c.shadowBlur = size * 0.04;
  c.shadowOffsetY = size * 0.02;
  c.fillText(emoji, mid, mid + size * 0.02);
  return canvas.toDataURL('image/png');
}

/**
 * Width of a tray piece: the largest scale (≤ 1) of a `slotW`×`slotH` cell so
 * that `n` such pieces, wrapped into rows with `gap` between them, fit inside a
 * `trayW`×`trayH` box. The height follows from the cell's aspect ratio.
 */
export function trayPieceWidth(n: number, slotW: number, slotH: number, trayW: number, trayH: number, gap: number): number {
  if (n <= 0 || slotW <= 0 || slotH <= 0) return 0;
  let best = 0;
  for (let perRow = 1; perRow <= n; perRow++) {
    const rows = Math.ceil(n / perRow);
    const wMax = (trayW - (perRow - 1) * gap) / perRow;
    const hMax = (trayH - (rows - 1) * gap) / rows;
    const s = Math.min(1, wMax / slotW, hMax / slotH);
    if (s > best) best = s;
  }
  return slotW * best;
}
