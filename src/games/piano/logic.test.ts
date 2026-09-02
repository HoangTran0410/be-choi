import { describe, it, expect } from 'vitest';
import { KEYS, keyAt } from './logic';

describe('piano', () => {
  it('has 8 keys from C4 to C5', () => {
    expect(KEYS.length).toBe(8);
    expect(KEYS[0]?.note).toBe('C4');
    expect(KEYS[7]?.note).toBe('C5');
    expect(KEYS[0]?.freq).toBeCloseTo(261.63);
    expect(KEYS[7]?.freq).toBeCloseTo(523.25);
  });
  it('frequencies strictly ascend', () => {
    for (let i = 1; i < KEYS.length; i++) {
      expect(KEYS[i]!.freq).toBeGreaterThan(KEYS[i - 1]!.freq);
    }
  });
  it('animals are 8 distinct emojis with names', () => {
    const emojis = new Set(KEYS.map((k) => k.animal.emoji));
    expect(emojis.size).toBe(8);
    for (const k of KEYS) expect(k.animal.name.length).toBeGreaterThan(0);
  });
  it('colours are 8 distinct hex strings', () => {
    const colors = new Set(KEYS.map((k) => k.color));
    expect(colors.size).toBe(8);
    for (const k of KEYS) expect(k.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('keyAt returns the key or undefined', () => {
    expect(keyAt(0)).toBe(KEYS[0]);
    expect(keyAt(7)).toBe(KEYS[7]);
    expect(keyAt(8)).toBeUndefined();
    expect(keyAt(-1)).toBeUndefined();
  });
});
