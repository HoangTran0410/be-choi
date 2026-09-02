import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { LULLABY_BPM, LULLABY_NOTES, toyCount } from './logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
    }
  };
}

const ptr = (): PointerEvent => new PointerEvent('pointerdown', { pointerId: 1, bubbles: true });

/** The whole lullaby, generously rounded up. */
const SONG_MS = (LULLABY_NOTES + 4) * (60000 / LULLABY_BPM);

function mount() {
  vi.useFakeTimers();
  const ctx = fakeContext();
  game.start(ctx);
  const wrap = ctx.stage.querySelector<HTMLElement>('.bedtime')!;
  return { ctx, wrap };
}

/** Put every toy away and wait for the room to move on to the lamp. */
function tidyUp(ctx: ReturnType<typeof fakeContext>): void {
  for (const toy of [...ctx.stage.querySelectorAll<HTMLElement>('.bedtime-toy')]) toy.dispatchEvent(ptr());
  vi.advanceTimersByTime(1600);
}

describe('bedtime game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lays out a room, a friend and the first night of toys', () => {
    const { ctx, wrap } = mount();
    expect(wrap.dataset.phase).toBe('toys');
    expect(ctx.stage.querySelectorAll('.bedtime-toy').length).toBe(toyCount(0));
    expect(ctx.stage.querySelector('.bedtime-friend')?.textContent?.length).toBeGreaterThan(0);
    expect(ctx.spoken[0]).toContain('Tới giờ ngủ');
    ctx.cleanup();
  });

  it('will not turn the light off until the toys are away', () => {
    const { ctx, wrap } = mount();
    ctx.stage.querySelector<HTMLElement>('.bedtime-lamp')!.dispatchEvent(ptr());
    expect(wrap.classList.contains('dark')).toBe(false);
    expect(wrap.dataset.phase).toBe('toys');

    tidyUp(ctx);
    expect(wrap.dataset.phase).toBe('light');
    expect(ctx.stage.querySelectorAll('.bedtime-toy').length).toBe(0);
    ctx.cleanup();
  });

  it('darkens the room, takes the blanket, then sings and puts the friend to sleep', async () => {
    const { ctx, wrap } = mount();
    tidyUp(ctx);

    ctx.stage.querySelector<HTMLElement>('.bedtime-lamp')!.dispatchEvent(ptr());
    expect(wrap.classList.contains('dark')).toBe(true);
    expect(wrap.dataset.phase).toBe('blanket');

    const blanket = ctx.stage.querySelector<HTMLElement>('.bedtime-blanket')!;
    blanket.dispatchEvent(ptr());
    expect(blanket.classList.contains('tucked')).toBe(true);
    expect(wrap.dataset.phase).toBe('lullaby');

    const notes = vi.fn();
    ctx.audio.note = notes;
    ctx.stage.querySelector<HTMLElement>('.bedtime-moon')!.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(SONG_MS);
    expect(notes.mock.calls.length).toBeGreaterThan(LULLABY_NOTES / 2);
    expect(wrap.dataset.phase).toBe('done');
    expect(ctx.stage.querySelector('.bedtime-friend')?.classList.contains('asleep')).toBe(true);
    expect(ctx.stage.querySelector('.bedtime-zzz')?.classList.contains('showing')).toBe(true);
    expect(ctx.spoken).toContain('Ngủ ngon nhé!');
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('starts another night, with more to tidy and somebody new', async () => {
    const { ctx, wrap } = mount();
    const first = ctx.stage.querySelector('.bedtime-friend')?.textContent;
    tidyUp(ctx);
    ctx.stage.querySelector<HTMLElement>('.bedtime-lamp')!.dispatchEvent(ptr());
    ctx.stage.querySelector<HTMLElement>('.bedtime-blanket')!.dispatchEvent(ptr());
    ctx.stage.querySelector<HTMLElement>('.bedtime-moon')!.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(SONG_MS + 4000);
    expect(wrap.dataset.phase).toBe('toys');
    expect(wrap.classList.contains('dark')).toBe(false);
    expect(ctx.stage.querySelectorAll('.bedtime-toy').length).toBe(toyCount(1));
    expect(ctx.stage.querySelector('.bedtime-friend')?.textContent).not.toBe(first);
    ctx.cleanup();
  });

  it('stops the song when the child leaves', async () => {
    const { ctx } = mount();
    tidyUp(ctx);
    ctx.stage.querySelector<HTMLElement>('.bedtime-lamp')!.dispatchEvent(ptr());
    ctx.stage.querySelector<HTMLElement>('.bedtime-blanket')!.dispatchEvent(ptr());
    const notes = vi.fn();
    ctx.audio.note = notes;
    ctx.stage.querySelector<HTMLElement>('.bedtime-moon')!.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(300);
    ctx.cleanup();
    const sung = notes.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SONG_MS);
    expect(notes.mock.calls.length).toBe(sung);
    expect(ctx.stars).toBe(0);
  });
});
