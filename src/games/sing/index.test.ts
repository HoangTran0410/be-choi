import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SONGS } from '../../core/music';
import { fakeContext, fakeMic, type FakeContext, type FakeMic } from '../../core/testing';
import { phrasesFor } from './logic';
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

/** Let the microphone learn the room (silence) before the child sings. */
async function settleMic(): Promise<void> {
  await vi.advanceTimersByTimeAsync(700);
}

describe('the stage', () => {
  it('offers every song', () => {
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.sing-song').length).toBe(SONGS.length);
    expect(q(ctx, '.sing').dataset.phase).toBe('pick');
  });

  it('shows the first line of the song the child picked', () => {
    game.start(ctx);
    fire(q(ctx, '.sing-song[data-song="lamb"]'), 'pointerdown');
    expect(q(ctx, '.sing').dataset.phase).toBe('sing');
    expect(q(ctx, '.sing-lyric').hidden).toBe(false);
    expect(q(ctx, '.sing-lyric-text').textContent).toBe(phrasesFor('lamb')[0]?.text);
    expect(q(ctx, '.sing-songs').hidden).toBe(true);
  });

  it('moves the words on as the melody plays', async () => {
    game.start(ctx);
    fire(q(ctx, '.sing-song[data-song="lamb"]'), 'pointerdown');
    const first = q(ctx, '.sing-lyric-text').textContent;
    await vi.advanceTimersByTimeAsync(3000 + 3000);
    expect(q(ctx, '.sing-lyric-text').textContent).not.toBe(first);
  });

  it('ends the song with a celebration and a star, then offers the songs again', async () => {
    game.start(ctx);
    fire(q(ctx, '.sing-song[data-song="lamb"]'), 'pointerdown');
    await vi.advanceTimersByTimeAsync(25000);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(q(ctx, '.sing').dataset.phase).toBe('pick');
  });

  it('lets the child stop and choose another song', () => {
    game.start(ctx);
    fire(q(ctx, '.sing-song[data-song="twinkle"]'), 'pointerdown');
    fire(q(ctx, '.sing-back'), 'pointerdown');
    expect(q(ctx, '.sing').dataset.phase).toBe('pick');
    expect(q(ctx, '.sing-songs').hidden).toBe(false);
  });
});

describe('the microphone', () => {
  it('lights the stage and floats notes while the child sings', async () => {
    game.start(ctx);
    fire(q(ctx, '.sing-mic'), 'pointerup');
    await settleMic();
    expect(q(ctx, '.sing-mic').classList.contains('sing-on')).toBe(true);

    mic.level = 0.5;
    await vi.advanceTimersByTimeAsync(400);
    const root = q(ctx, '.sing');
    expect(root.classList.contains('sing-loud')).toBe(true);
    expect(Number(root.style.getPropertyValue('--sing-level'))).toBeGreaterThan(0.3);
    expect(ctx.stage.querySelectorAll('.sing-note').length).toBeGreaterThan(0);

    mic.level = 0;
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.classList.contains('sing-loud')).toBe(false);
  });

  it('hides the button when a parent says no, and the songs still play', async () => {
    mic.granted = false;
    game.start(ctx);
    fire(q(ctx, '.sing-mic'), 'pointerup');
    await settleMic();
    expect(q(ctx, '.sing-mic').hidden).toBe(true);
    fire(q(ctx, '.sing-song[data-song="lamb"]'), 'pointerdown');
    expect(q(ctx, '.sing').dataset.phase).toBe('sing');
  });

  it('is released when the child leaves the game', async () => {
    game.start(ctx);
    fire(q(ctx, '.sing-mic'), 'pointerup');
    await settleMic();
    ctx.cleanup();
    mic.level = 0.9;
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelectorAll('.sing-note').length).toBe(0);
  });
});
