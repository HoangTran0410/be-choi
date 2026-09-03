import { describe, it, expect } from 'vitest';
import { AUDIENCE, NOTE_EMOJI, pitchBand } from './logic';

describe('pitchBand', () => {
  it('splits low, middle and high, and treats silence as middle', () => {
    expect(pitchBand(180)).toBe(0);
    expect(pitchBand(330)).toBe(1);
    expect(pitchBand(600)).toBe(2);
    expect(pitchBand(null)).toBe(1);
    expect(pitchBand(Number.NaN)).toBe(1);
  });

  it('always picks a note emoji that exists', () => {
    for (const hz of [100, 300, 800, null]) expect(NOTE_EMOJI[pitchBand(hz)]).toBeDefined();
  });
});

describe('audience', () => {
  it('is a small row of distinct animals', () => {
    expect(AUDIENCE.length).toBe(6);
    expect(new Set(AUDIENCE).size).toBe(AUDIENCE.length);
  });
});
