import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import game from './index';
import { KEY, loadProgress } from './progress';

const tap = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const q = (ctx: FakeContext, sel: string) => ctx.stage.querySelector<HTMLElement>(sel);
const qa = (ctx: FakeContext, sel: string) => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];

/** Flip every pair in a cards round (matched by what is on the back). */
function solveCards(ctx: FakeContext): void {
  const cards = qa(ctx, '.brain-card');
  const groups = new Map<string, HTMLElement[]>();
  for (const c of cards) {
    const k = c.querySelector('.brain-card-back')!.innerHTML;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const [a, b] of groups.values()) {
    tap(a!);
    tap(b!);
  }
}

describe('brain game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('opens on the map: two stations open, three locked, no map button', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(qa(ctx, '.brain-node')).toHaveLength(5);
    expect(qa(ctx, '.brain-node.locked')).toHaveLength(3);
    expect(q(ctx, '.brain-mapbtn.gone')).not.toBeNull();
    ctx.cleanup();
  });

  it('a locked station only wiggles and says how many stars it needs', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="sequence"]')!);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.spoken.join(' ')).toContain('ba');
    expect(q(ctx, '.brain-cards')).toBeNull();
    ctx.cleanup();
  });

  it('playing cards to the end gives a star, saves, adapts, and keeps going', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="cards"]')!);
    expect(qa(ctx, '.brain-card')).toHaveLength(4);
    expect(q(ctx, '.brain-mapbtn.gone')).toBeNull();
    solveCards(ctx);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    const saved = loadProgress();
    expect(saved.stars).toBe(1);
    expect(saved.rounds.cards).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).v).toBe(1);
    // A fresh board straight away, still in the same station.
    expect(qa(ctx, '.brain-card')).toHaveLength(4);
    expect(qa(ctx, '.brain-card.matched')).toHaveLength(0);
    ctx.cleanup();
  });

  it('two clean rounds make the next board bigger; three rounds walk back to the map', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="cards"]')!);
    for (let i = 0; i < 2; i++) {
      solveCards(ctx);
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(loadProgress().skills.cards.level).toBe(1);
    expect(qa(ctx, '.brain-card')).toHaveLength(6);
    // Third round: still no surprise until the 3rd star.
    // (peek phase hides taps for a moment)
    await vi.advanceTimersByTimeAsync(3000);
    solveCards(ctx);
    await vi.advanceTimersByTimeAsync(2000);
    // 3 stars: the reward screen first…
    expect(q(ctx, '.brain-overlay.reveal')).not.toBeNull();
    expect(ctx.spoken.join(' ')).toContain('trạm nhớ dãy');
    tap(q(ctx, '.brain-ok')!);
    // …then the map, with the new station open.
    expect(qa(ctx, '.brain-node')).toHaveLength(5);
    expect(qa(ctx, '.brain-node.locked')).toHaveLength(2);
    ctx.cleanup();
  });

  it('a mismatch flips back and is counted as a slip, not a loss', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="cards"]')!);
    const cards = qa(ctx, '.brain-card');
    const a = cards[0]!;
    const b = cards.find((c) => c.querySelector('.brain-card-back')!.innerHTML !== a.querySelector('.brain-card-back')!.innerHTML)!;
    tap(a);
    tap(b);
    expect(a.classList.contains('flipped')).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.classList.contains('flipped')).toBe(false);
    expect(ctx.stars).toBe(0);
    ctx.cleanup();
  });

  it('the map button goes back, leaving nothing running', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="missing"]')!);
    expect(q(ctx, '.brain-miss')).not.toBeNull();
    tap(q(ctx, '.brain-mapbtn')!);
    expect(q(ctx, '.brain-miss')).toBeNull();
    expect(qa(ctx, '.brain-node')).toHaveLength(5);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('missing: a wrong pick fades, the right one finishes the round', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="missing"]')!);
    await vi.advanceTimersByTimeAsync(20000);
    expect(q(ctx, '.brain-miss-choices.show')).not.toBeNull();
    const gone = q(ctx, '.brain-miss-cell.gone')!;
    expect(gone).not.toBeNull();
    // The right choice looks like what used to be in the gone cell: find it by elimination.
    const choices = qa(ctx, '.brain-miss-choice');
    const shownHtml = qa(ctx, '.brain-miss-cell:not(.gone)').map((c) => c.innerHTML);
    const right = choices.find((c) => !shownHtml.includes(c.innerHTML) && choices.length > 0);
    // Wrong ones were never on the table; the right one wasn't visible either. Tap them all in turn.
    for (const c of choices) {
      if (c === right) continue;
      tap(c);
    }
    expect(ctx.stars).toBe(0);
    for (const c of choices) tap(c);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('every station can be opened and left cleanly', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, stars: 15 }));
    for (const id of ['cards', 'missing', 'sequence', 'tubes', 'diff']) {
      const ctx = fakeContext();
      game.start(ctx);
      expect(qa(ctx, '.brain-node.locked'), 'all open at 15 stars').toHaveLength(0);
      tap(q(ctx, `.brain-node[data-station="${id}"]`)!);
      await vi.advanceTimersByTimeAsync(500);
      expect(q(ctx, '.brain-station')?.children.length, id).toBeGreaterThan(0);
      ctx.cleanup();
      await vi.advanceTimersByTimeAsync(5000);
      expect(vi.getTimerCount(), id).toBe(0);
    }
  });

  it('diff: tapping the odd cell wins; a wrong cell does not', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, stars: 15 }));
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="diff"]')!);
    const panels = qa(ctx, '.brain-diff-panel');
    const left = [...panels[0]!.querySelectorAll<HTMLElement>('.brain-diff-cell')];
    const right = [...panels[1]!.querySelectorAll<HTMLElement>('.brain-diff-cell')];
    const odd = left.findIndex((c, i) => c.innerHTML !== right[i]!.innerHTML);
    expect(odd).toBeGreaterThanOrEqual(0);
    tap(left[(odd + 1) % left.length]!);
    expect(ctx.stars).toBe(0);
    tap(right[odd]!);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('sequence: replays after a wrong tap, finishes after the right order', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, stars: 3 }));
    const ctx = fakeContext();
    game.start(ctx);
    tap(q(ctx, '.brain-node[data-station="sequence"]')!);
    await vi.advanceTimersByTimeAsync(12000);
    const opts = qa(ctx, '.brain-seq-opt');
    expect(q(ctx, '.brain-seq-opts.locked')).toBeNull();
    // Find the order by trying: a wrong tap replays, so tap everything in turn until it is done.
    let guard = 0;
    while (ctx.stars === 0 && guard++ < 40) {
      for (const o of opts) tap(o);
      await vi.advanceTimersByTimeAsync(9000);
    }
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('shows family photos on the cards when a parent added some', async () => {
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(10);
    tap(q(ctx, '.brain-node[data-station="cards"]')!);
    // photos arrive asynchronously; a station entered after that sees them
    tap(q(ctx, '.brain-mapbtn')!);
    tap(q(ctx, '.brain-node[data-station="cards"]')!);
    expect(qa(ctx, '.brain-card .brain-photo').length).toBe(2);
    ctx.cleanup();
  });
});
