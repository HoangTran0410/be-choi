import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PICTURES } from './logic';
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

/** jsdom has no layout: give slot (r, c) the rect x ∈ [c·200, c·200+100], y ∈ [r·200, r·200+100]. */
function layout(slots: HTMLElement[]): void {
  for (const el of slots) {
    const left = Number(el.dataset.c) * 200;
    const top = Number(el.dataset.r) * 200;
    el.getBoundingClientRect = () => ({
      x: left, y: top, left, top, width: 100, height: 100, right: left + 100, bottom: top + 100, toJSON: () => ({}),
    });
  }
}

/** Drag `piece` from the origin and release it at (x, y). */
function drop(piece: HTMLElement, x: number, y: number): void {
  piece.dispatchEvent(ptr('pointerdown', 0, 0));
  piece.dispatchEvent(ptr('pointermove', x, y));
  piece.dispatchEvent(ptr('pointerup', x, y));
}

/** Release `piece` in the centre of the cell (r, c). */
function dropAt(piece: HTMLElement, r: number, c: number): void {
  drop(piece, c * 200 + 50, r * 200 + 50);
}

function mount() {
  const ctx = fakeContext();
  game.start(ctx);
  const slots = [...ctx.stage.querySelectorAll<HTMLElement>('.jigsaw-slot')];
  layout(slots);
  return { ctx, slots };
}

const q = (ctx: { stage: HTMLElement }, sel: string) => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];

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

  it('mounts a 2×2 board with ghost and 4 tray pieces, says what to build, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const wrap = ctx.stage.querySelector<HTMLElement>('.jigsaw')!;
    expect(wrap).not.toBeNull();
    expect(wrap.classList.contains('jigsaw-many')).toBe(false);
    expect(q(ctx, '.jigsaw-board .jigsaw-slot').length).toBe(4);
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').length).toBe(4);
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-board .jigsaw-ghost')!;
    expect(ghost).not.toBeNull();
    // No canvas in jsdom: the ghost and pieces fall back to colour + emoji.
    expect(PICTURES.some((i) => i.emoji === ghost.textContent)).toBe(true);
    expect(ghost.classList.contains('jigsaw-ghost-plain')).toBe(true);
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(4);
    const cells = q(ctx, '.jigsaw-piece').map((p) => `${p.dataset.r},${p.dataset.c}`).sort();
    expect(cells).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect(ctx.spoken.length).toBe(1);
    expect(ctx.spoken[0]?.startsWith('Ghép ')).toBe(true);
    expect(ctx.spoken[0]?.endsWith(' nào!')).toBe(true);
    window.dispatchEvent(new Event('resize'));
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    window.dispatchEvent(new Event('resize'));
  });

  it('springs back from the wrong cell, snaps into the right one', () => {
    const { ctx, slots } = mount();
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const piece = ctx.stage.querySelector<HTMLElement>('.jigsaw-piece')!;
    const r = Number(piece.dataset.r);
    const c = Number(piece.dataset.c);
    const wrong = slots.find((s) => Number(s.dataset.r) !== r || Number(s.dataset.c) !== c)!;

    dropAt(piece, Number(wrong.dataset.r), Number(wrong.dataset.c));
    expect(boing).toHaveBeenCalledTimes(1);
    expect(ding).not.toHaveBeenCalled();
    expect(piece.classList.contains('placed')).toBe(false);
    expect(piece.classList.contains('spring-back')).toBe(true);
    expect(piece.parentElement?.classList.contains('jigsaw-tray')).toBe(true);
    expect(wrong.classList.contains('filled')).toBe(false);

    // Far from every cell: also a miss.
    drop(piece, 5000, 5000);
    expect(boing).toHaveBeenCalledTimes(2);

    dropAt(piece, r, c);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(piece.classList.contains('placed')).toBe(true);
    expect(piece.style.transform).toBe('');
    const own = slots.find((s) => Number(s.dataset.r) === r && Number(s.dataset.c) === c)!;
    expect(own.classList.contains('filled')).toBe(true);
    expect(own.contains(piece)).toBe(true);
    expect(ctx.stage.querySelector('.jigsaw-board')?.classList.contains('done')).toBe(false);
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
  });

  it('celebrates, awards a star and starts a fresh round with a different picture once all 4 are placed', async () => {
    const { ctx } = mount();
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-ghost')!;
    const first = ghost.textContent;
    for (const piece of q(ctx, '.jigsaw-piece')) dropAt(piece, Number(piece.dataset.r), Number(piece.dataset.c));
    expect(q(ctx, '.jigsaw-slot.filled .jigsaw-piece.placed').length).toBe(4);
    expect(ctx.stage.querySelector('.jigsaw-board')?.classList.contains('done')).toBe(true);
    expect(ctx.spoken.length).toBe(2);
    expect(`Ghép ${ctx.spoken[1]} nào!`).toBe(ctx.spoken[0]);
    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stage.querySelector('.jigsaw-board')?.classList.contains('done')).toBe(false);
    expect(q(ctx, '.jigsaw-slot').length).toBe(4);
    expect(q(ctx, '.jigsaw-slot.filled').length).toBe(0);
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece:not(.placed)').length).toBe(4);
    expect(ghost.textContent).not.toBe(first);
    expect(ctx.spoken.length).toBe(3);
    expect(ctx.spoken[2]?.startsWith('Ghép ')).toBe(true);
    ctx.cleanup();
  });

  it('grows to 3×2 and 3×3 over the rounds and flags the taller tray', async () => {
    const { ctx } = mount();
    const wrap = ctx.stage.querySelector<HTMLElement>('.jigsaw')!;
    const board = ctx.stage.querySelector<HTMLElement>('.jigsaw-board')!;
    for (let round = 0; round < 4; round++) {
      const slots = q(ctx, '.jigsaw-slot');
      layout(slots);
      for (const piece of q(ctx, '.jigsaw-tray .jigsaw-piece')) {
        dropAt(piece, Number(piece.dataset.r), Number(piece.dataset.c));
      }
      await vi.waitFor(() => expect(ctx.stars).toBe(round + 1));
    }
    expect(q(ctx, '.jigsaw-slot').length).toBe(9);
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').length).toBe(9);
    expect(wrap.classList.contains('jigsaw-many')).toBe(true);
    expect(board.style.getPropertyValue('--jigsaw-cols')).toBe('3');
    expect(board.style.getPropertyValue('--jigsaw-rows')).toBe('3');
    ctx.cleanup();
  });

  it('idle hint wiggles the first unplaced piece and its cell', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(6000);
    const piece = ctx.stage.querySelector<HTMLElement>('.jigsaw-piece')!;
    expect(piece.classList.contains('anim-wiggle')).toBe(true);
    const slot = ctx.stage.querySelector(`.jigsaw-slot[data-r="${piece.dataset.r}"][data-c="${piece.dataset.c}"]`)!;
    expect(slot.classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with a canvas, paints the picture on the ghost and each piece shows its own cell', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake2d() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD');
    const ctx = fakeContext();
    game.start(ctx);
    const ghost = ctx.stage.querySelector<HTMLElement>('.jigsaw-ghost')!;
    expect(ghost.style.backgroundImage).toContain('data:image/png;base64,QUJD');
    expect(ghost.classList.contains('jigsaw-ghost-plain')).toBe(false);
    expect(ghost.textContent).toBe('');
    const piece = ctx.stage.querySelector<HTMLElement>('.jigsaw-piece[data-r="0"][data-c="1"]')!;
    expect(piece.style.backgroundImage).toContain('data:image/png;base64,QUJD');
    expect(piece.style.backgroundSize).toBe('200% 200%');
    expect(piece.style.backgroundPosition).toBe('100% 0%');
    expect(piece.textContent).toBe('');
    expect(ctx.stage.querySelector<HTMLElement>('.jigsaw-piece[data-r="1"][data-c="0"]')!.style.backgroundPosition).toBe(
      '0% 100%',
    );
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

  it('with family photos starts in photo mode (🐣) and falls back to emoji pieces when the photo cannot be rendered', async () => {
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    // The emoji round is dealt at once; the photo round replaces it once the store has answered.
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(2));
    const toggle = ctx.stage.querySelector<HTMLElement>('.jigsaw-source')!;
    expect(toggle).not.toBeNull();
    expect(toggle.classList.contains('btn-round')).toBe(true);
    expect(toggle.getAttribute('aria-label')).toBe('Đổi ảnh');
    expect(toggle.textContent).toBe('🐣');
    // loadImage cannot succeed in jsdom: the round is an ordinary emoji round.
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').length).toBe(4);
    expect(q(ctx, '.jigsaw-piece-plain').length).toBe(4);
    expect(ctx.spoken[1]?.startsWith('Ghép ')).toBe(true);
    expect(ctx.spoken[1]).not.toBe('Ghép ảnh nào!');
    ctx.cleanup();
  });

  it('tapping the toggle switches to emoji mode (📷) and re-deals a round of the same size, and back', async () => {
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(2));
    const toggle = ctx.stage.querySelector<HTMLElement>('.jigsaw-source')!;
    const before = q(ctx, '.jigsaw-piece');
    toggle.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(toggle.textContent).toBe('📷');
    expect(ctx.spoken.length).toBe(3);
    const after = q(ctx, '.jigsaw-tray .jigsaw-piece');
    expect(after.length).toBe(4);
    expect(after).not.toContain(before[0]);
    expect(q(ctx, '.jigsaw-slot').length).toBe(4);
    toggle.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(toggle.textContent).toBe('🐣');
    await vi.waitFor(() => expect(ctx.spoken.length).toBe(4));
    expect(q(ctx, '.jigsaw-tray .jigsaw-piece').length).toBe(4);
    ctx.cleanup();
  });

  it('hides the toggle again when the last photo is removed', async () => {
    const ctx = fakeContext();
    const [photo] = await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    await vi.waitFor(() => expect(ctx.stage.querySelector('.jigsaw-source')).not.toBeNull());
    await ctx.photos.remove(photo!.id);
    expect(ctx.stage.querySelector('.jigsaw-source')).toBeNull();
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
    ctx.cleanup();
  });
});
