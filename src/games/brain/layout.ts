/** Pure sizing and pacing helpers. */

export interface GridFit {
  cols: number;
  rows: number;
  /** Side of one square cell, px (gap not included). */
  size: number;
}

/** Try every column count and keep the one that makes the cells biggest. */
export function fitGrid(count: number, w: number, h: number, gap = 8, maxCols = count, exact = false): GridFit {
  const top = Math.max(1, Math.min(count, maxCols));
  let best: GridFit = { cols: top, rows: Math.ceil(count / top), size: 0 };
  for (let cols = 1; cols <= top; cols++) {
    // `exact`: only whole rows, so no lonely card is left on a last line.
    if (exact && count % cols !== 0) continue;
    const rows = Math.ceil(count / cols);
    const size = Math.floor(Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows));
    if (size > best.size) best = { cols, rows, size };
  }
  return best;
}

/** Rough speaking time for a phrase, slow and clear: ~0.46 s a syllable plus a breath. */
export function phraseMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return 500 + words * 460;
}
