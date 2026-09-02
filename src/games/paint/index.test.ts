import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import game, { STORAGE_KEY } from './index';
import { BRUSHES, PALETTE, SAVE_MS, STAMPS, deserializePainting, serializePainting } from './logic';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

function ptr(type: string, x = 0, y = 0, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId, button: 0, isPrimary: true, bubbles: true });
}

/** Enough of a 2d context for the game to draw into; every call is recorded. */
function fake2d() {
  return {
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalCompositeOperation: '',
  };
}

/** jsdom never loads images; this one reports success on the next tick. */
class FakeImage extends EventTarget {
  set src(_value: string) {
    setTimeout(() => this.dispatchEvent(new Event('load')), 0);
  }
}

const SNAPSHOT = 'data:image/png;base64,AA';

describe('paint game', () => {
  let toDataURL: { mockRestore(): void };

  beforeEach(() => {
    localStorage.clear();
    // jsdom has no canvas backend, but the game must still be able to snapshot.
    toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SNAPSHOT);
  });
  afterEach(() => {
    toDataURL.mockRestore();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('mounts canvas and tools, moves selection, survives drawing without a 2d context, cleans up', () => {
    vi.useFakeTimers();
    // jsdom has no canvas backend; the game must guard every getContext call.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    game.start(ctx);

    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('canvas.paint-canvas');
    expect(canvas).not.toBeNull();
    const swatches = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-swatch')];
    const sizes = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-size')];
    const stamps = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-stamp')];
    const eraser = ctx.stage.querySelector<HTMLElement>('.paint-eraser');
    const trash = ctx.stage.querySelector<HTMLElement>('.paint-trash');
    expect(swatches.length).toBe(PALETTE.length);
    expect(swatches.length).toBe(8);
    expect(sizes.length).toBe(BRUSHES.length);
    expect(sizes.length).toBe(3);
    expect(stamps.length).toBe(STAMPS.length);
    expect(stamps.length).toBe(4);
    expect(eraser).not.toBeNull();
    expect(trash).not.toBeNull();

    // Default: first colour, middle size.
    expect(swatches[0]?.classList.contains('selected')).toBe(true);
    expect(sizes[1]?.classList.contains('selected')).toBe(true);
    expect(ctx.spoken).toEqual([]);

    // Picking a colour moves the ring and names the colour.
    swatches[3]?.dispatchEvent(ptr('pointerdown'));
    expect(swatches[0]?.classList.contains('selected')).toBe(false);
    expect(swatches[3]?.classList.contains('selected')).toBe(true);
    expect(sizes[1]?.classList.contains('selected')).toBe(true);
    expect(ctx.spoken).toEqual(['màu xanh lá']);

    // A stamp drops the colour ring; a size keeps the stamp; the eraser drops the stamp.
    stamps[1]?.dispatchEvent(ptr('pointerdown'));
    expect(stamps[1]?.classList.contains('selected')).toBe(true);
    expect(swatches.some((s) => s.classList.contains('selected'))).toBe(false);
    sizes[2]?.dispatchEvent(ptr('pointerdown'));
    expect(sizes[2]?.classList.contains('selected')).toBe(true);
    expect(sizes[1]?.classList.contains('selected')).toBe(false);
    expect(stamps[1]?.classList.contains('selected')).toBe(true);
    eraser?.dispatchEvent(ptr('pointerdown'));
    expect(eraser?.classList.contains('selected')).toBe(true);
    expect(stamps[1]?.classList.contains('selected')).toBe(false);
    swatches[0]?.dispatchEvent(ptr('pointerdown'));
    expect(eraser?.classList.contains('selected')).toBe(false);
    expect(swatches[0]?.classList.contains('selected')).toBe(true);
    expect(ctx.spoken).toEqual(['màu xanh lá', 'màu đỏ']);

    // Drawing and stamping never throw even though there is no 2d context.
    canvas?.dispatchEvent(ptr('pointerdown', 10, 10, 1));
    canvas?.dispatchEvent(ptr('pointerdown', 50, 50, 2));
    canvas?.dispatchEvent(ptr('pointermove', 20, 20, 1));
    canvas?.dispatchEvent(ptr('pointerup', 20, 20, 1));
    canvas?.dispatchEvent(ptr('pointercancel', 50, 50, 2));
    stamps[0]?.dispatchEvent(ptr('pointerdown'));
    canvas?.dispatchEvent(ptr('pointerdown', 30, 30, 1));
    expect(ctx.stars).toBe(0);

    // Trash needs a 700 ms hold and must not throw without a context.
    trash?.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(300);
    trash?.dispatchEvent(ptr('pointerup'));
    trash?.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(700);
    expect(trash?.querySelector('.hold-ring')).toBeNull();

    window.dispatchEvent(new Event('resize'));
    expect(getContext).toHaveBeenCalled();

    // No family photos: no photo button, no background.
    expect(ctx.stage.querySelector('.paint-photo')).toBeNull();
    expect(ctx.stage.querySelector<HTMLElement>('.paint-area .paint-bg')?.hidden).toBe(true);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
    vi.useRealTimers();
  });

  it('lets the child pick a family photo for the background, tries the colouring page and keeps the photo when it fails', async () => {
    vi.useFakeTimers();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    game.start(ctx);
    await ctx.photos.list();
    expect(ctx.stage.querySelector('.paint-photo')).toBeNull();

    // A parent adds photos: the 🖼️ button appears, nothing is shown yet.
    const [first, second] = await ctx.photos.add([new Blob(['x']), new Blob(['yy'])]);
    const photoBtn = ctx.stage.querySelector<HTMLElement>('.paint-tools .paint-photo');
    const lineArtBtn = ctx.stage.querySelector<HTMLElement>('.paint-tools .paint-lineart');
    const bg = ctx.stage.querySelector<HTMLImageElement>('.paint-area .paint-bg');
    expect(photoBtn?.textContent).toBe('🖼️');
    expect(photoBtn?.classList.contains('paint-btn')).toBe(true);
    expect(bg?.hidden).toBe(true);
    expect(lineArtBtn?.hidden).toBe(true);

    // 🖼️ opens the picker on the stage: ⬜ plus one tile per photo.
    photoBtn?.dispatchEvent(ptr('pointerdown'));
    const tiles = [...ctx.stage.querySelectorAll<HTMLElement>('.pp-overlay .pp-tile')];
    expect(tiles.length).toBe(3);
    expect(tiles[0]?.dataset.id).toBe('none');
    expect(tiles[0]?.textContent).toBe('⬜');
    expect(tiles.map((t) => t.dataset.id)).toEqual(['none', first!.id, second!.id]);
    expect(tiles[2]?.getAttribute('style')).toContain(second!.url);

    // Dismissing changes nothing.
    ctx.stage.querySelector<HTMLElement>('.pp-close')?.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    expect(bg?.hidden).toBe(true);
    expect(ctx.spoken).toEqual([]);

    // Picking a photo puts it under the (transparent) canvas, names it aloud and offers ✏️.
    photoBtn?.dispatchEvent(ptr('pointerdown'));
    ctx.stage.querySelector<HTMLElement>(`.pp-tile[data-id="${second!.id}"]`)?.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    expect(bg?.hidden).toBe(false);
    expect(bg?.getAttribute('src')).toBe(second!.url);
    expect(ctx.spoken).toEqual(['Ảnh của bé']);
    expect(lineArtBtn?.hidden).toBe(false);
    expect(lineArtBtn?.textContent).toBe('✏️');
    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('canvas.paint-canvas');
    expect(bg?.nextElementSibling).toBe(canvas);

    // ✏️: converting… jsdom never decodes images, so the conversion fails (times out):
    // the photo stays, the button resets, nothing throws.
    lineArtBtn?.dispatchEvent(ptr('pointerdown'));
    expect(lineArtBtn?.textContent).toBe('⏳');
    expect(ctx.spoken).toEqual(['Ảnh của bé', 'Tô màu ảnh nào!']);
    expect(bg?.hidden).toBe(false);
    expect(bg?.getAttribute('src')).toBe(second!.url);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lineArtBtn?.textContent).toBe('✏️');
    expect(lineArtBtn?.classList.contains('selected')).toBe(false);
    expect(bg?.hidden).toBe(false);
    expect(bg?.getAttribute('src')).toBe(second!.url);

    // Trash wipes the drawing only.
    const trash = ctx.stage.querySelector<HTMLElement>('.paint-trash');
    trash?.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(700);
    expect(bg?.hidden).toBe(false);
    expect(bg?.getAttribute('src')).toBe(second!.url);

    // ⬜ goes back to plain white.
    photoBtn?.dispatchEvent(ptr('pointerdown'));
    expect(ctx.stage.querySelectorAll('.pp-tile').length).toBe(3);
    ctx.stage.querySelector<HTMLElement>('.pp-tile[data-id="none"]')?.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    expect(bg?.hidden).toBe(true);
    expect(bg?.getAttribute('src')).toBeNull();
    expect(lineArtBtn?.hidden).toBe(true);
    expect(ctx.spoken).toEqual(['Ảnh của bé', 'Tô màu ảnh nào!']);

    // Removing every photo takes the button away again.
    await ctx.photos.remove(first!.id);
    expect(ctx.stage.querySelector('.paint-photo')).not.toBeNull();
    await ctx.photos.remove(second!.id);
    expect(ctx.stage.querySelector('.paint-photo')).toBeNull();

    ctx.cleanup();
    getContext.mockRestore();
    vi.useRealTimers();
  });

  it('adds unlocked stickers as extra stamps', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    ctx.stickers = () => ['🐻', '🦊'];
    game.start(ctx);

    const stamps = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-stamp')];
    expect(stamps.length).toBe(6);
    expect(stamps.map((s) => s.dataset.emoji)).toEqual([...STAMPS, '🐻', '🦊']);

    stamps[4]?.dispatchEvent(ptr('pointerdown'));
    expect(stamps[4]?.classList.contains('selected')).toBe(true);
    expect(stamps.filter((s) => s.classList.contains('selected')).length).toBe(1);
    expect([...ctx.stage.querySelectorAll('.paint-swatch.selected')].length).toBe(0);
    expect(ctx.stage.querySelector('.paint-eraser')?.classList.contains('selected')).toBe(false);

    ctx.cleanup();
    getContext.mockRestore();
  });

  it('keeps the drawing in localStorage once the child pauses, and on the way out', () => {
    vi.useFakeTimers();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => fake2d() as unknown as CanvasRenderingContext2D);
    const ctx = fakeContext();
    game.start(ctx);
    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('canvas.paint-canvas')!;

    canvas.dispatchEvent(ptr('pointerdown', 10, 10));
    canvas.dispatchEvent(ptr('pointerup', 10, 10));
    // Written out only after the child stops drawing.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(SAVE_MS);
    const saved = deserializePainting(localStorage.getItem(STORAGE_KEY) ?? '');
    expect(saved?.image).toBe(SNAPSHOT);
    expect(saved?.photo).toBeNull();
    expect(saved?.lineArt).toBe(false);

    // Holding the bin forgets the picture here and on disk.
    ctx.stage.querySelector<HTMLElement>('.paint-trash')?.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(700);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Leaving straight after a stroke flushes it without waiting.
    canvas.dispatchEvent(ptr('pointerdown', 20, 20));
    canvas.dispatchEvent(ptr('pointerup', 20, 20));
    ctx.cleanup();
    expect(deserializePainting(localStorage.getItem(STORAGE_KEY) ?? '')?.image).toBe(SNAPSHOT);

    getContext.mockRestore();
    vi.useRealTimers();
  });

  it('paints the saved drawing back when the game opens again', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', FakeImage);
    localStorage.setItem(
      STORAGE_KEY,
      serializePainting({ image: SNAPSHOT, w: 100, h: 200, photo: null, lineArt: false }),
    );
    const c2d = fake2d();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => c2d as unknown as CanvasRenderingContext2D);
    const ctx = fakeContext();
    game.start(ctx);
    expect(c2d.drawImage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c2d.drawImage).toHaveBeenCalledTimes(1);

    ctx.cleanup();
    getContext.mockRestore();
    vi.useRealTimers();
  });

  it('ignores a saved entry it cannot read', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', FakeImage);
    localStorage.setItem(STORAGE_KEY, '{oops');
    const c2d = fake2d();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => c2d as unknown as CanvasRenderingContext2D);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    vi.advanceTimersByTime(1);
    expect(c2d.drawImage).not.toHaveBeenCalled();

    ctx.cleanup();
    getContext.mockRestore();
    vi.useRealTimers();
  });
});
