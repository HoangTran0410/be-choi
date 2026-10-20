import { HOLD_MS } from './dnd';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { resetFrameLoop } from '../../core/frame';
import { SAVE_KEY } from './quests';
import game from './index';

function ev(el: Element, type: string, x = 0, y = 0): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}
const tap = (el: Element): void => {
  ev(el, 'pointerdown');
  ev(el, 'pointerup');
};
const item = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.rb-item[data-robot="${id}"]`)!;
const slot = (root: HTMLElement, n: number) => root.querySelector<HTMLElement>(`.rb-slot[data-slot="${n}"]`)!;

describe('Ban nhạc robot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('be-choi:robots:hello', '1'); // already welcomed: the tests below expect silence
  });
  afterEach(() => {
    resetFrameLoop();
    vi.useRealTimers();
  });

  it('welcomes a first-time child with one short sentence, and never again', () => {
    localStorage.clear();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(2000);
    expect(ctx.sequenced).toEqual(['Kéo robot lên sân khấu nhé!']);
    ctx.cleanup();
    const again = fakeContext();
    game.start(again);
    vi.advanceTimersByTime(2000);
    expect(again.sequenced).toEqual([]);
    again.cleanup();
  });

  it('starts with an empty stage of 8 seats and 5 robots on the shelf', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.rb-slot').length).toBe(8);
    expect(ctx.stage.querySelectorAll('.rb-slot.has-bot').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.rb-item').length).toBe(5);
    ctx.cleanup();
  });

  it('tap a robot, tap a seat: it stands there and plays on the next beat in time, without a word', () => {
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    tap(item(ctx.stage, 'kick'));
    expect(item(ctx.stage, 'kick').classList.contains('picked')).toBe(true);
    tap(slot(ctx.stage, 2));
    expect(slot(ctx.stage, 2).classList.contains('has-bot')).toBe(true);
    expect(item(ctx.stage, 'kick').classList.contains('on-stage')).toBe(true);
    expect(ctx.sequenced).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(drum).toHaveBeenCalled();
    expect(drum.mock.calls[0]![0]).toBe('kick');
    expect(ctx.sequenced).toEqual([]);
    ctx.cleanup();
  });

  it('counts the robots and a drop on a taken seat just swaps who stands there', () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (const [id, s] of [
      ['kick', 0],
      ['bass', 1],
    ] as const) {
      tap(item(ctx.stage, id));
      tap(slot(ctx.stage, s));
      vi.advanceTimersByTime(4000);
    }
    expect(ctx.stage.querySelectorAll('.rb-slot.has-bot').length).toBe(2);
    expect(ctx.sequenced).toEqual([]);
    // The name is written, not said.
    expect(item(ctx.stage, 'bass').querySelector('.rb-label')!.textContent).toBe('đàn bass');
    expect(slot(ctx.stage, 1).dataset.name).toBe('đàn bass');
    ctx.cleanup();
  });

  it('tapping a robot on stage changes its play style (1–3 dots); holding it sends it away with a wave', () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(item(ctx.stage, 'piano'));
    tap(slot(ctx.stage, 0));
    const bot = ctx.stage.querySelector<HTMLElement>('.rb-slot[data-slot="0"] .rb-bot')!;
    const lit = () => bot.querySelectorAll('.rb-dot.on').length;
    expect(lit()).toBe(2);
    tap(bot);
    expect(lit()).toBe(3);
    vi.advanceTimersByTime(200);
    tap(bot);
    expect(lit()).toBe(1);
    // hold
    ev(bot, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS + 100);
    ev(bot, 'pointerup');
    expect(slot(ctx.stage, 0).classList.contains('has-bot')).toBe(false);
    expect(ctx.stage.querySelector('.rb-away .rb-bot')).not.toBeNull();
    expect(item(ctx.stage, 'piano').classList.contains('on-stage')).toBe(false);
    ctx.cleanup();
  });

  it('the song button cycles the five songs and remembers them for the goal', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.rb')!;
    expect(root.dataset.song).toBe('fun');
    const btn = ctx.stage.querySelector<HTMLElement>('.rb-song')!;
    tap(btn);
    expect(root.dataset.song).toBe('disco');
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now + 1000);
    tap(btn);
    expect(root.dataset.song).toBe('calm');
    vi.spyOn(performance, 'now').mockReturnValue(now + 2000);
    tap(btn);
    expect(root.dataset.song).toBe('latin');
    vi.spyOn(performance, 'now').mockReturnValue(now + 3000);
    tap(btn);
    expect(root.dataset.song).toBe('east');
    vi.spyOn(performance, 'now').mockReturnValue(now + 4000);
    tap(btn);
    expect(root.dataset.song).toBe('fun');
    expect(ctx.sequenced).toEqual([]);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    expect(saved.v).toBe(1);
    expect(saved.tried.sort()).toEqual(['calm', 'disco', 'east', 'fun', 'latin']);
    ctx.cleanup();
  });

  it('finishing the first goal gives a star and unlocks two robots', () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (const [id, s] of [
      ['kick', 0],
      ['piano', 1],
      ['xylo', 2],
    ] as const) {
      tap(item(ctx.stage, id));
      tap(slot(ctx.stage, s));
      vi.advanceTimersByTime(300);
    }
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelectorAll('.rb-item').length).toBe(7);
    expect(ctx.stage.querySelector('.rb-reward')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).done).toContain('trio');
    ctx.cleanup();
  });

  it('a full stage is celebrated once, and again only after it has been emptied', async () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, done: ['trio', 'four'], tried: [], fullIn: [], last: [], song: 'fun' }));
    const ctx = fakeContext();
    game.start(ctx);
    const ids = ['kick', 'bass', 'piano', 'guitar', 'xylo', 'snare', 'bell', 'flute'];
    ids.forEach((id, i) => {
      tap(item(ctx.stage, id));
      tap(slot(ctx.stage, i));
      vi.advanceTimersByTime(200);
    });
    await vi.advanceTimersByTimeAsync(8000);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.sequenced).toEqual(['Đủ cả ban nhạc rồi!']);
    ctx.cleanup();
  });

  it('gives a gentle hint about what is missing: a shelf robot wobbles, nobody talks', () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(item(ctx.stage, 'kick'));
    tap(slot(ctx.stage, 0));
    vi.advanceTimersByTime(10000);
    expect(ctx.sequenced).toEqual([]);
    expect(item(ctx.stage, 'bass').classList.contains('nudge')).toBe(true);
    ctx.cleanup();
  });

  it('wears family photos as faces and as the backdrop, and copes with none', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await ctx.photos.add([new Blob(['a'])]);
    tap(item(ctx.stage, 'kick'));
    tap(slot(ctx.stage, 0));
    await vi.advanceTimersByTimeAsync(50);
    const photo = ctx.stage.querySelector<HTMLElement>('.rb-slot[data-slot="0"] .rb-photo')!;
    expect(photo.style.display).toBe('');
    expect(ctx.stage.querySelector<HTMLElement>('.rb-backdrop')!.style.backgroundImage).toContain('data:image');
    ctx.cleanup();
  });

  it('leaves nothing running when the child leaves', async () => {
    const ctx = fakeContext();
    const before = vi.getTimerCount();
    game.start(ctx);
    tap(item(ctx.stage, 'kick'));
    tap(slot(ctx.stage, 0));
    await vi.advanceTimersByTimeAsync(2000);
    ctx.cleanup();
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
  });
});
