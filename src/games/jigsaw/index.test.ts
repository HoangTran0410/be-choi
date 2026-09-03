import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PICTURES } from './logic';
import { createPhotoStore } from '../../core/photos';
import { fakeContext } from '../../core/testing';
import game from './index';

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

function ptr(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true });
}

/** Board side in the stubbed layout. */
const BOARD = 400;

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

/**
 * jsdom has no layout. Give the board a 400×400 rect at the origin, every slot its
 * bounding box in px (from its inline % style) and every tray item a 40×40 rect
 * centred on its drag translate — i.e. a piece sits under the finger.
 */
function layout(ctx: { stage: HTMLElement }): void {
  const board = ctx.stage.querySelector<HTMLElement>('.jigsaw-board');
  if (board) board.getBoundingClientRect = () => rect(0, 0, BOARD, BOARD);
  const tray = ctx.stage.querySelector<HTMLElement>('.jigsaw-tray');
  if (tray) tray.getBoundingClientRect = () => rect(0, 500, BOARD, 200);
  for (const el of ctx.stage.querySelectorAll<HTMLElement>('.jigsaw-slot')) {
    const p = (v: string): number => (parseFloat(v) / 100) * BOARD;
    el.getBoundingClientRect = () => rect(p(el.style.left), p(el.style.top), p(el.style.width), p(el.style.height));
  }
  for (const el of ctx.stage.querySelectorAll<HTMLElement>('.jigsaw-item')) {
    el.getBoundingClientRect = () => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
      const x = m ? Number(m[1]) : 0;
      const y = m ? Number(m[2]) : 0;
      return rect(x - 20, y - 20, 40, 40);
    };
  }
}

function centre(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Drag `item` from the origin and release it at (x, y). */
function drop(item: HTMLElement, x: number, y: number): void {
  item.dispatchEvent(ptr('pointerdown', 0, 0));
  item.dispatchEvent(ptr('pointermove', x, y));
  item.dispatchEvent(ptr('pointerup', x, y));
}

/** Release `item` on the centre of `slot`, `dx`/`dy` off. */
function dropOn(item: HTMLElement, slot: HTMLElement, dx = 0, dy = 0): void {
  const c = centre(slot);
  drop(item, c.x + dx, c.y + dy);
}

const q = (ctx: { stage: HTMLElement }, sel: string) => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];

function slotOf(ctx: { stage: HTMLElement }, item: HTMLElement): HTMLElement {
  return ctx.stage.querySelector<HTMLElement>(`.jigsaw-slot[data-id="${item.dataset.id}"]`)!;
}

/** Place every tray piece on its own slot. */
function solve(ctx: { stage: HTMLElement }): void {
  layout(ctx);
  for (const item of q(ctx, '.jigsaw-tray .jigsaw-item')) dropOn(item, slotOf(ctx, item));
}

function mount() {
  const ctx = fakeContext();
  game.start(ctx);
  layout(ctx);
  return { ctx, items: q(ctx, '.jigsaw-tray .jigsaw-item'), slots: q(ctx, '.jigsaw-slot') };
}

/** Enough of a 2d context for `renderPicture`: every call is a spy. */
function fake2d() {
  return {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
  };
}

/** jsdom never loads images: a stand-in `Image` that fires `load` on the next microtask. */
function fakeImage(w = 40, h = 30) {
  return class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = w;
    height = h;
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
}

describe('jigsaw game', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mounts a 2×2 grid: ghost, dashed cut lines, 4 shaped slots and 4 tray pieces; says what to build; cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const wrap = ctx.stage.querySelector<HTMLElement>('.jigsaw')!;
    expect(wrap).not.toBeNull();
    expect(wrap.classList.contains('jigsaw-many')).toBe(false);
    const board = ctx.stage.querySelector<HTMLElement>('.jigsaw-board')!;
    expect(board.dataset.style).toBe('grid');
    const slots = q(ctx, '.jigsaw-board .jigsaw-slot');
    expect(slots.map((s) => s.dataset.id).sort()).toEqual(['0', '1', '2', '3']);
    // Slots sit on their piece's bounding box, in % of the board.
    const s1 = board.querySelector<HTMLElement>('.jigsaw-slot[data-id="1"]')!;
    expect([s1.style.left, s1.style.top, s1.style.width, s1.style.height]).toEqual(['50%', '0%', '50%', '50%']);
    const lines = board.querySelector<SVGPathElement>('svg.jigsaw-lines path')!;
    expect(lines).not.toBeNull();
    expect(lines.getAttribute('d')?.startsWith('M')).toBe(true);
    expect(lines.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    const items = q(ctx, '.jigsaw-tray .jigsaw-item');
    expect(items.length).toBe(4);
    expect(items.every((i) => i.classList.contains('g-item'))).toBe(true);
    expect(items.map((i) => i.dataset.id).sort()).toEqual(['0', '1', '2', '3']);
    const pieces = q(ctx, '.jigsaw-tray .jigsaw-item > .jigsaw-piece');
    expect(pieces.length).toBe(4);
    expect(pieces.map((p) => p.dataset.id).sort()).toEqual(['0', '1', '2', '3']);
    expect(q(ctx, '.jigsaw-piece > svg.jigsaw-piece-edge path[d^="M"]').length).toBe(4);
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-board .jigsaw-ghost')!;
    expect(ghost).not.toBeNull();
    // No canvas in jsdom: the ghost and pieces fall back to colour + emoji.
    expect(PICTURES.some((i) => i.emoji === ghost.textContent)).toBe(true);
    expect(ghost.classList.contains('jigsaw-ghost-plain')).toBe(true);
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(4);
    expect(ctx.spoken.length).toBe(1);
    expect(ctx.spoken[0]?.startsWith('Ghép ')).toBe(true);
    expect(ctx.spoken[0]?.endsWith(' nào!')).toBe(true);
    window.dispatchEvent(new Event('resize'));
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    window.dispatchEvent(new Event('resize'));
  });

  it('springs back from another slot or far away, snaps into its own', () => {
    const { ctx, items, slots } = mount();
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const item = items[0]!;
    const piece = item.querySelector<HTMLElement>('.jigsaw-piece')!;
    const own = slotOf(ctx, item);
    const wrong = slots.find((s) => s !== own)!;

    dropOn(item, wrong);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(ding).not.toHaveBeenCalled();
    expect(piece.classList.contains('placed')).toBe(false);
    expect(item.classList.contains('spring-back')).toBe(true);
    expect(item.parentElement?.classList.contains('jigsaw-tray')).toBe(true);
    expect(wrong.classList.contains('filled')).toBe(false);

    drop(item, 5000, 5000);
    expect(boing).toHaveBeenCalledTimes(2);

    dropOn(item, own);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(piece.classList.contains('placed')).toBe(true);
    expect(piece.style.transform).toBe('');
    expect(own.classList.contains('filled')).toBe(true);
    expect(own.contains(piece)).toBe(true);
    expect(item.isConnected).toBe(false);
    expect(q(ctx, '.jigsaw-tray .jigsaw-item').length).toBe(3);
    expect(ctx.stage.querySelector('.jigsaw-board')?.classList.contains('done')).toBe(false);
    expect(ctx.celebrations).toBe(0);
    // A placed piece cannot be picked up again.
    item.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(item.classList.contains('dragging')).toBe(false);
    ctx.cleanup();
  });

  it('accepts a drop within 0.28 × board of the slot centre and boings beyond', () => {
    const { ctx, items } = mount();
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const near = 0.28 * BOARD - 2;
    const far = 0.28 * BOARD + 2;
    const [a, b] = items as [HTMLElement, HTMLElement];
    dropOn(a, slotOf(ctx, a), far, 0);
    expect(boing).toHaveBeenCalledTimes(1);
    dropOn(a, slotOf(ctx, a), near * Math.SQRT1_2, near * Math.SQRT1_2);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelector(`.jigsaw-piece[data-id="${a.dataset.id}"]`)?.classList.contains('placed')).toBe(true);
    dropOn(b, slotOf(ctx, b), 0, -near);
    expect(ding).toHaveBeenCalledTimes(2);
    expect(boing).toHaveBeenCalledTimes(1);
    ctx.cleanup();
  });

  it('celebrates, awards a star and deals the next rung (3 strips) with a different picture once all 4 are placed', async () => {
    const { ctx } = mount();
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-ghost')!;
    const first = ghost.textContent;
    solve(ctx);
    expect(q(ctx, '.jigsaw-slot.filled .jigsaw-piece.placed').length).toBe(4);
    expect(q(ctx, '.jigsaw-tray .jigsaw-item').length).toBe(0);
    expect(ctx.stage.querySelector('.jigsaw-board')?.classList.contains('done')).toBe(true);
    expect(ctx.spoken.length).toBe(2);
    expect(`Ghép ${ctx.spoken[1]} nào!`).toBe(ctx.spoken[0]);
    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    expect(ctx.celebrations).toBe(1);
    const board = ctx.stage.querySelector<HTMLElement>('.jigsaw-board')!;
    expect(board.classList.contains('done')).toBe(false);
    expect(board.dataset.style).toBe('strips');
    expect(q(ctx, '.jigsaw-slot').length).toBe(3);
    expect(q(ctx, '.jigsaw-slot.filled').length).toBe(0);
    expect(q(ctx, '.jigsaw-tray .jigsaw-item').length).toBe(3);
    expect(q(ctx, '.jigsaw-piece:not(.placed)').length).toBe(3);
    expect(ghost.textContent).not.toBe(first);
    expect(ctx.spoken.length).toBe(3);
    expect(ctx.spoken[2]?.startsWith('Ghép ')).toBe(true);
    ctx.cleanup();
  });

  it('climbs the ladder: grid 2×2 → strips 3 → diag 4 → grid 3×2 → knobs 2×2 → pie 6, flagging the taller tray past 4 pieces', async () => {
    const { ctx } = mount();
    const wrap = ctx.stage.querySelector<HTMLElement>('.jigsaw')!;
    const board = ctx.stage.querySelector<HTMLElement>('.jigsaw-board')!;
    const rungs: Array<[string, number]> = [
      ['grid', 4],
      ['strips', 3],
      ['diag', 4],
      ['grid', 6],
      ['knobs', 4],
      ['pie', 6],
    ];
    for (const [round, [style, count]] of rungs.entries()) {
      expect(board.dataset.style).toBe(style);
      expect(q(ctx, '.jigsaw-slot').length).toBe(count);
      expect(q(ctx, '.jigsaw-tray .jigsaw-item').length).toBe(count);
      expect(wrap.classList.contains('jigsaw-many')).toBe(count > 4);
      solve(ctx);
      await vi.waitFor(() => expect(ctx.stars).toBe(round + 1));
    }
    ctx.cleanup();
  });

  it('idle hint wiggles the first unplaced piece and its slot', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(6000);
    const piece = ctx.stage.querySelector<HTMLElement>('.jigsaw-tray .jigsaw-piece')!;
    expect(piece.classList.contains('anim-wiggle')).toBe(true);
    const slot = ctx.stage.querySelector(`.jigsaw-slot[data-id="${piece.dataset.id}"]`)!;
    expect(slot.classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with a canvas, paints the picture on the ghost and clips each piece to its own shape and part of the picture', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake2d() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD');
    const ctx = fakeContext();
    game.start(ctx);
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-ghost')!;
    expect(ghost.style.backgroundImage).toContain('data:image/png;base64,QUJD');
    expect(ghost.classList.contains('jigsaw-ghost-plain')).toBe(false);
    expect(ghost.textContent).toBe('');
    const piece = ctx.stage.querySelector<HTMLElement>('.jigsaw-piece[data-id="1"]')!;
    expect(piece.style.backgroundImage).toContain('data:image/png;base64,QUJD');
    expect(piece.textContent).toBe('');
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(0);
    // Without layout (jsdom) nothing is sized; once the board and tray have rects, everything is in px.
    expect(piece.style.clipPath).toBe('');
    layout(ctx);
    window.dispatchEvent(new Event('resize'));
    // Tray: 4 cells of 200×200 in 400×200 → half size, minus 3 % slack → 97 px per cell.
    const item = ctx.stage.querySelector<HTMLElement>('.jigsaw-item[data-id="1"]')!;
    expect(item.style.getPropertyValue('--w')).toBe('97px');
    expect(item.style.getPropertyValue('--h')).toBe('97px');
    expect(piece.style.width).toBe('97px');
    expect(piece.style.height).toBe('97px');
    expect(piece.style.backgroundSize).toBe('194px 194px');
    expect(piece.style.backgroundPosition).toBe('-97px 0px');
    expect(piece.style.clipPath).toBe('path("M0 0L97 0L97 97L0 97Z")');
    // The slot is clipped to the same shape at board scale.
    const slot = ctx.stage.querySelector<HTMLElement>('.jigsaw-slot[data-id="1"]')!;
    expect(slot.style.clipPath).toBe('path("M0 0L200 0L200 200L0 200Z")');
    // Placed: fills the slot, picture at board scale, offset to its own part.
    dropOn(item, slot);
    expect(piece.classList.contains('placed')).toBe(true);
    expect(piece.style.width).toBe('100%');
    expect(piece.style.backgroundSize).toBe('400px 400px');
    expect(piece.style.backgroundPosition).toBe('-200px 0px');
    expect(piece.style.clipPath).toBe('path("M0 0L200 0L200 200L0 200Z")');
    const bottomLeft = ctx.stage.querySelector<HTMLElement>('.jigsaw-piece[data-id="2"]')!;
    expect(bottomLeft.style.backgroundPosition).toBe('0px -97px');
    ctx.cleanup();
  });

  it('without family photos there is no source toggle', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.stage.querySelector('.jigsaw-source')).toBeNull();
    expect(ctx.spoken.length).toBe(1);
    ctx.cleanup();
  });

  it('with family photos starts in photo mode (🖼️ button) and falls back to emoji pieces when the photo cannot be rendered', async () => {
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    // The emoji round is dealt at once; the photo round replaces it once the store has answered.
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(2));
    const button = ctx.stage.querySelector<HTMLElement>('.jigsaw-source')!;
    expect(button).not.toBeNull();
    expect(button.classList.contains('btn-round')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Chọn ảnh');
    expect(button.textContent).toBe('🖼️');
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    // loadImage cannot succeed in jsdom: the round is an ordinary emoji round.
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').length).toBe(4);
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(4);
    expect(ctx.spoken[1]?.startsWith('Ghép ')).toBe(true);
    expect(ctx.spoken[1]).not.toBe('Ghép ảnh nào!');
    ctx.cleanup();
  });

  it('🖼️ opens a picker with a tile per photo plus 🐣: 🐣 deals an emoji round, a photo tile a round of that photo', async () => {
    const ctx = fakeContext();
    const [p1, p2] = await ctx.photos.add([new Blob(['x']), new Blob(['y'])]);
    game.start(ctx);
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(2));
    const button = ctx.stage.querySelector<HTMLElement>('.jigsaw-source')!;
    expect(button.textContent).toBe('🖼️');
    button.dispatchEvent(ptr('pointerdown', 0, 0));
    const overlay = ctx.stage.querySelector<HTMLElement>('.pp-overlay')!;
    expect(overlay).not.toBeNull();
    const tiles = [...overlay.querySelectorAll<HTMLElement>('.pp-tile')];
    expect(tiles.map((t) => t.dataset.id)).toEqual([p1!.id, p2!.id, 'emoji']);
    expect(tiles[0]?.getAttribute('style')).toContain(p1!.url);
    expect(tiles[2]?.textContent).toBe('🐣');
    // Pressing again while it is open does not stack a second picker.
    button.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(q(ctx, '.pp-overlay').length).toBe(1);

    const before = q(ctx, '.jigsaw-piece');
    tiles[2]!.dispatchEvent(ptr('pointerup', 0, 0));
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    expect(ctx.spoken.length).toBe(3);
    expect(ctx.spoken[2]?.startsWith('Ghép ')).toBe(true);
    expect(ctx.spoken[2]).not.toBe('Ghép ảnh nào!');
    const after = q(ctx, '.jigsaw-tray .jigsaw-piece');
    expect(after.length).toBe(4);
    expect(after).not.toContain(before[0]);
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(4);
    expect(button.textContent).toBe('🖼️');
    // Same rung, re-dealt.
    expect(ctx.stage.querySelector<HTMLElement>('.jigsaw-board')?.dataset.style).toBe('grid');

    // A photo tile: photo mode again — without a canvas the round falls back to emoji pieces.
    button.dispatchEvent(ptr('pointerdown', 0, 0));
    ctx.stage.querySelector<HTMLElement>(`.pp-tile[data-id="${p2!.id}"]`)!.dispatchEvent(ptr('pointerup', 0, 0));
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(4));
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').length).toBe(4);
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(4);

    // Dismissing changes nothing.
    button.dispatchEvent(ptr('pointerdown', 0, 0));
    ctx.stage.querySelector<HTMLElement>('.pp-close')!.dispatchEvent(ptr('pointerup', 0, 0));
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    expect(ctx.spoken.length).toBe(4);
    ctx.cleanup();
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
  });

  it('plays the chosen photo and keeps it round after round (no cycling); a removed choice falls back to the first photo', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake2d() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((type?: string) =>
      type === 'image/jpeg' ? 'data:image/jpeg;base64,UEhP' : 'data:image/png;base64,QUJD',
    );
    // Record which photo is rendered: the URL every `Image` is asked to load.
    const loaded: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 40;
        height = 30;
        set src(url: string) {
          loaded.push(url);
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const ctx = fakeContext();
    let n = 0;
    ctx.photos = createPhotoStore(async () => `data:image/jpeg;base64,p${++n}`);
    const [a, b] = await ctx.photos.add([new Blob(['x']), new Blob(['y'])]);
    game.start(ctx);
    // Nothing chosen yet: the first photo.
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(2));
    expect(ctx.spoken[1]).toBe('Ghép ảnh nào!');
    expect(loaded).toEqual([a!.url]);

    const button = ctx.stage.querySelector<HTMLElement>('.jigsaw-source')!;
    button.dispatchEvent(ptr('pointerdown', 0, 0));
    ctx.stage.querySelector<HTMLElement>(`.pp-tile[data-id="${b!.id}"]`)!.dispatchEvent(ptr('pointerup', 0, 0));
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(3));
    expect(ctx.spoken[2]).toBe('Ghép ảnh nào!');
    expect(loaded.at(-1)).toBe(b!.url);
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').every((p) => p.style.backgroundImage.includes('UEhP'))).toBe(true);

    // Next round: still the chosen photo.
    solve(ctx);
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(4));
    expect(ctx.stars).toBe(1);
    expect(loaded.slice(-2)).toEqual([b!.url, b!.url]);

    // The chosen photo is removed: back to the first one, the button stays.
    await ctx.photos.remove(b!.id);
    expect(ctx.stage.querySelector('.jigsaw-source')).not.toBeNull();
    solve(ctx);
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(5));
    expect(loaded.at(-1)).toBe(a!.url);
    ctx.cleanup();
  });

  it('hides the toggle again when the last photo is removed', async () => {
    const ctx = fakeContext();
    const [photo] = await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    await vi.waitFor(() => expect(ctx.stage.querySelector('.jigsaw-source')).not.toBeNull());
    // An open picker closes with it.
    ctx.stage.querySelector<HTMLElement>('.jigsaw-source')!.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(ctx.stage.querySelector('.pp-overlay')).not.toBeNull();
    await ctx.photos.remove(photo!.id);
    expect(ctx.stage.querySelector('.jigsaw-source')).toBeNull();
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    ctx.cleanup();
  });

  it('with a canvas and a loadable image, the ghost and pieces show the family photo and it asks to build the photo', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake2d() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((type?: string) =>
      type === 'image/jpeg' ? 'data:image/jpeg;base64,UEhP' : 'data:image/png;base64,QUJD',
    );
    vi.stubGlobal('Image', fakeImage());
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(2));
    expect(ctx.spoken[1]).toBe('Ghép ảnh nào!');
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-ghost')!;
    expect(ghost.style.backgroundImage).toContain('data:image/jpeg;base64,UEhP');
    expect(ghost.classList.contains('jigsaw-ghost-plain')).toBe(false);
    const pieces = q(ctx, '.jigsaw-tray .jigsaw-piece');
    expect(pieces.length).toBe(4);
    for (const piece of pieces) expect(piece.style.backgroundImage).toContain('data:image/jpeg;base64,UEhP');
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(0);
    // A solved photo round is celebrated without naming anything.
    solve(ctx);
    expect(ctx.spoken.length).toBe(2);
    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    ctx.cleanup();
  });
});
