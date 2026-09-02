import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { voiceOf } from '../../core/content';
import { CORRECT_FOR_STAR, MIN_CHOICES } from './logic';
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

/** The card the sound belongs to, found through the fx the game just played. */
function rightCard(ctx: ReturnType<typeof fakeContext>, played: string[]): HTMLElement {
  const cards = [...ctx.stage.querySelectorAll<HTMLElement>('.sounds-card')];
  const voice = played.at(-1);
  const card = cards.find((c) => voiceOf({ emoji: c.dataset.emoji ?? '', name: '' }) === voice);
  if (!card) throw new Error(`no card sounds like ${voice}`);
  return card;
}

function mount() {
  vi.useFakeTimers();
  const ctx = fakeContext();
  const played: string[] = [];
  ctx.audio.fx = (kind) => played.push(kind);
  game.start(ctx);
  vi.advanceTimersByTime(700);
  return { ctx, played };
}

describe('sounds game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deals a speaker and the first, easiest board, then asks by itself', () => {
    const { ctx, played } = mount();
    expect(ctx.stage.querySelector('.sounds-speaker')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.sounds-card').length).toBe(MIN_CHOICES);
    expect(played.length).toBe(1);
    ctx.cleanup();
  });

  it('says the sound again when the speaker is pressed', () => {
    const { ctx, played } = mount();
    vi.advanceTimersByTime(600);
    ctx.stage.querySelector<HTMLElement>('.sounds-speaker')!.dispatchEvent(ptr());
    expect(played.length).toBe(2);
    expect(played[0]).toBe(played[1]);
    ctx.cleanup();
  });

  it('marks a wrong card, keeps the round open and plays the sound again', () => {
    const { ctx, played } = mount();
    const right = rightCard(ctx, played);
    const wrong = [...ctx.stage.querySelectorAll<HTMLElement>('.sounds-card')].find((c) => c !== right)!;
    wrong.dispatchEvent(ptr());
    expect(wrong.classList.contains('sounds-wrong')).toBe(true);
    expect(ctx.spoken.at(-1)).toContain('nghe lại');
    vi.advanceTimersByTime(900);
    expect(played.length).toBe(2);
    expect(ctx.stage.querySelectorAll('.sounds-card').length).toBe(MIN_CHOICES);
    ctx.cleanup();
  });

  it('names the animal on a right answer and deals a new board', () => {
    const { ctx, played } = mount();
    const card = rightCard(ctx, played);
    const emoji = card.dataset.emoji;
    card.dispatchEvent(ptr());
    expect(card.classList.contains('sounds-right')).toBe(true);
    expect(ctx.spoken.at(-1)?.length).toBeGreaterThan(0);
    vi.advanceTimersByTime(2000);
    // A fresh board, and never the same animal twice running.
    const faces = [...ctx.stage.querySelectorAll<HTMLElement>('.sounds-card')].map((c) => c.dataset.emoji);
    expect(faces.length).toBeGreaterThanOrEqual(MIN_CHOICES);
    expect(rightCard(ctx, played).dataset.emoji).not.toBe(emoji);
    ctx.cleanup();
  });

  it('earns a star every third animal found', async () => {
    const { ctx, played } = mount();
    for (let i = 0; i < CORRECT_FOR_STAR; i++) {
      expect(ctx.stars).toBe(0);
      rightCard(ctx, played).dispatchEvent(ptr());
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    ctx.cleanup();
  });

  it('ignores a second tap while the round is being celebrated', () => {
    const { ctx, played } = mount();
    const card = rightCard(ctx, played);
    card.dispatchEvent(ptr());
    const other = [...ctx.stage.querySelectorAll<HTMLElement>('.sounds-card')].find((c) => c !== card)!;
    other.dispatchEvent(ptr());
    expect(other.classList.contains('sounds-wrong')).toBe(false);
    ctx.cleanup();
  });
});
