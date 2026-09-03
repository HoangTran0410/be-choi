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

const tap = (ctx: ReturnType<typeof fakeContext>, sel: string): void => {
  ctx.stage.querySelector<HTMLElement>(sel)!.dispatchEvent(ptr());
};

const tick = (ctx: ReturnType<typeof fakeContext>, job: string): HTMLElement =>
  ctx.stage.querySelector<HTMLElement>(`.bedtime-tick[data-job="${job}"]`)!;

/** Put every toy away and wait for the basket to be ticked off. */
function tidyUp(ctx: ReturnType<typeof fakeContext>): void {
  for (const toy of [...ctx.stage.querySelectorAll<HTMLElement>('.bedtime-toy')]) toy.dispatchEvent(ptr());
  vi.advanceTimersByTime(1600);
}

/** Sing the lullaby through to the end. */
async function sing(ctx: ReturnType<typeof fakeContext>): Promise<void> {
  tap(ctx, '.bedtime-moon');
  await vi.advanceTimersByTimeAsync(SONG_MS);
}

describe('bedtime game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lays out a room, a friend, the first night of toys and four things to do', () => {
    const { ctx } = mount();
    expect(ctx.stage.querySelectorAll('.bedtime-toy').length).toBe(toyCount(0));
    expect(ctx.stage.querySelectorAll('.bedtime-tick').length).toBe(4);
    expect(ctx.stage.querySelectorAll('.bedtime-tick.done').length).toBe(0);
    expect(ctx.stage.querySelector('.bedtime-friend')?.textContent?.length).toBeGreaterThan(0);
    expect(ctx.spoken[0]).toContain('Tới giờ ngủ');
    ctx.cleanup();
  });

  it('lets the child start with any job at all', () => {
    const { ctx, wrap } = mount();

    tap(ctx, '.bedtime-lamp');
    expect(wrap.classList.contains('dark')).toBe(true);
    expect(tick(ctx, 'light').classList.contains('done')).toBe(true);

    tap(ctx, '.bedtime-blanket');
    expect(ctx.stage.querySelector('.bedtime-blanket')?.classList.contains('tucked')).toBe(true);
    expect(tick(ctx, 'blanket').classList.contains('done')).toBe(true);

    // The toys are still on the floor, so nobody is asleep yet.
    expect(ctx.stage.querySelector('.bedtime-friend')?.classList.contains('asleep')).toBe(false);
    expect(ctx.stars).toBe(0);
    ctx.cleanup();
  });

  it('treats the lamp and the blanket as switches, not as steps', () => {
    const { ctx, wrap } = mount();

    tap(ctx, '.bedtime-lamp');
    tap(ctx, '.bedtime-lamp');
    expect(wrap.classList.contains('dark')).toBe(false);
    expect(tick(ctx, 'light').classList.contains('done')).toBe(false);

    tap(ctx, '.bedtime-blanket');
    tap(ctx, '.bedtime-blanket');
    expect(ctx.stage.querySelector('.bedtime-blanket')?.classList.contains('tucked')).toBe(false);
    expect(tick(ctx, 'blanket').classList.contains('done')).toBe(false);
    ctx.cleanup();
  });

  it('puts the friend to sleep once all four are done, in back-to-front order', async () => {
    const { ctx } = mount();

    await sing(ctx);
    expect(tick(ctx, 'lullaby').classList.contains('done')).toBe(true);
    expect(ctx.stage.querySelector('.bedtime-friend')?.classList.contains('asleep')).toBe(false);

    tap(ctx, '.bedtime-blanket');
    tap(ctx, '.bedtime-lamp');
    expect(ctx.stars).toBe(0);

    const notes = vi.fn();
    ctx.audio.note = notes;
    tidyUp(ctx);
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.stage.querySelectorAll('.bedtime-tick.done').length).toBe(4);
    expect(ctx.stage.querySelector('.bedtime-friend')?.classList.contains('asleep')).toBe(true);
    expect(ctx.stage.querySelector('.bedtime-zzz')?.classList.contains('showing')).toBe(true);
    expect(ctx.spoken).toContain('Ngủ ngon nhé!');
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('sings the lullaby on bells whenever the moon is asked', async () => {
    const { ctx } = mount();
    const notes = vi.fn();
    ctx.audio.note = notes;
    await sing(ctx);
    expect(notes.mock.calls.length).toBeGreaterThan(LULLABY_NOTES / 2);
    ctx.cleanup();
  });

  it('starts another night, with more to tidy and somebody new', async () => {
    const { ctx } = mount();
    const first = ctx.stage.querySelector('.bedtime-friend')?.textContent;
    tidyUp(ctx);
    tap(ctx, '.bedtime-lamp');
    tap(ctx, '.bedtime-blanket');
    await sing(ctx);
    await vi.advanceTimersByTimeAsync(4000);
    expect(ctx.stage.querySelectorAll('.bedtime-tick.done').length).toBe(0);
    expect(ctx.stage.querySelector('.bedtime')?.classList.contains('dark')).toBe(false);
    expect(ctx.stage.querySelectorAll('.bedtime-toy').length).toBe(toyCount(1));
    expect(ctx.stage.querySelector('.bedtime-friend')?.textContent).not.toBe(first);
    ctx.cleanup();
  });

  it('stops the song when the child leaves', async () => {
    const { ctx } = mount();
    const notes = vi.fn();
    ctx.audio.note = notes;
    tap(ctx, '.bedtime-moon');
    await vi.advanceTimersByTimeAsync(300);
    ctx.cleanup();
    const sung = notes.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SONG_MS);
    expect(notes.mock.calls.length).toBe(sung);
    expect(ctx.stars).toBe(0);
  });
});
