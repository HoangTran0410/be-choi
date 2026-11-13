import { describe, expect, it, vi } from 'vitest';
import { createSpeech } from './speech';
import { clipHash, manifestFrom, planClips, type ClipHandlers, type VoiceClips } from './voiceClips';
import { voiceKey } from './voiceKey';

function fakeClips(have: string[], fail = false) {
  const played: string[] = [];
  let handlers: ClipHandlers | null = null;
  const keys = new Set(have.map(voiceKey));
  const clips: VoiceClips = {
    lengthOf: (t) => (keys.has(voiceKey(t)) ? 400 : 0),
    play(t, h) {
      played.push(t);
      handlers = h;
      if (fail) queueMicrotask(() => h.onFail());
      else setTimeout(() => h.onEnd(), 10);
      return true;
    },
    stop: vi.fn(),
    warm: vi.fn(),
    ready: () => keys.size > 0,
  };
  return { clips, played, handlers: () => handlers };
}

describe('voiceClips', () => {
  it('hashes keys stably and tells Vietnamese tones apart', () => {
    expect(clipHash('con bò')).toMatch(/^[0-9a-f]{8}$/);
    expect(clipHash('con bò')).toBe(clipHash('con bò'));
    const tones = ['ma', 'mà', 'má', 'mả', 'mã', 'mạ'].map(clipHash);
    expect(new Set(tones).size).toBe(6);
  });

  it('matches the build script exactly', async () => {
    // @ts-expect-error plain .mjs without types
    const lib = (await import('../../scripts/lib/voicekey.mjs')) as { voiceKey(t: string): string; clipHash(k: string): string };
    for (const t of ['Con BÒ  nhé!', 'Số mười lăm…', 'Bé giỏi quá!', 'ụm bò', 'Quả 🍎']) {
      expect(lib.voiceKey(t)).toBe(voiceKey(t));
      expect(lib.clipHash(lib.voiceKey(t))).toBe(clipHash(voiceKey(t)));
    }
  });

  it('stitches a built sentence from the fewest recorded pieces', () => {
    const have = new Set(['có', 'ba', 'quả chuối', 'quả', 'chuối', 'mười lăm', 'bé giỏi quá'].map((t) => clipHash(voiceKey(t))));
    const has = (h: string) => have.has(h);
    const say = (t: string) => planClips(t, has)?.length ?? null;
    expect(say('Bé giỏi quá!')).toBe(1);
    expect(say('Có ba quả chuối.')).toBe(3);
    expect(planClips('Có 15 quả chuối', has)).toEqual(['có', 'mười lăm', 'quả chuối'].map((t) => clipHash(t)));
    expect(say('Có ba quả táo')).toBeNull();
    expect(say('có ba có ba có')).toBeNull(); // 5 pieces: too choppy, let the device say it
  });

  it('reads only well-formed manifest entries', () => {
    expect(manifestFrom(null)).toBeNull();
    expect(manifestFrom({ clips: { abcdef12: 500, bad: 3, '0000000z': 1, '12345678': -1 } })?.clips).toEqual({ abcdef12: 500 });
  });

  it('plays a clip for a recorded part and falls back to silence-paced parts otherwise', async () => {
    vi.useFakeTimers();
    const f = fakeClips(['Con bò!']);
    const sp = createSpeech(null, f.clips);
    expect(sp.available()).toBe(true);
    const done = sp.speakSeq([
      { text: 'con bò', pauseAfterMs: 0 },
      { text: 'không có clip', pauseAfterMs: 0 },
    ]);
    await vi.runAllTimersAsync();
    expect(await done).toBe(true);
    expect(f.played).toEqual(['con bò']);
    vi.useRealTimers();
  });

  it('moves on when a clip fails and nothing else can speak', async () => {
    vi.useFakeTimers();
    const f = fakeClips(['một'], true);
    const sp = createSpeech(null, f.clips);
    const done = sp.speakSeq([{ text: 'một', pauseAfterMs: 0 }]);
    await vi.runAllTimersAsync();
    expect(await done).toBe(true);
    vi.useRealTimers();
  });

  it('cancel stops the clip', () => {
    const f = fakeClips(['a']);
    const sp = createSpeech(null, f.clips);
    sp.speak('a');
    expect(sp.speaking?.()).toBe(true);
    sp.cancel();
    expect(f.clips.stop).toHaveBeenCalled();
    expect(sp.speaking?.()).toBe(false);
  });
});
