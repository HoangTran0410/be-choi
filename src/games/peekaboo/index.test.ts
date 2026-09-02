import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { FIND_AFTER, HIDE_SWAP_MS, REVEAL_MS, SHUFFLE_MS, STAR_EVERY, WIN_MS } from './logic';
import game from './index';

const spotsOf = (ctx: FakeContext): HTMLElement[] => [
  ...ctx.stage.querySelectorAll<HTMLElement>('.peekaboo-spot'),
];
const faceOf = (spot: HTMLElement): string => spot.querySelector('.peekaboo-peek')?.textContent ?? '';
const questOf = (ctx: FakeContext): string =>
  ctx.stage.querySelector('.peekaboo-quest-face')?.textContent ?? '';
const finding = (ctx: FakeContext): boolean =>
  ctx.stage.querySelector('.peekaboo')?.classList.contains('finding') ?? false;
const tap = (el: HTMLElement): void => {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
};
/** Let the box close, the animal swap, and any round change settle. */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(REVEAL_MS + HIDE_SWAP_MS * 2 + SHUFFLE_MS + 100);
};

/** Tap the box holding the animal the quest asks for and ride out the celebration. */
async function winFind(ctx: FakeContext): Promise<void> {
  const right = spotsOf(ctx).find((s) => faceOf(s) === questOf(ctx));
  expect(right).toBeDefined();
  tap(right!);
  await vi.advanceTimersByTimeAsync(WIN_MS + HIDE_SWAP_MS + 100);
}

describe('peekaboo game', () => {
  let rand: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // 0.5 is above SURPRISE_CHANCE, so free play stays on plain animals.
    rand = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    rand.mockRestore();
    vi.useRealTimers();
  });

  it('mounts 4 spots, reveals on tap, hides again and swaps the animal', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    const spots = spotsOf(ctx);
    expect(spots.length).toBe(4);

    const first = spots[0]!;
    const before = faceOf(first);
    tap(first);
    expect(first.classList.contains('open')).toBe(true);
    expect(ctx.spoken.at(-1)?.startsWith('Ú oà')).toBe(true);

    // A second tap while open is ignored.
    const said = ctx.spoken.length;
    tap(first);
    expect(ctx.spoken.length).toBe(said);

    await vi.advanceTimersByTimeAsync(REVEAL_MS + HIDE_SWAP_MS + 50);
    expect(first.classList.contains('open')).toBe(false);
    expect(faceOf(first)).not.toBe(before);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('asks the child to find one animal after FIND_AFTER free taps', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (let i = 0; i < FIND_AFTER; i++) {
      tap(spotsOf(ctx)[0]!);
      await settle();
    }
    expect(finding(ctx)).toBe(true);
    // The animal being asked for is really behind one of the boxes.
    expect(spotsOf(ctx).map(faceOf)).toContain(questOf(ctx));
    expect(ctx.spoken.at(-1)).toContain('trốn ở đâu');
    ctx.cleanup();
  });

  it('celebrates the right box and stays friendly about a wrong one', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (let i = 0; i < FIND_AFTER; i++) {
      tap(spotsOf(ctx)[0]!);
      await settle();
    }
    expect(finding(ctx)).toBe(true);

    const wrong = spotsOf(ctx).find((s) => faceOf(s) !== questOf(ctx))!;
    const celebrationsBefore = ctx.celebrations;
    tap(wrong);
    expect(ctx.spoken.at(-1)).toContain('Không phải rồi');
    expect(ctx.celebrations).toBe(celebrationsBefore);
    // A wrong box keeps the round going: the quest is still up.
    await vi.advanceTimersByTimeAsync(REVEAL_MS + HIDE_SWAP_MS + 50);
    expect(finding(ctx)).toBe(true);

    const starsBefore = ctx.stars;
    await winFind(ctx);
    expect(ctx.celebrations).toBe(celebrationsBefore + 1);
    expect(ctx.stars).toBe(starsBefore + 1);
    expect(finding(ctx)).toBe(false);
    ctx.cleanup();
  });

  it('awards a star every STAR_EVERY free reveals', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    let free = 0;
    while (free < STAR_EVERY - 1) {
      if (finding(ctx)) {
        await winFind(ctx);
        continue;
      }
      tap(spotsOf(ctx)[0]!);
      free++;
      await settle();
    }
    expect(ctx.stage.querySelector('.peekaboo-star')).toBeNull();

    if (finding(ctx)) await winFind(ctx);
    tap(spotsOf(ctx)[0]!);
    expect(ctx.stage.querySelector('.peekaboo-star')).not.toBeNull();
    await settle();
    expect(ctx.stage.querySelector('.peekaboo-star')).toBeNull();
    ctx.cleanup();
  });

  it('sometimes opens onto a surprise instead of an animal', () => {
    rand.mockReturnValue(0.01);
    const ctx = fakeContext();
    game.start(ctx);
    const first = spotsOf(ctx)[0]!;
    tap(first);
    expect(first.classList.contains('surprise')).toBe(true);
    expect(ctx.stage.querySelectorAll('.peekaboo-burst').length).toBeGreaterThan(0);
    expect(ctx.spoken.at(-1)).toContain('Ú oà');
    ctx.cleanup();
  });

  it('lets a closed box peek by itself so a waiting child has something to chase', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(3000);
    expect(spotsOf(ctx).some((s) => s.classList.contains('peeking'))).toBe(true);
    ctx.cleanup();
  });
});
