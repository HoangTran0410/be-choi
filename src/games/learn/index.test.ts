import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import game from './index';
import { SAVE_KEY } from './progress';

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

const ptr = (type: string, x = 0, y = 0) =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true, cancelable: true });

function tap(el: Element): void {
  el.dispatchEvent(ptr('pointerdown'));
}

let ctx: FakeContext;
const settle = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  ctx = fakeContext();
});
afterEach(() => {
  ctx.cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function station(id: string): HTMLElement {
  return ctx.stage.querySelector<HTMLElement>(`.lm-st[data-topic="${id}"]`)!;
}

/** Tap tiles until the right one lights up: a wrong tap is harmless, so this always ends. */
function solveChoose(): { wrong: number } {
  let wrong = 0;
  for (const tile of ctx.stage.querySelectorAll('.lq-opt')) {
    tap(tile);
    if (tile.classList.contains('right')) return { wrong };
    wrong++;
  }
  throw new Error('no right answer among the options');
}

describe('map', () => {
  it('shows ten stations on a path, the family one waiting for photos', async () => {
    game.start(ctx);
    await settle(100);
    expect(ctx.stage.querySelectorAll('.lm-st').length).toBe(10);
    expect(station('family').classList.contains('locked')).toBe(true);
    expect(station('letters').classList.contains('locked')).toBe(false);
    expect(ctx.stage.querySelector('.lm-explore')).not.toBeNull();
  });

  it('greets slowly, after the game intro, in short phrases', async () => {
    game.start(ctx);
    await settle(3000);
    expect(ctx.spoken).toEqual([]);
    await settle(3000);
    expect(ctx.spoken[0]).toBe('Chọn một trạm nhé');
  });

  it('opens the family station once there are two photos to tell apart', async () => {
    game.start(ctx);
    await settle(100);
    await ctx.photos.add([new Blob(['a']), new Blob(['bb'])]);
    await settle(100);
    expect(station('family').classList.contains('locked')).toBe(false);
  });
});

describe('a station', () => {
  it('asks five questions, never punishes a wrong tap, then gives a star and a present', async () => {
    game.start(ctx);
    await settle(100);
    tap(station('letters'));
    await settle(100);
    expect(ctx.stage.querySelector('.lq')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.lq-dot').length).toBe(5);

    for (let i = 0; i < 5; i++) {
      await settle(1500);
      expect(ctx.stage.querySelectorAll('.lq-opt').length).toBeGreaterThanOrEqual(2);
      // Be wrong on purpose on the first one: the tile fades, nothing else is lost.
      if (i === 0) {
        const answer = ctx.stage.querySelector('.lq-opt');
        tap(answer!);
        if (answer!.classList.contains('wrong')) expect(ctx.stage.querySelector('.lq')).not.toBeNull();
        if (!answer!.classList.contains('right')) solveChoose();
      } else {
        solveChoose();
      }
      await settle(i === 4 ? 5200 : 9000);
    }
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stage.querySelector('.lq-gift')).not.toBeNull();

    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    expect(saved.v).toBe(1);
    expect(saved.runs.letters).toBe(1);
    expect(Object.keys(saved.mastery).length).toBe(5);

    tap(ctx.stage.querySelector('.lq-gift-go')!);
    await settle(100);
    expect(ctx.stage.querySelector('.lm')).not.toBeNull();
    // The first present is on the teacher now.
    expect(ctx.stage.querySelector('.lt-head')!.textContent).toBe('🎓');
    expect(ctx.stage.querySelectorAll('.lm-wear').length).toBeGreaterThan(0);
  });

  it('says the question in separate short phrases, with the teacher waiting between them', async () => {
    game.start(ctx);
    await settle(100);
    tap(station('letters'));
    await settle(500);
    const t0 = ctx.spoken.length;
    await settle(8000);
    const said = ctx.spoken.slice(t0);
    expect(said.length).toBeGreaterThanOrEqual(2);
    expect(said.every((s) => s.split(' ').length <= 5)).toBe(true);
  });

  it('on a wrong tap, names what was tapped and says what to look for, then waits', async () => {
    game.start(ctx);
    await settle(100);
    tap(station('letters'));
    await settle(4000);
    const opts = [...ctx.stage.querySelectorAll('.lq-opt')];
    const before = ctx.spoken.length;
    // Find the wrong one by trying: the right one locks the question, so go through them until one is wrong.
    tap(opts[0]!);
    if (opts[0]!.classList.contains('right')) {
      expect(ctx.spoken.length).toBeGreaterThanOrEqual(before);
      return;
    }
    await settle(3000);
    const said = ctx.spoken.slice(before).join(' | ');
    expect(said).toMatch(/Đây là chữ/);
    expect(said).toMatch(/Mình tìm chữ/);
    expect(ctx.stage.querySelector('.lq-opt.right')).toBeNull();
  });

  it('leaving a station for the map stops the voice and keeps no timers', async () => {
    game.start(ctx);
    await settle(100);
    tap(station('numbers'));
    await settle(300);
    tap(ctx.stage.querySelector('.lq-back')!);
    await settle(50);
    const before = ctx.spoken.length;
    await settle(20000);
    expect(ctx.stage.querySelector('.lm')).not.toBeNull();
    // Only the map's own greeting may follow; nothing from the old question.
    expect(ctx.spoken.slice(before).every((s) => !/Có mấy/.test(s))).toBe(true);
  });

  it('plays the sorting station with drag-and-drop: right bin keeps the item, wrong bin does not', async () => {
    game.start(ctx);
    await settle(100);
    tap(station('colors'));
    await settle(100);
    // Answer the choose questions until the first drag question.
    for (let guard = 0; guard < 6 && !ctx.stage.querySelector('.lq-bin'); guard++) {
      await settle(1500);
      if (ctx.stage.querySelector('.lq-opt')) solveChoose();
      await settle(9000);
    }
    const bins = [...ctx.stage.querySelectorAll<HTMLElement>('.lq-bin')];
    expect(bins.length).toBeGreaterThanOrEqual(2);
    // jsdom has no layout: give every bin its own box.
    bins.forEach((b, i) => {
      b.getBoundingClientRect = () => ({ left: i * 300, top: 0, width: 200, height: 200, right: i * 300 + 200, bottom: 200, x: i * 300, y: 0, toJSON: () => ({}) }) as DOMRect;
    });
    const items = [...ctx.stage.querySelectorAll<HTMLElement>('.lq-item')];
    for (const el of items) {
      el.setPointerCapture = () => undefined;
      el.releasePointerCapture = () => undefined;
    }
    const first = items[0]!;
    const want = bins.findIndex((b) => b.dataset.id === first.dataset.id!.replace(/\d+$/, ''));
    const wrongIdx = want === 0 ? 1 : 0;
    // Drop on the wrong bin: it springs back and is still there.
    first.dispatchEvent(ptr('pointerdown', 5, 5));
    first.dispatchEvent(ptr('pointermove', wrongIdx * 300 + 100, 100));
    first.dispatchEvent(ptr('pointerup', wrongIdx * 300 + 100, 100));
    expect(first.classList.contains('placed')).toBe(false);
    // Drop on the right one.
    first.dispatchEvent(ptr('pointerdown', 5, 5));
    first.dispatchEvent(ptr('pointermove', want * 300 + 100, 100));
    first.dispatchEvent(ptr('pointerup', want * 300 + 100, 100));
    expect(first.classList.contains('placed')).toBe(true);
    expect(bins[want]!.querySelectorAll('.lq-mini').length).toBe(1);
  });
});

describe('Khám phá', () => {
  it('says a letter slowly and shows its three pictures one by one; a new touch cuts the old one off', async () => {
    game.start(ctx);
    await settle(100);
    tap(ctx.stage.querySelector('.lm-explore')!);
    await settle(100);
    const tiles = ctx.stage.querySelectorAll('.le-tile');
    expect(tiles.length).toBe(29);

    tap(tiles[3]!); // B
    await settle(300);
    expect(ctx.spoken.at(-1)).toBe('Chữ bê');
    expect(ctx.stage.querySelectorAll('.le-pic.on').length).toBe(0);
    await settle(4000);
    expect(ctx.stage.querySelectorAll('.le-pic.on').length).toBeGreaterThanOrEqual(1);
    await settle(6000);
    expect(ctx.stage.querySelectorAll('.le-pic.on').length).toBe(3);
    expect(ctx.spoken.slice(-3)).toEqual(['bóng', 'bò', 'bướm']);

    tap(tiles[0]!); // A cuts in
    const n = ctx.spoken.length;
    await settle(300);
    expect(ctx.spoken[n]).toBe('Chữ a');
    expect(ctx.stage.querySelectorAll('.le-pic.on').length).toBe(0);
  });

  it('switches topic with the big tabs and counts aloud', async () => {
    game.start(ctx);
    await settle(100);
    tap(ctx.stage.querySelector('.lm-explore')!);
    await settle(100);
    const tabs = ctx.stage.querySelectorAll('.le-tab');
    expect(tabs.length).toBe(5);
    tap(tabs[1]!);
    expect(ctx.stage.querySelectorAll('.le-tile').length).toBe(10);
    tap(ctx.stage.querySelectorAll('.le-tile')[2]!);
    await settle(8000);
    expect(ctx.spoken).toContain('Số ba');
    expect(ctx.spoken).toContain('hai');
    expect(ctx.stage.querySelectorAll('.le-pic.on').length).toBe(3);
  });

  it('shows the family tab only when there are photos', async () => {
    game.start(ctx);
    await settle(100);
    await ctx.photos.add([new Blob(['a']), new Blob(['bb'])]);
    await settle(100);
    tap(ctx.stage.querySelector('.lm-explore')!);
    await settle(100);
    expect(ctx.stage.querySelectorAll('.le-tab').length).toBe(6);
  });
});

describe('family station', () => {
  it('asks by name with the photos, then teaches', async () => {
    game.start(ctx);
    await settle(100);
    const [a, b, c] = await ctx.photos.add([new Blob(['a']), new Blob(['bb']), new Blob(['ccc'])]);
    await ctx.photos.rename(a!.id, 'Mẹ');
    await ctx.photos.rename(b!.id, 'Ba');
    await ctx.photos.rename(c!.id, 'Bà');
    await settle(100);
    tap(station('family'));
    await settle(5000);
    const asked = ctx.spoken.join(' | ');
    expect(asked).toMatch(/(Mẹ|Ba|Bà) đâu nào\?|Ai đây nhỉ\?/);
    expect(ctx.stage.querySelectorAll('.lq-opt').length).toBeGreaterThanOrEqual(2);
    expect(ctx.stage.querySelector('.lq-opt .lv-photo, .lq-opt .lv-chip')).not.toBeNull();
  });
});
