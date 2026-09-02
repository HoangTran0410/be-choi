import { describe, it, expect } from 'vitest';
import { createStore } from './storage';

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('store', () => {
  it('adds, reads, resets stars and persists', () => {
    const s = mem();
    const a = createStore(s);
    expect(a.stars('x')).toBe(0);
    expect(a.addStar('x')).toBe(1);
    a.addStar('x');
    const b = createStore(s);
    expect(b.stars('x')).toBe(2);
    b.resetStars();
    expect(createStore(s).stars('x')).toBe(0);
  });
  it('totals stars and keeps unique stickers, reset clears both', () => {
    const s = mem();
    const a = createStore(s);
    a.addStar('x');
    a.addStar('y');
    expect(a.totalStars()).toBe(2);
    a.addSticker('🐻');
    a.addSticker('🐻');
    a.addSticker('🦊');
    expect(createStore(s).stickers()).toEqual(['🐻', '🦊']);
    a.resetStars();
    expect(createStore(s).stickers()).toEqual([]);
    expect(a.totalStars()).toBe(0);
  });
  it('settings default and patch persist', () => {
    const s = mem();
    const a = createStore(s);
    expect(a.settings()).toEqual({ sound: true, voice: true });
    expect(a.setSettings({ voice: false }).voice).toBe(false);
    expect(createStore(s).settings()).toEqual({ sound: true, voice: false });
  });
  it('survives a throwing storage', () => {
    const bad = {
      getItem() {
        throw new Error('x');
      },
      setItem() {
        throw new Error('x');
      },
    } as unknown as Storage;
    const a = createStore(bad);
    expect(a.addStar('x')).toBe(1);
    expect(a.stars('x')).toBe(1);
  });
  it('ignores corrupt json', () => {
    const s = mem();
    s.setItem('be-choi:v1', '{nope');
    expect(createStore(s).stars('x')).toBe(0);
  });
});
