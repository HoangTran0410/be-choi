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

function fire(el: Element, type: string, pointerId = 1): void {
  el.dispatchEvent(new PointerEvent(type, { pointerId, isPrimary: pointerId === 1, bubbles: true }));
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

  it('stops on its own once the hold reaches the time limit', async () => {
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

  it('tells a child who only tapped to hold on, not to sing louder', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    await vi.advanceTimersByTimeAsync(200);
    fire(btn, 'pointerup');
    expect(mic.played.length).toBe(0);
    expect(q(ctx, '.parrot-bubble').textContent).toContain('lâu hơn');
  });

  it('asks for more voice when the button was held but nothing was sung', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    await vi.advanceTimersByTimeAsync(1200);
    fire(btn, 'pointerup');
    expect(mic.played.length).toBe(0);
    expect(q(ctx, '.parrot-bubble').textContent).toContain('to hơn');
  });

  it('ends the recording when the finger comes up somewhere else entirely', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    mic.level = 0.6;
    await vi.advanceTimersByTimeAsync(300);
    mic.feed(4);
    // A finger that drifts off the button releases over whatever is underneath.
    fire(q(ctx, '.parrot-big'), 'pointerup');
    await vi.advanceTimersByTimeAsync(10);
    expect(btn.classList.contains('parrot-recording')).toBe(false);
    expect(mic.played.length).toBe(1);
  });

  it('keeps the recording when the browser takes the gesture away', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    mic.level = 0.6;
    await vi.advanceTimersByTimeAsync(300);
    mic.feed(4);
    fire(btn, 'pointercancel');
    await vi.advanceTimersByTimeAsync(10);
    // Cancelled is not thrown away: the singing that did arrive still comes back.
    expect(mic.played.length).toBe(1);
  });

  it('ignores a second finger landing on the button mid-recording', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    fire(btn, 'pointerdown');
    mic.level = 0.6;
    await vi.advanceTimersByTimeAsync(300);
    // A palm or a sibling: neither starts a recording nor ends this one.
    fire(btn, 'pointerdown', 2);
    fire(btn, 'pointerup', 2);
    await vi.advanceTimersByTimeAsync(10);
    expect(btn.classList.contains('parrot-recording')).toBe(true);
    mic.feed(4);
    fire(btn, 'pointerup');
    await vi.advanceTimersByTimeAsync(10);
    expect(mic.played.length).toBe(1);
  });

  it('does not let a finished recording cut the next one short', async () => {
    game.start(ctx);
    await turnMicOn();
    const btn = q(ctx, '.parrot-mic');
    await singInto();
    // The first hold's time limit is still in the future; the second must outlive it.
    await vi.advanceTimersByTimeAsync(1000);
    fire(btn, 'pointerdown');
    mic.level = 0.6;
    await vi.advanceTimersByTimeAsync(MAX_RECORD_MS - 1000);
    expect(btn.classList.contains('parrot-recording')).toBe(true);
    mic.feed(4);
    fire(btn, 'pointerup');
    await vi.advanceTimersByTimeAsync(10);
    expect(mic.played.length).toBe(2);
  });

  it('a press on the big animal plays the clip again', async () => {
    game.start(ctx);
    await turnMicOn();
    await singInto();
    fire(q(ctx, '.parrot-big'), 'pointerdown');
    expect(mic.played.length).toBe(2);
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

describe('asking for the microphone', () => {
  it('asks on the way down and records that very hold once it is granted', async () => {
    game.start(ctx);
    const btn = q(ctx, '.parrot-mic');
    // No permission yet: the child presses and holds, singing into it as they go.
    fire(btn, 'pointerdown');
    await vi.advanceTimersByTimeAsync(50);
    expect(btn.classList.contains('parrot-recording')).toBe(true);
    mic.level = 0.6;
    await vi.advanceTimersByTimeAsync(300);
    mic.feed(4);
    fire(btn, 'pointerup');
    await vi.advanceTimersByTimeAsync(10);
    // The first hold is the one that used to be swallowed by the prompt.
    expect(mic.played.length).toBe(1);
  });

  it('asks on the first touch anywhere, so the microphone is live before it is needed', async () => {
    game.start(ctx);
    fire(q(ctx, '.parrot-critter[data-critter="mouse"]'), 'pointerdown');
    fire(q(ctx, '.parrot-critter[data-critter="mouse"]'), 'pointerup');
    await vi.advanceTimersByTimeAsync(700);
    expect(q(ctx, '.parrot-bubble').textContent).toContain('Giữ');
    // Straight into a hold, with nothing to wait for.
    await singInto();
    expect(mic.played.length).toBe(1);
  });
});

describe('without a microphone', () => {
  it('keeps the button and asks again, and leaves the animals playable', async () => {
    mic.granted = false;
    game.start(ctx);
    await turnMicOn();
    // Taking the button away left the child nothing to press and no way back.
    const btn = q(ctx, '.parrot-mic');
    expect(btn.hidden).toBe(false);
    expect(btn.classList.contains('parrot-mic-off')).toBe(true);
    fire(q(ctx, '.parrot-critter[data-critter="mouse"]'), 'pointerdown');
    expect(ctx.spoken).toContain('chuột');

    // A parent allows the microphone in the meantime: the next press finds it.
    mic.granted = true;
    await turnMicOn();
    expect(btn.classList.contains('parrot-mic-off')).toBe(false);
    await singInto();
    expect(mic.played.length).toBe(1);
  });
});
