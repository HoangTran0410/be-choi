import { describe, it, expect } from 'vitest';
import { DRUMS } from '../../core/audio';
import { BEAT_BPM, BEAT_STEPS, beatAt, PADS, STAR_EVERY, stepMs } from './logic';

describe('drums', () => {
  it('has 6 pads with distinct kinds, emojis and names', () => {
    expect(PADS.length).toBe(6);
    expect(new Set(PADS.map((p) => p.kind)).size).toBe(6);
    expect(new Set(PADS.map((p) => p.emoji)).size).toBe(6);
    expect(new Set(PADS.map((p) => p.name)).size).toBe(6);
    for (const p of PADS) {
      expect(DRUMS).toContain(p.kind);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('puts kick on 1 and 3, snare on 2 and 4', () => {
    expect(beatAt(0)).toContain('kick');
    expect(beatAt(0)).toContain('hat');
    expect(beatAt(0)).not.toContain('snare');
    expect(beatAt(4)).toContain('kick');
    expect(beatAt(2)).toContain('snare');
    expect(beatAt(2)).toContain('hat');
    expect(beatAt(2)).not.toContain('kick');
    expect(beatAt(6)).toContain('snare');
  });
  it('wraps past the bar and plays the hat on every step', () => {
    expect(beatAt(8)).toEqual(beatAt(0));
    expect(beatAt(11)).toEqual(beatAt(3));
    expect(beatAt(-1)).toEqual(beatAt(7));
    for (let s = 0; s < BEAT_STEPS; s++) expect(beatAt(s)).toContain('hat');
  });
  it('steps are eighth notes at the given tempo', () => {
    expect(stepMs(100)).toBe(300);
    expect(stepMs(120)).toBe(250);
    expect(stepMs()).toBe(stepMs(BEAT_BPM));
  });
  it('awards a star every 40 hits', () => {
    expect(STAR_EVERY).toBe(40);
  });
});
