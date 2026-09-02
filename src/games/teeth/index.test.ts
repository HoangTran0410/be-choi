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

describe('teeth game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubRects();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts a face, 8 teeth with 3 stains, tube, brush and a hidden cup; brushing before paste only warns once', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const wrap = wrapOf(ctx);
    const tube = q(ctx, '.teeth-tube');
    const brush = q(ctx, '.teeth-brush');
    const cup = q(ctx, '.teeth-cup');

    expect(q(ctx, '.teeth-face').textContent?.length).toBeGreaterThan(0);
    expect(ctx.stage.querySelectorAll('.teeth-tooth').length).toBe(TEETH_PER_ROW * 2);
    expect(ctx.stage.querySelectorAll('.teeth-row-top .teeth-tooth.teeth-top').length).toBe(TEETH_PER_ROW);
    expect(ctx.stage.querySelectorAll('.teeth-row-bottom .teeth-tooth.teeth-bottom').length).toBe(TEETH_PER_ROW);
    expect(dirtyIds(ctx).length).toBe(3);
    const stains = [...ctx.stage.querySelectorAll('.teeth-dirty .teeth-stain')];
    expect(stains.length).toBe(3);
    for (const s of stains) expect(STAINS).toContain(s.textContent);
    expect(ctx.stage.querySelectorAll('.teeth-clean .teeth-stain').length).toBe(0);
    expect(tube.textContent).toBe('🧴');
    expect(brush.textContent).toContain('🪥');
    expect(cup.hidden).toBe(true);
    expect(q(ctx, '.teeth-paste').hidden).toBe(true);
    expect(wrap.dataset.phase).toBe('paste');
    expect(ctx.spoken.some((s) => s.startsWith('Đánh răng cho'))).toBe(true);

    // Trying to brush before squeezing the paste: one reminder, no brush, no scrub.
    const before = dirtyIds(ctx);
    brushTooth(ctx, before[0] ?? 0, SCRUBS_TO_CLEAN, false);
    expect(ctx.spoken.filter((s) => s === 'Bóp kem trước nhé').length).toBe(1);
    expect(brush.classList.contains('teeth-brush-active')).toBe(false);
    expect(tube.classList.contains('anim-wiggle')).toBe(true);
    wrap.dispatchEvent(ptr('pointerup', 0, 0));
    brushTooth(ctx, before[0] ?? 0);
    expect(ctx.spoken.filter((s) => s === 'Bóp kem trước nhé').length).toBe(1);
    expect(dirtyIds(ctx)).toEqual(before);
    expect(tooth(ctx, before[0] ?? 0).style.getPropertyValue('--teeth-progress')).toBe('');
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(0);

    // Idle hint in the paste phase wiggles the tube.
    tube.classList.remove('anim-wiggle');
    vi.advanceTimersByTime(6000);
    expect(tube.classList.contains('anim-wiggle')).toBe(true);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('squeezes paste, scrubs a stain away with foam, ticks, a ding and a looping song, then asks to rinse', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const pop = vi.spyOn(ctx.audio, 'pop');
    const tick = vi.spyOn(ctx.audio, 'tick');
    const ding = vi.spyOn(ctx.audio, 'ding');
    game.start(ctx);
    const wrap = wrapOf(ctx);
    const brush = q(ctx, '.teeth-brush');
    const cup = q(ctx, '.teeth-cup');

    squeezePaste(ctx);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(q(ctx, '.teeth-paste').hidden).toBe(false);
    expect(wrap.dataset.phase).toBe('brush');
    expect(ctx.spoken).toContain('Bóp kem đánh răng, rồi chải nhé!');
    // The brushing song starts at once and keeps looping for as long as the child brushes.
    expect(note).toHaveBeenCalled();
    expect(note.mock.calls[0]?.[2]).toBe('xylo');
    note.mockClear();
    vi.advanceTimersByTime(40000);
    const songNotes = SONGS[2]?.notes.filter((n) => n.n !== 'R').length ?? 0;
    expect(note.mock.calls.length).toBeGreaterThan(songNotes);
    // Squeezing again does nothing more.
    squeezePaste(ctx);
    expect(pop).toHaveBeenCalledTimes(1);

    // Idle hint while brushing: a dirty tooth and the brush wiggle.
    vi.advanceTimersByTime(6000);
    expect(ctx.stage.querySelector('.teeth-dirty.anim-wiggle')).not.toBeNull();
    expect(brush.classList.contains('anim-wiggle')).toBe(true);

    // Five strokes: progress but still dirty. The brush follows the finger; foam and ticks are throttled.
    const [first] = dirtyIds(ctx);
    if (first === undefined) throw new Error('no dirty tooth');
    brushTooth(ctx, first, SCRUBS_TO_CLEAN - 1, false);
    expect(brush.classList.contains('teeth-brush-active')).toBe(true);
    expect(brush.style.left).not.toBe('');
    expect(tooth(ctx, first).classList.contains('teeth-dirty')).toBe(true);
    expect(tooth(ctx, first).style.getPropertyValue('--teeth-progress')).toBe(((SCRUBS_TO_CLEAN - 1) / SCRUBS_TO_CLEAN).toFixed(2));
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(1);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(ding).not.toHaveBeenCalled();
    // Barely moving does not count as a stroke.
    wrap.dispatchEvent(ptr('pointermove', toothLeft(first) + 16, TOOTH_TOP + 41));
    expect(tooth(ctx, first).classList.contains('teeth-dirty')).toBe(true);
    // The sixth real stroke cleans it: stain gone, sparkle, ding.
    wrap.dispatchEvent(ptr('pointermove', toothLeft(first) + 65, TOOTH_TOP + 40));
    expect(tooth(ctx, first).classList.contains('teeth-dirty')).toBe(false);
    expect(tooth(ctx, first).classList.contains('teeth-clean')).toBe(true);
    expect(tooth(ctx, first).querySelector('.teeth-stain')).toBeNull();
    expect(tooth(ctx, first).querySelector('.teeth-sparkle')).not.toBeNull();
    expect(ding).toHaveBeenCalledTimes(1);
    expect(dirtyIds(ctx).length).toBe(2);
    wrap.dispatchEvent(ptr('pointerup', 0, 0));
    expect(brush.classList.contains('teeth-brush-active')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.teeth-sparkle').length).toBe(0);

    // Rubbing a clean tooth is harmless fun: foam, no second ding.
    brushTooth(ctx, first);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(1);
    // A second finger is ignored while the first is down.
    wrap.dispatchEvent(ptr('pointerdown', 1100, 700, 1));
    wrap.dispatchEvent(ptr('pointerdown', 1100, 700, 2));
    wrap.dispatchEvent(ptr('pointermove', toothLeft(dirtyIds(ctx)[0] ?? 0) + 15, TOOTH_TOP + 40, 2));
    expect(dirtyIds(ctx).length).toBe(2);
    wrap.dispatchEvent(ptr('pointerup', 0, 0, 2));
    expect(brush.classList.contains('teeth-brush-active')).toBe(true);
    wrap.dispatchEvent(ptr('pointercancel', 0, 0, 1));
    expect(brush.classList.contains('teeth-brush-active')).toBe(false);

    // Every tooth clean: rinse time, the song stops, the cup appears.
    expect(cup.hidden).toBe(true);
    brushAll(ctx);
    expect(dirtyIds(ctx).length).toBe(0);
    expect(ding).toHaveBeenCalledTimes(3);
    expect(ctx.spoken).toContain('Súc miệng nào!');
    expect(wrap.dataset.phase).toBe('rinse');
    expect(cup.hidden).toBe(false);
    note.mockClear();
    vi.advanceTimersByTime(30000);
    expect(note).not.toHaveBeenCalled();
    // Hint now points at the cup; touching the stage no longer moves the brush.
    expect(cup.classList.contains('anim-wiggle')).toBe(true);
    wrap.dispatchEvent(ptr('pointerdown', 1100, 700));
    expect(brush.classList.contains('teeth-brush-active')).toBe(false);
    wrap.dispatchEvent(ptr('pointerup', 0, 0));
    expect(ctx.celebrations).toBe(0);

    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rinsing splashes, praises, celebrates, awards a star and brings a new animal with more stains', async () => {
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    const pop = vi.spyOn(ctx.audio, 'pop');
    game.start(ctx);
    const wrap = wrapOf(ctx);
    const cup = q(ctx, '.teeth-cup');
    const first = q(ctx, '.teeth-face').textContent;

    // The cup does nothing before its time.
    cup.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(puff).not.toHaveBeenCalled();

    squeezePaste(ctx);
    expect(pop).toHaveBeenCalledTimes(1);
    brushTooth(ctx, dirtyIds(ctx)[0] ?? 0, 2, false);
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(1);
    wrap.dispatchEvent(ptr('pointerup', 0, 0));
    brushAll(ctx);
    expect(wrap.dataset.phase).toBe('rinse');

    cup.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(puff).toHaveBeenCalledTimes(1);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.teeth-foam').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.teeth-splash').length).toBe(6);
    expect(ctx.stage.querySelectorAll('.teeth-tooth.teeth-shine').length).toBe(TEETH_PER_ROW * 2);
    expect(cup.hidden).toBe(true);
    expect(q(ctx, '.teeth-paste').hidden).toBe(true);
    expect(wrap.dataset.phase).toBe('done');
    expect(ctx.spoken).toContain('Răng sạch bong rồi! Giỏi quá!');
    // A second tap on the (hidden) cup is ignored.
    cup.dispatchEvent(ptr('pointerdown', 0, 0));
    expect(puff).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(pop).toHaveBeenCalledTimes(2);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(q(ctx, '.teeth-face').textContent).toBe(first);

    await vi.advanceTimersByTimeAsync(1200);
    expect(q(ctx, '.teeth-face').textContent).not.toBe(first);
    expect(wrap.dataset.phase).toBe('paste');
    expect(dirtyIds(ctx).length).toBe(4);
    expect(ctx.stage.querySelectorAll('.teeth-tooth').length).toBe(TEETH_PER_ROW * 2);
    expect(ctx.stage.querySelectorAll('.teeth-shine').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.teeth-splash').length).toBe(0);
    expect(cup.hidden).toBe(true);
    expect(ctx.spoken.filter((s) => s.startsWith('Đánh răng cho')).length).toBe(2);
    // The reminder is fresh for the new animal.
    wrap.dispatchEvent(ptr('pointerdown', 1100, 700));
    wrap.dispatchEvent(ptr('pointerup', 0, 0));
    expect(ctx.spoken.filter((s) => s === 'Bóp kem trước nhé').length).toBe(1);

    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
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
