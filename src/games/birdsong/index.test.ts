import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { fakeContext, fakeMic, type FakeContext, type FakeMic } from '../../core/testing';
import { NOTES_PER_ROUND } from './logic';
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

function fire(el: Element, type: string): void {
  el.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, bubbles: true }));
}

function q<T extends Element = HTMLElement>(ctx: FakeContext, sel: string): T {
  const el = ctx.stage.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

function topOf(el: HTMLElement): number {
  return Number.parseFloat(el.style.top);
}

/** Frames off the fake clock, with a stamp this file owns. */
function stubFrames(): void {
  let stamp = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => {
      stamp += 16;
      cb(stamp);
    }, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
}

let ctx: FakeContext;
let mic: FakeMic;

beforeEach(() => {
  vi.useFakeTimers();
  stubFrames();
  // A fixed sky, so "how long until eight notes" is the same on every run.
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(42));
  mic = fakeMic();
  ctx = fakeContext();
});

afterEach(() => {
  ctx.cleanup();
  mic.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function turnMicOn(): Promise<void> {
  fire(q(ctx, '.bird-mic'), 'pointerup');
  await vi.advanceTimersByTimeAsync(700);
}

describe('the sky', () => {
  it('starts with a bird, an empty score and something to fly through', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(100);
    expect(q(ctx, '.bird-bird').textContent).toBe('🐦');
    expect(ctx.stage.querySelectorAll('.bird-slot').length).toBe(NOTES_PER_ROUND);
    expect(ctx.stage.querySelectorAll('.bird-slot.bird-got').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.bird-item').length).toBeGreaterThan(0);
  });

  it('drops the bird while nobody sings', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(100);
    const start = topOf(q(ctx, '.bird-bird'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(topOf(q(ctx, '.bird-bird'))).toBeGreaterThan(start);
  });
});

describe('the voice', () => {
  it('lifts the bird while the child sings', async () => {
    game.start(ctx);
    await turnMicOn();
    await vi.advanceTimersByTimeAsync(500);
    const start = topOf(q(ctx, '.bird-bird'));
    mic.level = 0.8;
    await vi.advanceTimersByTimeAsync(1000);
    expect(topOf(q(ctx, '.bird-bird'))).toBeLessThan(start);
    expect(q(ctx, '.birdsong').classList.contains('bird-singing')).toBe(true);
  });

  it('collects notes and pays a star for eight of them', async () => {
    game.start(ctx);
    await turnMicOn();
    mic.level = 0.55;
    for (let i = 0; i < 160 && ctx.stars === 0; i++) await vi.advanceTimersByTimeAsync(500);
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stage.querySelectorAll('.bird-slot.bird-got').length).toBe(0);
  });

  it('flies from a held finger when there is no microphone', async () => {
    mic.granted = false;
    game.start(ctx);
    await turnMicOn();
    // The button stays, dimmed, so a later press can ask for the microphone again.
    expect(q(ctx, '.bird-mic').hidden).toBe(false);
    expect(q(ctx, '.bird-mic').classList.contains('bird-mic-off')).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    const start = topOf(q(ctx, '.bird-bird'));
    fire(q(ctx, '.birdsong'), 'pointerdown');
    await vi.advanceTimersByTimeAsync(1000);
    expect(topOf(q(ctx, '.bird-bird'))).toBeLessThan(start);
    fire(q(ctx, '.birdsong'), 'pointerup');
  });

  it('stops flying when the child leaves', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(100);
    const bird = q(ctx, '.bird-bird');
    ctx.cleanup();
    const parked = topOf(bird);
    await vi.advanceTimersByTimeAsync(1000);
    expect(topOf(bird)).toBe(parked);
  });
});
