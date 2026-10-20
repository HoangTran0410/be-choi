import { describe, expect, it } from 'vitest';
import type { Backend } from '../../core/save';
import { SAVE_KEY, freshProgress, loadProgress, saveProgress } from './store';

function mem(initial: Record<string, string> = {}): Backend & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('day progress', () => {
  it('starts fresh with a seed', () => {
    const p = loadProgress(mem());
    expect(p.days).toBe(0);
    expect(p.face).toBeNull();
    expect(p.seed).toBeGreaterThan(0);
  });
  it('round-trips and is stamped with a version', () => {
    const s = mem();
    expect(saveProgress({ days: 4, face: 'p1', lastEvent: 'rain', seed: 42 }, s)).toBe(true);
    expect(JSON.parse(s.data[SAVE_KEY] ?? '{}').v).toBe(1);
    expect(loadProgress(s)).toEqual({ days: 4, face: 'p1', lastEvent: 'rain', seed: 42 });
  });
  it('reads a save with no version and cleans bad fields', () => {
    const s = mem({ [SAVE_KEY]: JSON.stringify({ days: -3.7, face: 5, lastEvent: 'nope', seed: 'x' }) });
    const p = loadProgress(s);
    expect(p.days).toBe(0);
    expect(p.face).toBeNull();
    expect(p.lastEvent).toBeNull();
    expect(p.seed).toBeGreaterThan(0);
  });
  it('refuses a save from a newer app and survives corrupt text', () => {
    expect(loadProgress(mem({ [SAVE_KEY]: JSON.stringify({ v: 9, days: 50 }) })).days).toBe(0);
    expect(loadProgress(mem({ [SAVE_KEY]: '{oops' })).days).toBe(0);
  });
  it('never throws when storage is blocked', () => {
    const blocked: Backend = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(loadProgress(blocked).days).toBe(0);
    expect(saveProgress(freshProgress(), blocked)).toBe(false);
  });
});
