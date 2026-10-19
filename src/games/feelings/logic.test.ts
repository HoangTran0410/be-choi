import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { COMFORTS, FACE, MOOD_LINE, REACTIONS, SOOTHES_PER_ROUND, UPSET, giggleLine, nextMood, soothedLine } from './logic';

describe('feelings logic', () => {
  it('needs 5 soothes per round', () => {
    expect(SOOTHES_PER_ROUND).toBe(5);
  });
  it('every mood has a face and a spoken name', () => {
    for (const m of [...UPSET, 'happy' as const]) {
      expect(FACE[m].length).toBeGreaterThan(0);
      expect(MOOD_LINE[m]).toMatch(/^Bé /);
    }
  });
  it('never repeats the previous mood and never picks happy', () => {
    for (let seed = 0; seed < 80; seed++) {
      const rng = mulberry32(seed);
      let prev = nextMood(null, rng);
      for (let i = 0; i < 10; i++) {
        const m = nextMood(prev, rng);
        expect(m).not.toBe(prev);
        expect(UPSET).toContain(m);
        prev = m;
      }
    }
  });
  it('all moods are reachable', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(nextMood(null, mulberry32(seed)));
    expect(seen.size).toBe(UPSET.length);
  });
  it('every mood and comfort combination reads as a happy ending', () => {
    for (const m of UPSET) {
      for (const c of COMFORTS) {
        const line = soothedLine(m, c);
        expect(line.startsWith(MOOD_LINE[m])).toBe(true);
        expect(line.endsWith('bé vui!')).toBe(true);
        expect(line).toContain(REACTIONS[c].done);
      }
    }
    expect(soothedLine('sad', 'hug')).toBe('Bé buồn quá… được ôm rồi, bé vui!');
  });
  it('giggles name the comfort', () => {
    for (const c of COMFORTS) expect(giggleLine(c)).toContain(REACTIONS[c].done);
  });
});
