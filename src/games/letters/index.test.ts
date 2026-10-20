import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';
import { initialOf } from './logic';

const tap = (el: Element | null | undefined): void => {
  expect(el).toBeTruthy();
  el!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
};
const q = (ctx: { stage: HTMLElement }, sel: string): Element | null => ctx.stage.querySelector(sel);
const qa = (ctx: { stage: HTMLElement }, sel: string): Element[] => [...ctx.stage.querySelectorAll(sel)];
const flush = () => vi.advanceTimersByTimeAsync(3000);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

describe('letters game', () => {
  it('Nghe & học: a letter opens big, says its name then its three words, and a page of them celebrates', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    const tiles = qa(ctx, '.letter-tile');
    expect(tiles.length).toBe(10);
    // 3 big mode buttons, each at least 72px by style (checked in css) and present
    expect(qa(ctx, '.mode-btn').length).toBe(3);
    tap(tiles[3]);
    expect(ctx.sequenced.slice(0, 4)).toEqual(['bê', 'bóng', 'bò', 'bánh']);
    const cards = qa(ctx, '.word-card');
    expect(cards.length).toBe(3);
    expect(cards.every((c) => !c.classList.contains('hidden'))).toBe(true);
    expect(q(ctx, '.word-card .first')!.textContent).toBe('b');
    // tapping one picture says the opening sound then the word
    tap(cards[1]);
    expect(ctx.sequenced.slice(-2)).toEqual(['bờ', 'bò']);
    // tapping the same letter again is harmless
    expect(ctx.celebrations).toBe(0);
    // touching all ten, in any order, with the close button between them
    for (const t of [...tiles].reverse()) {
      tap(t);
      tap(q(ctx, '.focus-btn.close'));
    }
    await flush();
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(q(ctx, '.letter-tile .cap')!.textContent).toBe('H');
    ctx.cleanup();
  });

  it('Nghe & học: arrows move to the next letter, interrupting the old reading', () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(qa(ctx, '.letter-tile')[0]);
    tap(q(ctx, '.focus-btn.next'));
    expect(ctx.sequenced.slice(-4)).toEqual(['á', 'ăn cơm', 'ăn kem', 'ăng ten']);
    tap(q(ctx, '.focus-btn.prev'));
    expect(ctx.sequenced[ctx.sequenced.length - 4]).toBe('a');
    ctx.cleanup();
  });

  it('digits are counted out loud with the pictures appearing one by one', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (let page = 0; page < 3; page++) {
      for (const t of qa(ctx, '.letter-tile')) {
        tap(t);
        tap(q(ctx, '.focus-btn.close'));
      }
      await flush();
    }
    expect(ctx.stars).toBe(3);
    const tiles = qa(ctx, '.letter-tile');
    expect(tiles.length).toBe(10);
    tap(tiles[3]);
    expect(ctx.sequenced.slice(-5)).toEqual(['ba', 'một', 'hai', 'ba', 'ba']);
    const items = qa(ctx, '.count-item');
    expect(items.length).toBe(3);
    expect(items.every((i) => !i.classList.contains('hidden'))).toBe(true);
    tap(items[2]);
    expect(items[2]!.querySelector('.badge')!.textContent).toBe('1');
    ctx.cleanup();
  });

  it('Tìm chữ: a wrong touch only wiggles and speaks gently; the right one fills a star; five make a celebration', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(qa(ctx, '.mode-btn')[1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.sequenced.slice(0, 1)).toEqual(['Chữ']);
    for (let round = 0; round < 5; round++) {
      const prompt = q(ctx, '.prompt-text b')!.textContent!;
      const opts = qa(ctx, '.quiz-opt');
      expect(opts.length).toBeGreaterThanOrEqual(2);
      const label = prompt.charAt(0);
      // letters are asked by their face, pictures by the word they show
      const right = opts.find((o) => (prompt.length > 1 ? initialOf(o.getAttribute('aria-label')!) : o.getAttribute('aria-label')) === label)!;
      const wrong = opts.find((o) => o !== right)!;
      const before = ctx.sequenced.length;
      if (round === 0) {
        tap(wrong);
        expect(ctx.sequenced.length).toBeGreaterThan(before);
        expect(ctx.sequenced.join(' ')).toMatch(/Đây là chữ .* mình tìm chữ .* nhé/);
        expect(wrong.classList.contains('good')).toBe(false);
        expect(ctx.celebrations).toBe(0);
      }
      tap(right);
      expect(right.classList.contains('good')).toBe(true);
      await vi.advanceTimersByTimeAsync(4000);
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('Đếm số: asks how many, wrong touch counts them out, right one moves on', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(qa(ctx, '.mode-btn')[2]);
    await vi.advanceTimersByTimeAsync(500);
    expect(q(ctx, '.prompt-text')!.textContent).toMatch(/^Có mấy /);
    const count = Number(q(ctx, '.count-field')!.getAttribute('data-count'));
    const opts = qa(ctx, '.quiz-opt');
    const wrong = opts.find((o) => o.getAttribute('aria-label') !== String(count))!;
    tap(wrong);
    expect(ctx.sequenced.join(' ')).toContain('mình đếm nhé');
    // touching a picture counts it
    const items = qa(ctx, '.count-item');
    expect(items.length).toBe(count);
    tap(items[0]);
    expect(items[0]!.querySelector('.badge')!.textContent).toBe('1');
    tap(opts.find((o) => o.getAttribute('aria-label') === String(count)));
    await vi.advanceTimersByTimeAsync(4000);
    expect(ctx.stars).toBe(0);
    expect(q(ctx, '.quiz-star.on')).toBeTruthy();
    ctx.cleanup();
  });

  it('remembers the chosen mode during the session', () => {
    const a = fakeContext();
    game.start(a);
    tap(qa(a, '.mode-btn')[1]);
    a.cleanup();
    const b = fakeContext();
    game.start(b);
    expect(q(b, '.letters')!.getAttribute('data-mode')).toBe('find');
    expect(q(b, '.mode-btn.on')!.getAttribute('data-mode')).toBe('find');
    tap(qa(b, '.mode-btn')[0]);
    b.cleanup();
  });

  it('leaving stops the speech and later timers do nothing', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(qa(ctx, '.mode-btn')[1]);
    ctx.cleanup();
    await vi.advanceTimersByTimeAsync(20000);
    expect(ctx.celebrations).toBe(0);
  });
});
