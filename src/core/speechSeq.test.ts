import { describe, it, expect, vi } from 'vitest';
import { createSpeech } from './speech';

(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(t: string) {
    this.text = t;
  }
};

type U = SpeechSynthesisUtterance;

function seqSynth() {
  const queue: U[] = [];
  const log: string[] = [];
  const synth = {
    getVoices: () => [{ lang: 'vi-VN', name: 'Linh', localService: true }] as SpeechSynthesisVoice[],
    speak: (u: U) => {
      queue.push(u);
      log.push(`speak:${u.text}@${u.rate}`);
    },
    cancel: () => log.push('cancel'),
    addEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;
  /** The engine finishes the oldest unfinished utterance. */
  const finish = () => (queue.shift() as unknown as { onend?: () => void } | undefined)?.onend?.();
  const spoken = () => log.filter((l) => l.startsWith('speak'));
  return { synth, log, finish, spoken };
}

describe('speakSeq', () => {
  it('says parts in order, slowly, waiting for the end and a quiet gap', async () => {
    vi.useFakeTimers();
    const { synth, log, finish } = seqSynth();
    const s = createSpeech(synth);
    const starts: string[] = [];
    const done = s.speakSeq([
      { text: 'bê', rate: 0.65, pauseAfterMs: 1000, onStart: () => starts.push('bê') },
      { text: 'bóng', onStart: () => starts.push('bóng') },
    ]);
    expect(log).toEqual(['cancel', 'speak:bê@0.65']);
    // nothing else is said until the first ends, and then not until the gap has passed
    await vi.advanceTimersByTimeAsync(800);
    expect(log.length).toBe(2);
    finish();
    await vi.advanceTimersByTimeAsync(999);
    expect(log.length).toBe(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(log[2]).toBe('speak:bóng@0.75');
    expect(starts).toEqual(['bê', 'bóng']);
    let resolved: boolean | undefined;
    void done.then((v) => (resolved = v));
    finish();
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it('moves on by itself when the engine never reports the end', async () => {
    vi.useFakeTimers();
    const { synth, spoken } = seqSynth();
    const s = createSpeech(synth);
    const done = s.speakSeq([{ text: 'một' }, { text: 'hai' }]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(spoken()).toEqual(['speak:một@0.75', 'speak:hai@0.75']);
    await expect(done).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('a new sequence cuts the old one off without any overlap', async () => {
    vi.useFakeTimers();
    const { synth, log, finish, spoken } = seqSynth();
    const s = createSpeech(synth);
    const first = s.speakSeq([{ text: 'bê' }, { text: 'bóng' }]);
    const second = s.speakSeq([{ text: 'em mờ' }]);
    await expect(first).resolves.toBe(false);
    // the cancelled utterance reports its end late; it must not start 'bóng'
    finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(spoken()).toEqual(['speak:bê@0.75', 'speak:em mờ@0.75']);
    expect(log.filter((l) => l === 'cancel').length).toBe(2);
    await expect(second).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('speak() and cancel() also stop a running sequence; interrupt:false does not', async () => {
    vi.useFakeTimers();
    const { synth, spoken } = seqSynth();
    const s = createSpeech(synth);
    const a = s.speakSeq([{ text: 'một' }, { text: 'hai' }]);
    s.speak('ba', { interrupt: false, rate: 0.5 });
    expect(spoken()).toContain('speak:ba@0.5');
    s.speak('bốn');
    await expect(a).resolves.toBe(false);
    const b = s.speakSeq([{ text: 'năm' }]);
    s.cancel();
    await expect(b).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(spoken().some((l) => l.includes('hai'))).toBe(false);
    vi.useRealTimers();
  });

  it('still steps through the parts (silently) with voice off or no synth', async () => {
    vi.useFakeTimers();
    const off = seqSynth();
    const muted = createSpeech(off.synth);
    muted.setEnabled(false);
    for (const [s, spoken] of [
      [muted, off.spoken],
      [createSpeech(null), () => [] as string[]],
    ] as const) {
      const seen: string[] = [];
      const done = s.speakSeq([{ text: 'một', onStart: () => seen.push('một') }, { text: 'hai', onStart: () => seen.push('hai') }]);
      expect(seen).toEqual(['một']);
      await vi.advanceTimersByTimeAsync(5000);
      expect(seen).toEqual(['một', 'hai']);
      await expect(done).resolves.toBe(true);
      expect(spoken()).toEqual([]);
    }
    vi.useRealTimers();
  });

  it('survives a throwing engine or callback', async () => {
    vi.useFakeTimers();
    const synth = {
      getVoices: () => [{ lang: 'vi-VN', name: 'Linh', localService: true }] as SpeechSynthesisVoice[],
      speak: () => {
        throw new Error('boom');
      },
      cancel: () => undefined,
      addEventListener: vi.fn(),
    } as unknown as SpeechSynthesis;
    const s = createSpeech(synth);
    const done = s.speakSeq([
      {
        text: 'a',
        onStart: () => {
          throw new Error('cb');
        },
      },
    ]);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toBe(true);
    vi.useRealTimers();
  });
});
