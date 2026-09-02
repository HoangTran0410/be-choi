import { describe, it, expect, vi } from 'vitest';
import { createSpeech } from './speech';

(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  constructor(t: string) {
    this.text = t;
  }
};

function fakeSynth(voices: { lang: string; name: string }[]) {
  const spoken: string[] = [];
  const cancel = vi.fn();
  const synth = {
    getVoices: () => voices as SpeechSynthesisVoice[],
    speak: (u: SpeechSynthesisUtterance) => {
      spoken.push(u.text);
    },
    cancel,
    addEventListener: vi.fn(),
    speaking: false,
  } as unknown as SpeechSynthesis;
  return { synth, spoken, cancel };
}

describe('speech', () => {
  it('is a no-op without synth', () => {
    const s = createSpeech(null);
    expect(s.available()).toBe(false);
    expect(() => s.speak('xin chào')).not.toThrow();
    expect(() => s.cancel()).not.toThrow();
  });
  it('is a no-op without a vi voice', () => {
    const { synth, spoken } = fakeSynth([{ lang: 'en-US', name: 'Sam' }]);
    const s = createSpeech(synth);
    s.speak('a');
    expect(spoken).toEqual([]);
    expect(s.available()).toBe(false);
  });
  it('speaks with a vi voice and respects enabled', () => {
    const { synth, spoken, cancel } = fakeSynth([{ lang: 'vi-VN', name: 'Linh' }]);
    const s = createSpeech(synth);
    expect(s.available()).toBe(true);
    s.speak('một');
    expect(spoken).toEqual(['một']);
    expect(cancel).toHaveBeenCalledTimes(1);
    s.speak('hai', { interrupt: false });
    expect(cancel).toHaveBeenCalledTimes(1);
    s.setEnabled(false);
    s.speak('ba');
    expect(spoken).toEqual(['một', 'hai']);
  });
});
