import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHint, gateSpeech, QUIET_POLICY } from './hint';
import { fakeContext } from './testing';

const S = 1000;

/** A game that, like most, says its prompt every time the idle hint fires and wiggles a thing. */
function idleGame(ctx: ReturnType<typeof fakeContext>) {
  const wiggles = { n: 0 };
  ctx.hint.arm(() => {
    wiggles.n++;
    ctx.speak('Bé chạm vào đây nhé');
    void ctx.speakSeq([{ text: 'Con mèo đâu rồi' }]);
  });
  return wiggles;
}

describe('hint stretching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits 10 s, 20 s, 40 s, then 60 s; a touch starts over', () => {
    const fn = vi.fn();
    const hint = createHint();
    hint.arm(fn); // the game default of 6000 is only a floor
    vi.advanceTimersByTime(9_999);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(19_999);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(40_000);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(59_999);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(4);
    hint.touch();
    vi.advanceTimersByTime(9_999);
    expect(fn).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(5);
    hint.clear();
  });

  it('lets a game ask for a longer wait', () => {
    const fn = vi.fn();
    const hint = createHint();
    hint.arm(fn, 15_000);
    vi.advanceTimersByTime(14_999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    hint.clear();
  });

  it('is active only while the callback runs, and a touch from inside is not the child', () => {
    let seen = false;
    const hint = createHint({ stretch: false });
    hint.arm(() => {
      seen = hint.active === true;
      hint.touch();
    }, 1000);
    vi.advanceTimersByTime(1000);
    expect(seen).toBe(true);
    expect(hint.active).not.toBe(true);
    expect(hint.epoch).toBe(0);
    hint.clear();
  });
});

describe('quiet voice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('child idle for 10 minutes: only three spoken hints, but every hint still runs its picture part', () => {
    const ctx = fakeContext({ quiet: true });
    const w = idleGame(ctx);
    vi.advanceTimersByTime(10 * 60 * S);
    expect(ctx.spoken.length).toBe(3);
    expect(ctx.sequenced.length).toBe(3);
    // hints at 10, 30, 70, 130, 190 ... 550 s
    expect(w.n).toBeGreaterThanOrEqual(10);
    ctx.cleanup();
  });

  it('first spoken hint at 10 s, then 20 s and 40 s later, then silence', () => {
    const ctx = fakeContext({ quiet: true });
    idleGame(ctx);
    vi.advanceTimersByTime(9_999);
    expect(ctx.spoken.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(ctx.spoken.length).toBe(1);
    vi.advanceTimersByTime(20 * S);
    expect(ctx.spoken.length).toBe(2);
    vi.advanceTimersByTime(40 * S);
    expect(ctx.spoken.length).toBe(3);
    vi.advanceTimersByTime(120 * S);
    expect(ctx.spoken.length).toBe(3);
    ctx.cleanup();
  });

  it('a touch gives the hint its voice back', () => {
    const ctx = fakeContext({ quiet: true });
    idleGame(ctx);
    vi.advanceTimersByTime(5 * 60 * S);
    expect(ctx.spoken.length).toBe(3);
    ctx.tap();
    vi.advanceTimersByTime(10 * S);
    expect(ctx.spoken.length).toBe(4);
    ctx.cleanup();
  });

  it('speech answering a touch is never held back', () => {
    const ctx = fakeContext({ quiet: true });
    for (let i = 0; i < 10; i++) {
      ctx.tap();
      ctx.speak(`Đúng rồi ${i}`);
      vi.advanceTimersByTime(1000);
    }
    expect(ctx.spoken.length).toBe(10);
    ctx.cleanup();
  });

  it('a follow-up just after a touch is said; a game repeating itself every 2.5 s is held to one per 8 s', () => {
    const ctx = fakeContext({ quiet: true });
    vi.advanceTimersByTime(QUIET_POLICY.openingMs);
    ctx.tap();
    vi.advanceTimersByTime(3 * S);
    ctx.speak('Câu hỏi tiếp theo');
    expect(ctx.spoken.length).toBe(1);
    let repeats = 0;
    const id = setInterval(() => {
      ctx.speak('Con mèo đâu nhỉ');
      repeats++;
    }, 2500);
    vi.advanceTimersByTime(5 * 60 * S);
    clearInterval(id);
    expect(repeats).toBeGreaterThan(100);
    // the follow-up, two more inside the engaged window, then one per 8 s
    expect(ctx.spoken.length).toBeLessThanOrEqual(3 + Math.ceil((5 * 60) / 8));
    expect(ctx.spoken.length).toBeGreaterThan(5);
    ctx.cleanup();
  });

  it('automatic speech never cuts a line being said, a touch may', () => {
    const hint = createHint();
    let busy = true;
    const calls: string[] = [];
    const g = gateSpeech({
      hint,
      speak: (t) => void calls.push(t),
      speakSeq: () => Promise.resolve(true),
      stopSpeech: () => undefined,
      busy: () => busy,
    });
    vi.advanceTimersByTime(60 * S);
    g.speak('a');
    expect(calls).toEqual([]);
    busy = false;
    g.speak('b');
    expect(calls).toEqual(['b']);
    g.touched();
    busy = true;
    g.speak('c');
    expect(calls).toEqual(['b', 'c']);
    g.dispose();
  });

  it('a muted speakSeq still runs onStart in order and resolves true', async () => {
    const ctx = fakeContext({ quiet: true });
    const started: string[] = [];
    let result: boolean | null = null;
    let n = 0;
    ctx.hint.arm(() => {
      n++;
      if (n <= 3) {
        ctx.speak('x');
        return;
      }
      void ctx
        .speakSeq([
          { text: 'một', onStart: () => started.push('1') },
          { text: 'hai', onStart: () => started.push('2') },
        ])
        .then((r) => (result = r));
    });
    vi.advanceTimersByTime((10 + 20 + 40) * S);
    expect(ctx.spoken.length).toBe(3);
    vi.advanceTimersByTime(60 * S); // fourth hint: muted
    expect(started).toEqual(['1']);
    expect(ctx.sequenced).toEqual([]);
    vi.advanceTimersByTime(5 * S);
    await Promise.resolve();
    expect(started).toEqual(['1', '2']);
    expect(result).toBe(true);
    ctx.cleanup();
  });

  it('the welcome waits for the spoken title instead of being dropped', async () => {
    let busy = true;
    const calls: string[] = [];
    const g = gateSpeech({
      hint: createHint(),
      speak: (t) => void calls.push(t),
      speakSeq: (parts) => {
        calls.push(parts.map((p) => p.text).join(' '));
        return Promise.resolve(true);
      },
      stopSpeech: () => undefined,
      busy: () => busy,
    });
    g.speak('Kéo robot lên sân khấu');
    let done: boolean | null = null;
    void g.speakSeq([{ text: 'Chào bé' }]).then((r) => (done = r));
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
    busy = false;
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
    // the newer line replaces the one still waiting
    expect(calls).toEqual(['Chào bé']);
    expect(done).toBe(true);
    g.dispose();
  });

  it('a welcome is said even if the title never seems to end', () => {
    const calls: string[] = [];
    const g = gateSpeech({
      hint: createHint(),
      speak: (t) => void calls.push(t),
      speakSeq: () => Promise.resolve(true),
      stopSpeech: () => undefined,
      busy: () => true,
    });
    g.speak('Chào bé');
    vi.advanceTimersByTime(QUIET_POLICY.openingWaitMs + 200);
    expect(calls).toEqual(['Chào bé']);
    g.dispose();
  });

  it('nothing is left running after cleanup', () => {
    const ctx = fakeContext({ quiet: true });
    idleGame(ctx);
    vi.advanceTimersByTime(60 * S);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the constants in one table', () => {
    expect(QUIET_POLICY.hintSchedule).toEqual([10_000, 20_000, 40_000]);
    expect(QUIET_POLICY.hintSteadyMs).toBe(60_000);
    expect(QUIET_POLICY.maxSpokenHints).toBe(3);
    expect(QUIET_POLICY.spokenHintGapMs).toBe(15_000);
    expect(QUIET_POLICY.autoSpeechGapMs).toBe(8_000);
    expect(QUIET_POLICY.touchWindowMs).toBe(1_500);
  });
});
