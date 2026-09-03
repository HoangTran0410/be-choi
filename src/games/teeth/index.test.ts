import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { SONGS } from '../../core/music';
import { SCRUBS_TO_CLEAN, STAINS, TEETH_PER_ROW } from './logic';
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

function ptr(type: string, x: number, y: number, id = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true, bubbles: true });
}

/** jsdom has no layout: every tooth gets its own 80×90 box in a row, everything else is 1200×800 at the origin. */
const TOOTH_W = 80;
const TOOTH_H = 90;
const TOOTH_TOP = 200;
const toothLeft = (id: number): number => 100 + id * 120;

function stubRects(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element): DOMRect {
    if (this.classList.contains('teeth-tooth')) {
      const id = Number(this.getAttribute('data-id'));
      const left = toothLeft(id);
      return {
        x: left,
        y: TOOTH_TOP,
        left,
        top: TOOTH_TOP,
        width: TOOTH_W,
        height: TOOTH_H,
        right: left + TOOTH_W,
        bottom: TOOTH_TOP + TOOTH_H,
        toJSON: () => ({}),
      };
    }
    return { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, toJSON: () => ({}) };
  });
}

const q = <T extends Element = HTMLElement>(ctx: FakeContext, sel: string): T => {
  const el = ctx.stage.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const wrapOf = (ctx: FakeContext): HTMLElement => q(ctx, '.teeth');
const dirtyIds = (ctx: FakeContext): number[] =>
  [...ctx.stage.querySelectorAll<HTMLElement>('.teeth-tooth.teeth-dirty')].map((el) => Number(el.dataset.id));
const tooth = (ctx: FakeContext, id: number): HTMLElement => q(ctx, `.teeth-tooth[data-id="${id}"]`);

/** Press in the dark part of the mouth, rub back and forth over tooth `id`, lift. */
function brushTooth(ctx: FakeContext, id: number, strokes = SCRUBS_TO_CLEAN, lift = true): void {
  const wrap = wrapOf(ctx);
  wrap.dispatchEvent(ptr('pointerdown', 1100, 700));
  for (let i = 0; i < strokes; i++) {
    wrap.dispatchEvent(ptr('pointermove', toothLeft(id) + (i % 2 === 0 ? 15 : 65), TOOTH_TOP + 40));
  }
  if (lift) wrap.dispatchEvent(ptr('pointerup', 0, 0));
}

function squeezePaste(ctx: FakeContext): void {
  q(ctx, '.teeth-tube').dispatchEvent(ptr('pointerdown', 0, 0));
}

function brushAll(ctx: FakeContext): void {
  for (const id of dirtyIds(ctx)) brushTooth(ctx, id);
}

function rinse(ctx: FakeContext): void {
  q(ctx, '.teeth-cup').dispatchEvent(ptr('pointerdown', 0, 0));
}

const tick = (ctx: FakeContext, job: string): HTMLElement => q(ctx, `.teeth-tick[data-job="${job}"]`);
const ticksDone = (ctx: FakeContext): string[] =>
  [...ctx.stage.querySelectorAll<HTMLElement>('.teeth-tick.done')].map((el) => el.dataset.job ?? '');

describe('teeth game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubRects();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts a face, 8 teeth with 3 stains, and a tube, brush and cup all within reach', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const tube = q(ctx, '.teeth-tube');
    const brush = q(ctx, '.teeth-brush');
    const cup = q(ctx, '.teeth-cup');

    expect(ctx.stage.querySelectorAll('.teeth-tooth').length).toBe(TEETH_PER_ROW * 2);
    expect(dirtyIds(ctx).length).toBe(3);
    const stains = [...ctx.stage.querySelectorAll('.teeth-dirty .teeth-stain')];
    expect(stains.length).toBe(3);
    for (const s of stains) expect(STAINS).toContain(s.textContent);
    expect(ctx.stage.querySelectorAll('.teeth-clean .teeth-stain').length).toBe(0);
    expect(tube.textContent).toBe('\u{1F9F4}');
    expect(brush.textContent).toContain('\u{1FAA5}');
    // The cup is never taken away: rinsing early is fun, not a mistake.
    expect(cup.hidden).toBe(false);
    expect(q(ctx, '.teeth-paste').hidden).toBe(true);
    expect(ctx.stage.querySelectorAll('.teeth-tick').length).toBe(3);
    expect(ticksDone(ctx)).toEqual([]);
    expect(ctx.spoken.some((s) => s.startsWith('\u0110\u00e1nh r\u0103ng cho'))).toBe(true);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('brushes from the very first touch, with no paste squeezed at all', () => {
    const ctx = fakeContext();
    const ding = vi.spyOn(ctx.audio, 'ding');
    game.start(ctx);
    const brush = q(ctx, '.teeth-brush');

    const [first] = dirtyIds(ctx);
    if (first === undefined) throw new Error('no dirty tooth');
    brushTooth(ctx, first, SCRUBS_TO_CLEAN, false);
    expect(brush.classList.contains('teeth-brush-active')).toBe(true);
    expect(tooth(ctx, first).classList.contains('teeth-clean')).toBe(true);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBeGreaterThan(0);
    expect(ctx.spoken).not.toContain('B\u00f3p kem tr\u01b0\u1edbc nh\u00e9');
    wrapOf(ctx).dispatchEvent(ptr('pointerup', 0, 0));

    ctx.cleanup();
  });

  it('starts the brushing song on the first stroke and stops it when the last stain goes', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);

    // Nothing plays until there is real brushing going on.
    vi.advanceTimersByTime(20000);
    expect(note).not.toHaveBeenCalled();

    brushTooth(ctx, dirtyIds(ctx)[0] ?? 0, 1);
    expect(note).toHaveBeenCalled();
    expect(note.mock.calls[0]?.[2]).toBe('xylo');
    note.mockClear();
    vi.advanceTimersByTime(40000);
    const songNotes = SONGS[2]?.notes.filter((n) => n.n !== 'R').length ?? 0;
    expect(note.mock.calls.length).toBeGreaterThan(songNotes);

    brushAll(ctx);
    expect(dirtyIds(ctx).length).toBe(0);
    expect(tick(ctx, 'brush').classList.contains('done')).toBe(true);
    note.mockClear();
    vi.advanceTimersByTime(40000);
    expect(note).not.toHaveBeenCalled();

    ctx.cleanup();
  });

  it('lets the child rinse and squeeze paste in any order they like', () => {
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    const pop = vi.spyOn(ctx.audio, 'pop');
    game.start(ctx);

    // Rinsing first is allowed, and splashes properly.
    rinse(ctx);
    expect(puff).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.teeth-splash').length).toBe(6);
    expect(tick(ctx, 'rinse').classList.contains('done')).toBe(true);
    expect(ctx.celebrations).toBe(0);

    // Paste second: still hidden until it is squeezed, then it shows on the brush.
    expect(q(ctx, '.teeth-paste').hidden).toBe(true);
    squeezePaste(ctx);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(q(ctx, '.teeth-paste').hidden).toBe(false);
    expect(tick(ctx, 'paste').classList.contains('done')).toBe(true);
    // Squeezing again does nothing more.
    squeezePaste(ctx);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(ctx.celebrations).toBe(0);

    ctx.cleanup();
  });

  it('shines, celebrates, awards a star and brings a new animal once all three are done', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    const first = q(ctx, '.teeth-face').textContent;

    rinse(ctx);
    squeezePaste(ctx);
    expect(ctx.stars).toBe(0);
    brushAll(ctx);

    expect(ticksDone(ctx).sort()).toEqual(['brush', 'paste', 'rinse']);
    expect(ctx.stage.querySelectorAll('.teeth-tooth.teeth-shine').length).toBe(TEETH_PER_ROW * 2);
    expect(q(ctx, '.teeth-paste').hidden).toBe(true);
    expect(ctx.spoken).toContain('R\u0103ng s\u1ea1ch bong r\u1ed3i! Gi\u1ecfi qu\u00e1!');

    await vi.advanceTimersByTimeAsync(300);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(q(ctx, '.teeth-face').textContent).toBe(first);

    await vi.advanceTimersByTimeAsync(1200);
    expect(q(ctx, '.teeth-face').textContent).not.toBe(first);
    expect(ticksDone(ctx)).toEqual([]);
    expect(dirtyIds(ctx).length).toBe(4);
    expect(ctx.stage.querySelectorAll('.teeth-tooth').length).toBe(TEETH_PER_ROW * 2);
    expect(ctx.stage.querySelectorAll('.teeth-shine').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.teeth-splash').length).toBe(0);
    expect(q(ctx, '.teeth-paste').hidden).toBe(true);
    expect(ctx.spoken.filter((s) => s.startsWith('\u0110\u00e1nh r\u0103ng cho')).length).toBe(2);

    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nothing responds once the animal is done, until the next one arrives', () => {
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    game.start(ctx);

    squeezePaste(ctx);
    brushAll(ctx);
    rinse(ctx);
    expect(puff).toHaveBeenCalledTimes(1);

    rinse(ctx);
    expect(puff).toHaveBeenCalledTimes(1);
    brushTooth(ctx, 0, 3);
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(0);

    ctx.cleanup();
  });

  it('wiggles and asks for something still to do when the child goes quiet', () => {
    const ctx = fakeContext();
    game.start(ctx);
    // Only the paste and the rinse are left, so the hint has to point at one of them.
    brushAll(ctx);
    ctx.spoken.length = 0;
    vi.advanceTimersByTime(6000);
    expect(ctx.stage.querySelectorAll('.teeth-tick.anim-wiggle').length).toBe(1);
    const wiggled = q(ctx, '.teeth-tick.anim-wiggle').dataset.job;
    expect(['paste', 'rinse']).toContain(wiggled);
    expect(ctx.spoken.length).toBe(1);
    // It only asks once per job, however long the child stares at the screen.
    for (let i = 0; i < 6; i++) vi.advanceTimersByTime(6000);
    expect(ctx.spoken.length).toBeLessThanOrEqual(2);

    ctx.cleanup();
  });

  it('cleanup mid-brushing stops the song and leaves no timers or listeners behind', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    squeezePaste(ctx);
    brushTooth(ctx, dirtyIds(ctx)[0] ?? 0, 2, false);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
    note.mockClear();
    vi.advanceTimersByTime(20000);
    expect(note).not.toHaveBeenCalled();
    expect(() => window.dispatchEvent(ptr('pointermove', 5, 5))).not.toThrow();
    expect(() => window.dispatchEvent(ptr('pointerup', 5, 5))).not.toThrow();
  });
});
