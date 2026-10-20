import { describe, expect, it } from 'vitest';
import { createSpeech } from './speech';

function fakeSynth(voices: Partial<SpeechSynthesisVoice>[]) {
  const said: SpeechSynthesisUtterance[] = [];
  const synth = {
    getVoices: () => voices as SpeechSynthesisVoice[],
    speak: (u: SpeechSynthesisUtterance) => void said.push(u),
    cancel: () => undefined,
    addEventListener: () => undefined,
    speaking: false,
  } as unknown as SpeechSynthesis;
  return { synth, said };
}

class Utterance {
  lang = '';
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  constructor(public text: string) {}
}

describe('voice choice', () => {
  const g = globalThis as { SpeechSynthesisUtterance?: unknown };
  g.SpeechSynthesisUtterance = Utterance;
  const voices = [
    { voiceURI: 'en', name: 'Samantha', lang: 'en-US', localService: true },
    { voiceURI: 'linh', name: 'Linh', lang: 'vi-VN', localService: true },
    { voiceURI: 'an', name: 'An', lang: 'vi-VN', localService: false },
  ];

  it('lists only Vietnamese voices', () => {
    const { synth } = fakeSynth(voices);
    expect(createSpeech(synth).voices?.()).toEqual([
      { id: 'linh', name: 'Linh' },
      { id: 'an', name: 'An' },
    ]);
  });

  it('uses the chosen voice and pitch, and falls back when the voice is gone', () => {
    const { synth, said } = fakeSynth(voices);
    const s = createSpeech(synth);
    s.speak('a');
    expect(said[0]!.voice?.voiceURI).toBe('linh');
    s.setVoice?.('an');
    s.setPitch?.('high');
    s.speak('b');
    expect(said[1]!.voice?.voiceURI).toBe('an');
    expect(said[1]!.pitch).toBe(1.35);
    s.setVoice?.('missing');
    s.speak('c');
    expect(said[2]!.voice?.voiceURI).toBe('linh');
  });
});
