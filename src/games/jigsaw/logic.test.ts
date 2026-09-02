import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EMOJI_SCALE,
  gridFor,
  makeJigsawRound,
  PICTURE_BGS,
  PICTURES,
  renderPhotoPicture,
  renderPicture,
  trayPieceWidth,
} from './logic';
import { mulberry32 } from '../../core/dom';

/** Enough of a 2d context for `renderPicture`: every call is a spy. */
function fake2d() {
  const gradient = { addColorStop: vi.fn() };
  return {
    gradient,
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    createRadialGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
  };
}

/** A stand-in `Image` (jsdom never loads one) that fires `load` or `error` on the next microtask. */
function fakeImage(ok: boolean, w = 40, h = 30) {
  return class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = w;
    height = h;
    set src(_url: string) {
      queueMicrotask(() => (ok ? this.onload : this.onerror)?.());
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('jigsaw gridFor', () => {
  it('2×2 for rounds 0–1, 3×2 for rounds 2–3, then 3×3', () => {
    expect(gridFor(0)).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(1)).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(2)).toEqual({ cols: 3, rows: 2 });
    expect(gridFor(3)).toEqual({ cols: 3, rows: 2 });
    expect(gridFor(4)).toEqual({ cols: 3, rows: 3 });
    expect(gridFor(9)).toEqual({ cols: 3, rows: 3 });
  });
});

describe('jigsaw makeJigsawRound', () => {
  it('has one piece per cell with unique ids, a known picture and a pastel background', () => {
    for (const round of [0, 2, 4]) {
      const r = makeJigsawRound(round, mulberry32(7 + round));
      const { cols, rows } = gridFor(round);
      expect(r.cols).toBe(cols);
      expect(r.rows).toBe(rows);
      expect(r.pieces.length).toBe(cols * rows);
      const cells = r.pieces.map((p) => `${p.r},${p.c}`).sort();
      const expected: string[] = [];
      for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) expected.push(`${rr},${cc}`);
      expect(cells).toEqual(expected.sort());
      expect(new Set(r.pieces.map((p) => p.id)).size).toBe(cols * rows);
      expect(PICTURES.some((i) => i.emoji === r.item.emoji)).toBe(true);
      expect(PICTURE_BGS).toContain(r.bg);
    }
    expect(PICTURE_BGS.length).toBe(6);
  });

  it('shuffles the pieces: not always in reading order, and different across seeds', () => {
    const orders = new Set<string>();
    let shuffled = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = makeJigsawRound(4, mulberry32(seed));
      const ids = r.pieces.map((p) => p.id).join(',');
      orders.add(ids);
      if (ids !== '0,1,2,3,4,5,6,7,8') shuffled++;
    }
    expect(shuffled).toBeGreaterThan(0);
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never picks the excluded picture', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(makeJigsawRound(0, mulberry32(seed), '🐶').item.emoji).not.toBe('🐶');
      expect(makeJigsawRound(1, mulberry32(seed), '🍎').item.emoji).not.toBe('🍎');
    }
  });

  it('is deterministic for a seed', () => {
    expect(makeJigsawRound(2, mulberry32(9))).toEqual(makeJigsawRound(2, mulberry32(9)));
  });
});

describe('jigsaw renderPicture', () => {
  it('returns null without a 2d context (jsdom) and never throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(renderPicture('🐶', 64, '#fde68a')).toBeNull();
  });

  it('paints a white→bg gradient and the centred emoji, then returns the PNG data URL', () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD');
    expect(renderPicture('🐶', 100, '#bae6fd')).toBe('data:image/png;base64,QUJD');
    expect(c.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(c.gradient.addColorStop).toHaveBeenCalledWith(0, '#fff');
    expect(c.gradient.addColorStop).toHaveBeenCalledWith(1, '#bae6fd');
    expect(c.font.startsWith(`${Math.round(100 * EMOJI_SCALE)}px`)).toBe(true);
    expect(c.textAlign).toBe('center');
    expect(c.textBaseline).toBe('middle');
    expect(c.shadowBlur).toBeGreaterThan(0);
    expect(c.fillText).toHaveBeenCalledWith('🐶', 50, expect.any(Number));
  });
});

describe('jigsaw renderPhotoPicture', () => {
  it('resolves null in jsdom (no 2d context) and never throws', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderPhotoPicture('data:image/jpeg;base64,', 64)).resolves.toBeNull();
  });

  it('resolves null when the image fails to load', async () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Image', fakeImage(false));
    await expect(renderPhotoPicture('data:image/jpeg;base64,', 100)).resolves.toBeNull();
    expect(c.drawImage).not.toHaveBeenCalled();
  });

  it('paints white, covers the square with the photo and returns a JPEG data URL', async () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,UEhP');
    vi.stubGlobal('Image', fakeImage(true, 200, 100));
    await expect(renderPhotoPicture('data:image/jpeg;base64,', 100)).resolves.toBe('data:image/jpeg;base64,UEhP');
    expect(c.fillStyle).toBe('#fff');
    expect(c.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    // A 200×100 photo covering a 100×100 square keeps its height and is centred horizontally.
    expect(c.drawImage).toHaveBeenCalledWith(expect.anything(), -50, 0, 200, 100);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });
});

describe('jigsaw trayPieceWidth', () => {
  it('keeps the slot size when everything fits in one row', () => {
    expect(trayPieceWidth(4, 100, 100, 500, 120, 10)).toBe(100);
  });
  it('shrinks so the pieces wrap into rows that fit the tray', () => {
    // 9 squares in 300×200: three per row would need 3 rows of 66.67.
    expect(trayPieceWidth(9, 100, 100, 300, 200, 0)).toBeCloseTo(200 / 3, 5);
    // Tall 3×2 cells (90×135) in a 270×300 column: 3 per row at 0.93 scale.
    const w = trayPieceWidth(6, 90, 135, 270, 300, 0);
    expect(w).toBeCloseTo(90, 5);
    expect(trayPieceWidth(6, 90, 135, 200, 300, 0)).toBeLessThan(90);
  });
  it('accounts for gaps and never exceeds the slot', () => {
    expect(trayPieceWidth(2, 100, 100, 190, 100, 10)).toBe(90);
    expect(trayPieceWidth(1, 50, 50, 1000, 1000, 10)).toBe(50);
  });
  it('is 0 for nothing to lay out', () => {
    expect(trayPieceWidth(0, 100, 100, 300, 300, 0)).toBe(0);
    expect(trayPieceWidth(3, 0, 100, 300, 300, 0)).toBe(0);
  });
});
