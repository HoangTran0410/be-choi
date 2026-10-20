import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import { resetFrameLoop } from '../../core/frame';
import { emptyPlot } from './crops';
import { LEVEL_XP, loadFarm, newState, SAVE_KEY, saveFarm, type FarmState } from './progress';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary = true;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
    }
  };
}

const ptr = (type: string, x = 0, y = 0): PointerEvent =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true });
const press = (el: Element): void => void el.dispatchEvent(ptr('pointerdown'));
/** A real tap: down and up. */
const tap = (el: Element): void => {
  el.dispatchEvent(ptr('pointerdown'));
  el.dispatchEvent(ptr('pointerup'));
};

/** Frames off the fake clock. */
function driveFrames(): void {
  let stamp = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) =>
      setTimeout(() => {
        stamp += 16;
        cb(stamp);
      }, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
}

function mount(seed?: (s: FarmState) => void) {
  if (seed) {
    const s = newState();
    seed(s);
    saveFarm(s);
  }
  const ctx = fakeContext();
  game.start(ctx);
  return ctx;
}

const q = (ctx: { stage: HTMLElement }, sel: string): HTMLElement => ctx.stage.querySelector<HTMLElement>(sel)!;
const qa = (ctx: { stage: HTMLElement }, sel: string): HTMLElement[] => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];
const go = (ctx: { stage: HTMLElement }, tab: string): void => tap(q(ctx, `[data-tab="${tab}"]`));
const chip = (ctx: { stage: HTMLElement }, id: string): HTMLElement | null =>
  ctx.stage.querySelector<HTMLElement>(`.hv-chip[data-item="${id}"]`);
const count = (ctx: { stage: HTMLElement }, id: string): number => Number(chip(ctx, id)?.querySelector('.hv-chip-n')?.textContent ?? 0);

async function wait(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  // Taps have a cooldown measured on performance.now; keep it on the fake clock.
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  driveFrames();
  try {
    localStorage.clear();
  } catch {
    /* no storage */
  }
});
afterEach(() => {
  resetFrameLoop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('harvest: one farm, three places', () => {
  it('opens in the garden with six bare plots, three seeds and a way to water', () => {
    const ctx = mount();
    expect(qa(ctx, '.hv-plot').length).toBe(6);
    expect(qa(ctx, '.hv-seed').length).toBe(3);
    expect(q(ctx, '.hv-can')).toBeTruthy();
    expect(qa(ctx, '.hv-tab').length).toBe(3);
    expect(q(ctx, '.hv-garden').classList.contains('on')).toBe(true);
    // The starting basket already has something to feed the animals.
    expect(count(ctx, 'carrot')).toBe(2);
    ctx.cleanup();
  });

  it('plants, waters and grows a plant through every stage, in order, and picks it', async () => {
    const ctx = mount();
    const plot = qa(ctx, '.hv-plot')[0]!;
    const stage = () => plot.querySelector('.hv-plant')!.textContent;
    tap(plot); // plant the first seed (carrot)
    expect(stage()).toBe('🟤');
    expect(plot.classList.contains('thirsty')).toBe(true);
    const seen = [stage()];
    for (let i = 0; i < 3; i++) {
      await wait(200);
      tap(plot); // water
      expect(plot.classList.contains('wet')).toBe(true);
      await wait(8000);
      seen.push(stage());
    }
    expect(seen).toEqual(['🟤', '🌱', '🌿', '🥕']);
    expect(plot.classList.contains('ripe')).toBe(true);
    await wait(200);
    tap(plot); // pick
    expect(plot.querySelector('.hv-plant')!.textContent).toBe('');
    expect(count(ctx, 'carrot')).toBe(4);
    ctx.cleanup();
  });

  it('a plot left unwatered just waits: nothing withers', async () => {
    const ctx = mount();
    const plot = qa(ctx, '.hv-plot')[0]!;
    tap(plot);
    await wait(60_000);
    expect(plot.querySelector('.hv-plant')!.textContent).toBe('🟤');
    expect(plot.classList.contains('thirsty')).toBe(true);
    ctx.cleanup();
  });

  it('feeds an animal what it likes by just tapping it, then collects what it gives', async () => {
    const ctx = mount();
    go(ctx, 'barn');
    expect(q(ctx, '.hv-barn').classList.contains('on')).toBe(true);
    const hen = qa(ctx, '.hv-pen')[0]!;
    expect(hen.classList.contains('hungry')).toBe(true);
    expect(hen.querySelector('.hv-bubble')!.textContent).toBe('🌽');
    await wait(300);
    tap(hen);
    expect(hen.classList.contains('chewing')).toBe(true);
    expect(count(ctx, 'corn')).toBe(1);
    await wait(7000);
    expect(hen.classList.contains('ready')).toBe(true);
    expect(hen.querySelector('.hv-give')!.textContent).toBe('🥚');
    tap(hen);
    expect(hen.classList.contains('hungry')).toBe(true);
    expect(count(ctx, 'egg')).toBe(1);
    ctx.cleanup();
  });

  it('a hungry animal and an empty basket sends the child back to the garden, kindly', async () => {
    const ctx = mount((s) => (s.stock = {}));
    go(ctx, 'barn');
    await wait(300);
    tap(qa(ctx, '.hv-pen')[0]!);
    expect(ctx.spoken.at(-1)).toContain('đói');
    expect(q(ctx, '.hv-garden').classList.contains('on')).toBe(true);
    ctx.cleanup();
  });

  it('serves a customer in pictures, counts aloud, rewards a star and brings the next one', async () => {
    const ctx = mount((s) => {
      s.stock = { carrot: 3 };
      s.order = { shopper: 2, photo: false, wants: [{ item: 'carrot', n: 2, got: 0 }] };
    });
    go(ctx, 'market');
    expect(qa(ctx, '.hv-slot').length).toBe(2);
    expect(q(ctx, '.hv-num').textContent).toBe('2');
    expect(ctx.spoken.some((t) => t.includes('muốn, hai, cà rốt'))).toBe(true);
    // Something the customer does not want is only a soft "not now".
    await wait(300);
    tap(chip(ctx, 'carrot')!);
    await wait(300);
    expect(count(ctx, 'carrot')).toBe(2);
    expect(ctx.spoken).toContain('một cà rốt.');
    tap(chip(ctx, 'carrot')!);
    await wait(300);
    expect(ctx.spoken).toContain('hai cà rốt.');
    await wait(900);
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.spoken).toContain('Cảm ơn bé!');
    await wait(2600);
    expect(qa(ctx, '.hv-slot').length).toBeGreaterThanOrEqual(1);
    ctx.cleanup();
  });

  it('a wrong gift is never an error', async () => {
    const ctx = mount((s) => {
      s.stock = { carrot: 1, corn: 1 };
      s.order = { shopper: 0, photo: false, wants: [{ item: 'carrot', n: 1, got: 0 }] };
    });
    go(ctx, 'market');
    await wait(300);
    tap(chip(ctx, 'corn')!);
    await wait(300);
    expect(count(ctx, 'corn')).toBe(1);
    expect(ctx.stars).toBe(0);
    expect(ctx.spoken.at(-1)).toContain('chưa cần');
    ctx.cleanup();
  });

  it('shows family photos on the sign, the barn wall and as a customer', async () => {
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    const s = newState();
    s.served = 1;
    saveFarm(s);
    game.start(ctx);
    await wait(100);
    expect(q(ctx, '.hv-sign img')).toBeTruthy();
    go(ctx, 'barn');
    expect(q(ctx, '.hv-frame-barn img')).toBeTruthy();
    go(ctx, 'market');
    await wait(1000);
    expect(q(ctx, '.hv-face img')).toBeTruthy();
    expect(ctx.spoken.some((t) => t.startsWith('Người thân muốn'))).toBe(true);
    ctx.cleanup();
  });

  it('reaching a level shows a "new!" card with the pictures of what arrived, and a star', async () => {
    const ctx = mount((s) => {
      s.xp = LEVEL_XP[1]! - 1;
      s.plots[0] = { crop: 'carrot', stage: 3, wet: false, prog: 0 };
    });
    await wait(100);
    tap(qa(ctx, '.hv-plot')[0]!);
    const card = q(ctx, '.hv-new');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('🍓');
    expect(card.textContent).toContain('🐖');
    expect(ctx.stars).toBe(1);
    expect(qa(ctx, '.hv-seed').length).toBe(4);
    await wait(5000);
    expect(q(ctx, '.hv-new')).toBeNull();
    ctx.cleanup();
  });

  it('remembers the farm: the planted crop, the basket and the level survive leaving', async () => {
    let ctx = mount();
    tap(qa(ctx, '.hv-plot')[1]!);
    await wait(200);
    tap(qa(ctx, '.hv-plot')[1]!);
    ctx.cleanup();
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    expect(saved.v).toBe(1);
    expect(loadFarm().plots[1]!.crop).toBe('carrot');
    expect(loadFarm().plots[1]!.wet).toBe(true);
    ctx = mount();
    expect(qa(ctx, '.hv-plot')[1]!.querySelector('.hv-plant')!.textContent).toBe('🟤');
    expect(qa(ctx, '.hv-plot')[1]!.classList.contains('wet')).toBe(true);
    ctx.cleanup();
  });

  it('restores an old save with fewer plots than the level allows', () => {
    const ctx = mount((s) => {
      s.xp = LEVEL_XP[4]!;
      s.plots = [emptyPlot()];
    });
    expect(qa(ctx, '.hv-plot').length).toBe(10);
    ctx.cleanup();
  });

  it('leaves nothing running when the child goes', async () => {
    const before = vi.getTimerCount();
    const ctx = mount();
    tap(qa(ctx, '.hv-plot')[0]!);
    go(ctx, 'market');
    await wait(500);
    ctx.cleanup();
    await wait(5000);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('survives a long play session with random pressing and still has a farm', async () => {
    const ctx = mount();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const els = [...ctx.stage.querySelectorAll<HTMLElement>('button')];
      const el = els[Math.floor(rnd() * els.length)]!;
      press(el);
      el.dispatchEvent(ptr('pointermove', 30, 30));
      el.dispatchEvent(ptr('pointerup', 30, 30));
      await wait(Math.floor(rnd() * 1500));
    }
    expect(qa(ctx, '.hv-plot').length).toBeGreaterThanOrEqual(6);
    ctx.cleanup();
  });
});
