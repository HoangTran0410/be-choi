import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { BRICK_COLORS, BRICK_SIZES, FREE_STAR_AFTER, MODELS, SMALL_MODEL_CELLS, centerOffset, deserialize } from './logic';
import game, { STORAGE_KEY } from './index';

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

function ptr(type: string, x = 0, y = 0): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true });
}

/** Plate cell in the stubbed layout: a 10×8 plate at (0, 0) of 400×320 px. */
const CELL = 40;
const PLATE_H = 8 * CELL;

/** jsdom has no layout: give the plate a fixed rect so drops can be resolved to cells. */
function layout(plate: HTMLElement): void {
  const width = Number(plate.dataset.cols) * CELL;
  const height = Number(plate.dataset.rows) * CELL;
  plate.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON: () => ({}),
  });
}

/** Press `el` at (x0, y0), move and release at (x, y). */
function drag(el: HTMLElement, x: number, y: number, x0 = 0, y0 = 0): void {
  el.dispatchEvent(ptr('pointerdown', x0, y0));
  el.dispatchEvent(ptr('pointermove', x, y));
  el.dispatchEvent(ptr('pointerup', x, y));
}

/** Release a template with the pointer over the centre of column `col`. */
function dropAt(el: HTMLElement, col: number): void {
  drag(el, col * CELL + CELL / 2, 100);
}

/** Screen point at the centre of plate cell (x, y). */
function cellCenter(x: number, y: number): { x: number; y: number } {
  return { x: x * CELL + CELL / 2, y: PLATE_H - y * CELL - CELL / 2 };
}

const q = (ctx: { stage: HTMLElement }, sel: string) => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];
const bricks = (ctx: { stage: HTMLElement }) => q(ctx, '.bricks-layer .bricks-brick');
const cellOf = (el: HTMLElement) => [Number(el.style.getPropertyValue('--x')), Number(el.style.getPropertyValue('--y'))];

function mount() {
  const ctx = fakeContext();
  game.start(ctx);
  const plate = ctx.stage.querySelector<HTMLElement>('.bricks-plate')!;
  layout(plate);
  const template = (w: number, h: number) => ctx.stage.querySelector<HTMLElement>(`.bricks-piece[data-w="${w}"][data-h="${h}"]`)!;
  const colorBtn = (color: string) => ctx.stage.querySelector<HTMLElement>(`.bricks-color[data-color="${color}"]`)!;
  return { ctx, plate, template, colorBtn };
}

function enterModelMode(ctx: FakeContext): void {
  ctx.stage.querySelector<HTMLElement>('.bricks-mode')!.dispatchEvent(ptr('pointerdown'));
}

/** Build the current model with 1×1 bricks, bottom row first. */
function buildModel(m: ReturnType<typeof mount>): string {
  const { ctx, template, colorBtn } = m;
  const id = ctx.stage.querySelector<HTMLElement>('.bricks')!.dataset.model!;
  const model = MODELS.find((x) => x.id === id)!;
  const offset = centerOffset(model, 10);
  const cells = [...model.cells].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of cells) {
    colorBtn(c.color).dispatchEvent(ptr('pointerdown'));
    dropAt(template(1, 1), c.x + offset);
  }
  return id;
}

describe('bricks game', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('mounts the plate, 5 templates, 6 colours, trash and mode button in free mode; cleans up', () => {
    const { ctx, plate } = mount();
    const root = ctx.stage.querySelector<HTMLElement>('.bricks')!;
    expect(root.dataset.mode).toBe('free');
    expect(plate.dataset.cols).toBe('10');
    expect(plate.dataset.rows).toBe('8');
    expect(root.style.getPropertyValue('--bricks-cols')).toBe('10');
    expect(ctx.stage.querySelector('.bricks-plate .bricks-ghost')).not.toBeNull();
    expect(ctx.stage.querySelector('.bricks-plate .bricks-layer')).not.toBeNull();
    const templates = q(ctx, '.bricks-tray .bricks-piece');
    expect(templates.length).toBe(5);
    expect(templates.map((t) => `${t.dataset.w}x${t.dataset.h}`)).toEqual(BRICK_SIZES.map((s) => `${s.w}x${s.h}`));
    for (const t of templates) {
      const brick = t.querySelector<HTMLElement>('.bricks-brick')!;
      expect(brick).not.toBeNull();
      expect(brick.style.getPropertyValue('--bricks-color')).toBe(BRICK_COLORS[0]);
    }
    const colors = q(ctx, '.bricks-tray .bricks-color');
    expect(colors.length).toBe(6);
    expect(colors.map((c) => c.dataset.color)).toEqual([...BRICK_COLORS]);
    expect(colors[0]?.classList.contains('active')).toBe(true);
    expect(colors.filter((c) => c.classList.contains('active')).length).toBe(1);
    expect(ctx.stage.querySelector('.bricks-tray .bricks-trash')?.textContent).toBe('🗑️');
    expect(ctx.stage.querySelector('.bricks-tray .bricks-mode')?.textContent).toBe('🏗️');
    expect(bricks(ctx).length).toBe(0);
    expect(q(ctx, '.bricks-ghost-cell').length).toBe(0);
    expect(ctx.spoken).toEqual([]);
    // No stray `click` handlers: everything is Pointer Events.
    window.dispatchEvent(new Event('resize'));
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    window.dispatchEvent(new Event('resize'));
  });

  it('drops a template on the plate at y=0, stacks the next one, bridges, boings when nothing fits', () => {
    const { ctx, template } = mount();
    const pop = vi.spyOn(ctx.audio, 'pop');
    const tick = vi.spyOn(ctx.audio, 'tick');
    const boing = vi.spyOn(ctx.audio, 'boing');
    const one = template(1, 1);

    dropAt(one, 0);
    expect(bricks(ctx).length).toBe(1);
    expect(cellOf(bricks(ctx)[0]!)).toEqual([0, 0]);
    expect(bricks(ctx)[0]!.classList.contains('bricks-land')).toBe(true);
    expect(bricks(ctx)[0]!.style.getPropertyValue('--bricks-color')).toBe(BRICK_COLORS[0]);
    expect(pop).toHaveBeenCalledWith(1.4);
    expect(tick).toHaveBeenCalledTimes(1);
    // The template springs back to the tray.
    expect(one.classList.contains('spring-back')).toBe(true);
    expect(one.parentElement?.classList.contains('bricks-pieces')).toBe(true);

    dropAt(one, 0);
    expect(bricks(ctx).length).toBe(2);
    expect(cellOf(bricks(ctx)[1]!)).toEqual([0, 1]);

    // A 4×1 released with the pointer at column 0 is clamped to the plate and lands on the stack.
    dropAt(template(4, 1), 0);
    expect(cellOf(bricks(ctx)[2]!)).toEqual([0, 2]);
    // Under its far end the plate is empty: a 1×1 there falls to the ground.
    dropAt(one, 3);
    expect(cellOf(bricks(ctx)[3]!)).toEqual([3, 0]);

    // Off the plate: nothing happens.
    drag(one, 5000, 5000);
    expect(bricks(ctx).length).toBe(4);
    expect(boing).toHaveBeenCalledTimes(1);

    // Fill column 0 to the top (rows 3..7), then one more does not fit.
    for (let i = 0; i < 5; i++) dropAt(one, 0);
    expect(bricks(ctx).length).toBe(9);
    dropAt(one, 0);
    expect(bricks(ctx).length).toBe(9);
    expect(boing).toHaveBeenCalledTimes(2);
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
  });

  it('picks colours for new bricks and speaks the colour name', () => {
    const { ctx, template, colorBtn } = mount();
    const blue = BRICK_COLORS[4] as string;
    colorBtn(blue).dispatchEvent(ptr('pointerdown'));
    expect(colorBtn(blue).classList.contains('active')).toBe(true);
    expect(q(ctx, '.bricks-color.active').length).toBe(1);
    expect(ctx.spoken).toEqual(['màu xanh dương']);
    for (const t of q(ctx, '.bricks-piece')) {
      expect(t.querySelector<HTMLElement>('.bricks-brick')!.style.getPropertyValue('--bricks-color')).toBe(blue);
    }
    dropAt(template(2, 1), 4);
    expect(bricks(ctx)[0]!.style.getPropertyValue('--bricks-color')).toBe(blue);
    expect(cellOf(bricks(ctx)[0]!)).toEqual([4, 0]);
    ctx.cleanup();
  });

  it('moves a placed brick with gravity and deletes it when dragged off the plate', () => {
    const { ctx, template } = mount();
    const pop = vi.spyOn(ctx.audio, 'pop');
    dropAt(template(1, 1), 0);
    dropAt(template(1, 1), 5);
    const first = bricks(ctx)[0]!;
    // Grab the brick at (0, 0) and release two cells to the right.
    const from = cellCenter(0, 0);
    drag(first, from.x + 2 * CELL, from.y, from.x, from.y);
    expect(bricks(ctx).length).toBe(2);
    expect(bricks(ctx).map(cellOf)).toEqual([
      [5, 0],
      [2, 0],
    ]);
    expect(first.isConnected).toBe(false);

    // Onto the other brick: it stacks.
    const moved = bricks(ctx)[1]!;
    const at = cellCenter(2, 0);
    drag(moved, cellCenter(5, 0).x, at.y, at.x, at.y);
    expect(bricks(ctx).map(cellOf)).toEqual([
      [5, 0],
      [5, 1],
    ]);

    // Off the plate: gone.
    pop.mockClear();
    const top = bricks(ctx)[1]!;
    const c = cellCenter(5, 1);
    drag(top, 5000, 5000, c.x, c.y);
    expect(bricks(ctx).length).toBe(1);
    expect(cellOf(bricks(ctx)[0]!)).toEqual([5, 0]);
    expect(pop).toHaveBeenCalledWith(0.7);
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
  });

  it('persists the free build in localStorage and restores it on a fresh start', () => {
    const { ctx, template } = mount();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    dropAt(template(2, 2), 3);
    dropAt(template(1, 1), 3);
    const saved = deserialize(localStorage.getItem(STORAGE_KEY) ?? '');
    expect(saved?.bricks.map((b) => [b.x, b.y, b.w, b.h])).toEqual([
      [3, 0, 2, 2],
      [3, 2, 1, 1],
    ]);
    ctx.cleanup();

    const next = mount();
    expect(bricks(next.ctx).map(cellOf)).toEqual([
      [3, 0],
      [3, 2],
    ]);
    // Deleting a brick also saves.
    const c = cellCenter(3, 2);
    drag(bricks(next.ctx)[1]!, 5000, 5000, c.x, c.y);
    expect(deserialize(localStorage.getItem(STORAGE_KEY) ?? '')?.bricks.length).toBe(1);
    next.ctx.cleanup();

    localStorage.setItem(STORAGE_KEY, '{"cols":10,"rows":8,"bricks":[{"id":1,"x":50}]}');
    const garbage = mount();
    expect(bricks(garbage.ctx).length).toBe(0);
    garbage.ctx.cleanup();
  });

  it('mode button shows a small model as ghost cells, says what to build, and parks the free build', () => {
    const m = mount();
    const { ctx, template } = m;
    dropAt(template(3, 1), 6);
    expect(bricks(ctx).length).toBe(1);
    enterModelMode(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.bricks')!;
    expect(root.dataset.mode).toBe('model');
    expect(ctx.stage.querySelector('.bricks-mode')?.textContent).toBe('🎨');
    const model = MODELS.find((x) => x.id === root.dataset.model)!;
    expect(model).toBeDefined();
    expect(model.cells.length).toBeLessThanOrEqual(SMALL_MODEL_CELLS);
    const ghostCells = q(ctx, '.bricks-plate .bricks-ghost .bricks-ghost-cell');
    expect(ghostCells.length).toBe(model.cells.length);
    const offset = centerOffset(model, 10);
    expect(ghostCells.map(cellOf).sort().join(';')).toBe(
      model.cells
        .map((c) => [c.x + offset, c.y])
        .sort()
        .join(';'),
    );
    expect(ghostCells[0]?.style.getPropertyValue('--bricks-color')).toMatch(/^#/);
    expect(ctx.spoken.at(-1)).toBe(`Xây ${model.name} nào!`);
    expect(bricks(ctx).length).toBe(0);
    // Building in model mode does not touch the saved free build.
    dropAt(template(1, 1), 0);
    expect(deserialize(localStorage.getItem(STORAGE_KEY) ?? '')?.bricks.length).toBe(1);
    expect(deserialize(localStorage.getItem(STORAGE_KEY) ?? '')?.bricks[0]?.w).toBe(3);

    // Back to free mode: ghost gone, the parked build is back.
    enterModelMode(ctx);
    expect(root.dataset.mode).toBe('free');
    expect(root.dataset.model).toBeUndefined();
    expect(q(ctx, '.bricks-ghost-cell').length).toBe(0);
    expect(bricks(ctx).map(cellOf)).toEqual([[5, 0]]);
    expect(ctx.celebrations).toBe(0);
    expect(ctx.stars).toBe(0);
    ctx.cleanup();
  });

  it('completing the model celebrates, awards a star, clears the plate and starts a different model', async () => {
    const m = mount();
    const { ctx, plate } = m;
    enterModelMode(ctx);
    const spokenBefore = ctx.spoken.length;
    const firstId = buildModel(m);
    expect(plate.classList.contains('anim-bounce')).toBe(true);
    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    expect(ctx.celebrations).toBe(1);
    const root = ctx.stage.querySelector<HTMLElement>('.bricks')!;
    expect(root.dataset.mode).toBe('model');
    expect(root.dataset.model).not.toBe(firstId);
    const next = MODELS.find((x) => x.id === root.dataset.model)!;
    expect(next.cells.length).toBeLessThanOrEqual(SMALL_MODEL_CELLS);
    expect(bricks(ctx).length).toBe(0);
    expect(q(ctx, '.bricks-ghost-cell').length).toBe(next.cells.length);
    expect(ctx.spoken.length).toBeGreaterThan(spokenBefore);
    expect(ctx.spoken.at(-1)).toBe(`Xây ${next.name} nào!`);
    // Free-mode storage is untouched by model builds.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Second model too: the round counter moves on and it still works.
    buildModel(m);
    await vi.waitFor(() => expect(ctx.stars).toBe(2));
    expect(ctx.celebrations).toBe(2);
    ctx.cleanup();
  });

  it('wrong colours do not complete the model', () => {
    const m = mount();
    const { ctx, template, colorBtn } = m;
    enterModelMode(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.bricks')!;
    const model = MODELS.find((x) => x.id === root.dataset.model)!;
    const offset = centerOffset(model, 10);
    const wrong = BRICK_COLORS.find((c) => !model.cells.some((k) => k.color === c)) as string;
    colorBtn(wrong).dispatchEvent(ptr('pointerdown'));
    for (const c of [...model.cells].sort((a, b) => a.y - b.y || a.x - b.x)) dropAt(template(1, 1), c.x + offset);
    expect(bricks(ctx).length).toBe(model.cells.length);
    expect(ctx.celebrations).toBe(0);
    expect(ctx.stars).toBe(0);
    ctx.cleanup();
  });

  it('free mode awards one star after 30 bricks and never celebrates', () => {
    const { ctx, template } = mount();
    const jingle = vi.spyOn(ctx.audio, 'jingle');
    for (let i = 0; i < FREE_STAR_AFTER + 5; i++) {
      dropAt(template(1, 1), i % 10);
      if (i + 1 < FREE_STAR_AFTER) expect(ctx.stars).toBe(0);
    }
    expect(bricks(ctx).length).toBe(FREE_STAR_AFTER + 5);
    expect(ctx.stars).toBe(1);
    expect(jingle).toHaveBeenCalledTimes(1);
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
  });

  it('holding the trash for 700 ms clears the plate (a short press does not)', () => {
    vi.useFakeTimers();
    const { ctx, template } = mount();
    dropAt(template(2, 1), 1);
    dropAt(template(2, 1), 1);
    expect(bricks(ctx).length).toBe(2);
    const trash = ctx.stage.querySelector<HTMLElement>('.bricks-trash')!;
    trash.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(300);
    trash.dispatchEvent(ptr('pointerup'));
    vi.advanceTimersByTime(700);
    expect(bricks(ctx).length).toBe(2);
    trash.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(700);
    expect(bricks(ctx).length).toBe(0);
    expect(deserialize(localStorage.getItem(STORAGE_KEY) ?? '')?.bricks.length).toBe(0);
    expect(trash.querySelector('.hold-ring')).toBeNull();
    ctx.cleanup();
    // jsdom's localStorage.setItem queues a `storage` event timer; nothing of the game's remains.
    vi.runOnlyPendingTimers();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('idle hint wiggles a template in free mode and the needed colour or template in model mode; cleanup leaves no timers', () => {
    vi.useFakeTimers();
    const { ctx } = mount();
    vi.advanceTimersByTime(6000);
    expect(q(ctx, '.bricks-piece.anim-wiggle').length).toBe(1);
    for (const t of q(ctx, '.anim-wiggle')) t.classList.remove('anim-wiggle');

    enterModelMode(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.bricks')!;
    const model = MODELS.find((x) => x.id === root.dataset.model)!;
    vi.advanceTimersByTime(6000);
    const lowest = [...model.cells].sort((a, b) => a.y - b.y || a.x - b.x)[0]!;
    if (lowest.color === BRICK_COLORS[0]) {
      expect(q(ctx, '.bricks-piece.anim-wiggle').length).toBe(1);
    } else {
      const dot = q(ctx, '.bricks-color.anim-wiggle');
      expect(dot.length).toBe(1);
      expect(dot[0]?.dataset.color).toBe(lowest.color);
    }
    ctx.cleanup();
    vi.runOnlyPendingTimers();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('switches to an 8×10 plate in portrait, keeping the bricks that still fit', () => {
    const { ctx, plate, template } = mount();
    dropAt(template(2, 1), 1);
    dropAt(template(2, 1), 8);
    dropAt(template(1, 1), 1);
    expect(bricks(ctx).map(cellOf)).toEqual([
      [1, 0],
      [8, 0],
      [1, 1],
    ]);
    const mm = vi.fn(() => ({ matches: true }) as MediaQueryList);
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: mm });
    window.dispatchEvent(new Event('resize'));
    expect(plate.dataset.cols).toBe('8');
    expect(plate.dataset.rows).toBe('10');
    const root = ctx.stage.querySelector<HTMLElement>('.bricks')!;
    expect(root.style.getPropertyValue('--bricks-cols')).toBe('8');
    expect(root.style.getPropertyValue('--bricks-rows')).toBe('10');
    // The 2×1 at columns 8–9 no longer fits; the stack at column 1 survives.
    expect(bricks(ctx).map(cellOf)).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(deserialize(localStorage.getItem(STORAGE_KEY) ?? '')?.cols).toBe(8);
    // Model mode centres the target on the narrower plate.
    enterModelMode(ctx);
    const model = MODELS.find((x) => x.id === root.dataset.model)!;
    const xs = q(ctx, '.bricks-ghost-cell').map((c) => cellOf(c)[0] as number);
    expect(Math.min(...xs)).toBe(centerOffset(model, 8));
    // Back to landscape: the ghost is re-centred for 10 columns.
    mm.mockReturnValue({ matches: false } as MediaQueryList);
    window.dispatchEvent(new Event('resize'));
    expect(plate.dataset.cols).toBe('10');
    const xs2 = q(ctx, '.bricks-ghost-cell').map((c) => cellOf(c)[0] as number);
    expect(Math.min(...xs2)).toBe(centerOffset(model, 10));
    ctx.cleanup();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });
});
