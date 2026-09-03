import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext, fakeMic, type FakeContext, type FakeMic } from '../../core/testing';
import { CRITTERS, findCritter, MAX_RECORD_MS, STAR_EVERY } from './logic';
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

let ctx: FakeContext;
let mic: FakeMic;

beforeEach(() => {
  vi.useFakeTimers();
  mic = fakeMic();
  ctx = fakeContext();
});

afterEach(() => {
  ctx.cleanup();
  mic.restore();
  vi.useRealTimers();
});

/** First tap on the microphone asks for the permission; then the room is learned. */
async function turnMicOn(): Promise<void> {
  fire(q(ctx, '.parrot-mic'), 'pointerup');
  await vi.advanceTimersByTimeAsync(700);
}

/** Hold the button, sing `chunks` of voice, let go. */
async function singInto(chunks = 4): Promise<void> {
  const btn = q(ctx, '.parrot-mic');
  fire(btn, 'pointerdown');
  mic.level = 0.6;
  await vi.advanceTimersByTimeAsync(300);
  mic.feed(chunks);
  fire(btn, 'pointerup');
  await vi.advanceTimersByTimeAsync(10);
}

describe('the animals', () => {
  it('shows one button per animal, the first one chosen', () => {
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.parrot-critter').length).toBe(CRITTERS.length);
    expect(q(ctx, '.parrot-chosen').dataset.critter).toBe(CRITTERS[0]?.id);
  });

  it('cries its own sound when there is no recording yet', () => {
    game.start(ctx);
    fire(q(ctx, '.parrot-critter[data-critter="dino"]'), 'pointerdown');
    expect(q(ctx, '.parrot-chosen').dataset.critter).toBe('dino');
    expect(q(ctx, '.parrot-big').textContent).toBe('🦖');
    expect(ctx.spoken).toContain('khủng long');
  });
});

describe('recording and repeating', () => {
  it('plays the voice back at the chosen animal speed', async () => {
    game.start(ctx);
    await turnMicOn();
    await singInto();
    expect(mic.played.length).toBe(1);
    expect(mic.played[0]?.rate).toBe(findCritter('parrot')?.rate);
  });

  it('replays the same clip in another animal voice', async () => {
    game.start(ctx);
    await turnMicOn();
    await singInto();
    fire(q(ctx, '.parrot-critter[data-critter="elephant"]'), 'pointerdown');
    expect(mic.played.length).toBe(2);
    expect(mic.played[1]?.rate).toBe(findCritter('elephant')?.rate);
  });

  it('stops on its own after five seconds of holding', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    mic.level = 0.6;
    await vi.advanceTimersByTimeAsync(300);
    mic.feed(4);
    await vi.advanceTimersByTimeAsync(MAX_RECORD_MS + 50);
    expect(btn.classList.contains('parrot-recording')).toBe(false);
    expect(mic.played.length).toBe(1);
  });

  it('says so kindly when it heard nothing', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    await vi.advanceTimersByTimeAsync(200);
    fire(btn, 'pointerup');
    expect(mic.played.length).toBe(0);
    expect(q(ctx, '.parrot-bubble').textContent).toContain('to hơn');
  });

  it('gives a star every third playback', async () => {
    game.start(ctx);
    await turnMicOn();
    await singInto();
    for (let i = 1; i < STAR_EVERY; i++) {
      fire(q(ctx, '.parrot-critter[data-critter="mouse"]'), 'pointerdown');
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
  });
});

describe('without a microphone', () => {
  it('hides the button and leaves the animals playable', async () => {
    mic.granted = false;
    game.start(ctx);
    await turnMicOn();
    expect(q(ctx, '.parrot-mic').hidden).toBe(true);
    fire(q(ctx, '.parrot-critter[data-critter="mouse"]'), 'pointerdown');
    expect(ctx.spoken).toContain('chuột');
  });
});
