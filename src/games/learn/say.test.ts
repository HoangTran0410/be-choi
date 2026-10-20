import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechPart } from '../../core/speech';
import { WORD_RATE } from '../../core/say';
import { createSayer, partFor, type Voice } from './say';
import { createScope } from './scope';
import { exploreTabs } from './explore';
import { peopleFrom } from './curriculum';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A voice that records what it was asked to say and lets the test decide when it is "done". */
function fakeVoice() {
  const calls: SpeechPart[][] = [];
  const resolvers: Array<(ok: boolean) => void> = [];
  let stops = 0;
  const voice: Voice = {
    speakSeq(parts) {
      // A new sequence cuts the old one off, like the real speech does.
      resolvers.splice(0).forEach((r) => r(false));
      calls.push(parts);
      return new Promise<boolean>((res) => resolvers.push(res));
    },
    stopSpeech() {
      resolvers.splice(0).forEach((r) => r(false));
      stops++;
    },
  };
  return { voice, calls, stops: () => stops, finish: () => resolvers.splice(0).forEach((r) => r(true)) };
}

describe('the teacher speaks one short phrase at a time', () => {
  it('says all phrases as one slow sequence with gaps; names slower than sentences', () => {
    const v = fakeVoice();
    const scope = createScope();
    const sayer = createSayer(v.voice, scope);
    sayer.say(['Chữ bê', 'Cái nào bắt đầu bằng chữ này?']);
    expect(v.calls).toHaveLength(1);
    const [name, ask] = v.calls[0]!;
    expect(name).toMatchObject({ text: 'Chữ bê', rate: WORD_RATE });
    expect(name!.pauseAfterMs).toBeGreaterThanOrEqual(600);
    expect(ask!.rate).toBeGreaterThan(name!.rate!);
    expect(ask!.rate).toBeLessThanOrEqual(0.85);
    scope.dispose();
  });

  it('a new sentence cuts off the old one: its callbacks never fire', async () => {
    const v = fakeVoice();
    const scope = createScope();
    const sayer = createSayer(v.voice, scope);
    const old = vi.fn();
    sayer.say(['một', 'hai', 'ba'], { onDone: old });
    sayer.say(['Chữ a']);
    v.finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(old).not.toHaveBeenCalled();
    expect(v.calls.map((c) => c.map((p) => p.text))).toEqual([['một', 'hai', 'ba'], ['Chữ a']]);
    scope.dispose();
  });

  it('stop() silences the voice, and leaving clears the timers', async () => {
    const v = fakeVoice();
    const scope = createScope();
    const sayer = createSayer(v.voice, scope);
    sayer.say(['a', 'b', 'c']);
    sayer.stop();
    expect(v.stops()).toBe(1);
    expect(sayer.busy()).toBe(false);
    sayer.say(['x', 'y'], { delay: 1000 });
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20000);
    expect(v.calls.map((c) => c[0]!.text)).toEqual(['a']);
  });

  it('waits out a delay, reports each phrase as it starts and when it is all done', async () => {
    const v = fakeVoice();
    const scope = createScope();
    const sayer = createSayer(v.voice, scope);
    const started: number[] = [];
    let done = false;
    sayer.say([{ text: 'một', gap: 100 }, 'hai'], { delay: 500, onPart: (i) => started.push(i), onDone: () => (done = true) });
    expect(sayer.busy()).toBe(true);
    expect(v.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(v.calls).toHaveLength(1);
    expect(v.calls[0]![0]!.pauseAfterMs).toBe(100);
    v.calls[0]!.forEach((p) => p.onStart?.());
    expect(started).toEqual([0, 1]);
    expect(done).toBe(false);
    v.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(sayer.busy()).toBe(false);
    scope.dispose();
  });

  it('keeps an explicit gap and treats one or two words as a name', () => {
    expect(partFor({ text: 'bóng', gap: 200 }).pauseAfterMs).toBe(200);
    expect(partFor('Số ba').rate).toBe(WORD_RATE);
    expect(partFor('Cái nào bắt đầu bằng chữ này?').rate).toBeGreaterThan(WORD_RATE);
  });
});

describe('Khám phá content', () => {
  it('has a card for every letter with three pictures revealed in step with the words', () => {
    const tabs = exploreTabs({ people: [] });
    expect(tabs.map((t) => t.id)).toEqual(['letters', 'numbers', 'animals', 'colors', 'shapes']);
    const letters = tabs[0]!.tiles;
    expect(letters.length).toBe(29);
    for (const t of letters) {
      expect(t.gallery.length).toBe(3);
      expect(t.parts.filter((p) => p.reveal !== undefined).map((p) => p.reveal)).toEqual([0, 1, 2]);
    }
    const four = tabs[1]!.tiles[3]!;
    expect(four.gallery.length).toBe(4);
  });

  it('adds the family tab only when there are photos, one card per person', () => {
    const people = peopleFrom([
      { id: '1', url: 'a', name: 'Mẹ' },
      { id: '2', url: 'b', name: 'Mẹ' },
      { id: '3', url: 'c' },
    ]);
    const tabs = exploreTabs({ people });
    const family = tabs.find((t) => t.id === 'family')!;
    expect(family.tiles.length).toBe(2);
    expect(family.tiles[0]!.gallery.length).toBe(1);
  });
});
