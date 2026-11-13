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
    expect(a.settings()).toEqual({
      sound: true,
      voice: true,
      theme: 'auto',
      stickerPopup: true,
      confetti: true,
      age: 0,
      breakMinutes: 0,
      todayPick: true,
      voiceId: '',
      voicePitch: 'normal',
    });
    expect(a.setSettings({ voice: false }).voice).toBe(false);
    expect(createStore(s).settings()).toEqual({
      sound: true,
      voice: false,
      theme: 'auto',
      stickerPopup: true,
      confetti: true,
      age: 0,
      breakMinutes: 0,
      todayPick: true,
      voiceId: '',
      voicePitch: 'normal',
    });
    expect(a.setSettings({ theme: 'dark' }).theme).toBe('dark');
    // A parent who turned the sticker announcement off should not find it back on.
    expect(a.setSettings({ stickerPopup: false }).stickerPopup).toBe(false);
    expect(createStore(s).settings().stickerPopup).toBe(false);
    // Nor the confetti, which is its own switch.
    expect(a.setSettings({ confetti: false }).confetti).toBe(false);
    expect(createStore(s).settings().confetti).toBe(false);
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
  it('keeps favourite games in the order they were picked, and forgets one when asked', () => {
    const s = mem();
    const a = createStore(s);
    expect(a.favorites()).toEqual([]);
    expect(a.toggleFavorite('drive')).toBe(true);
    a.toggleFavorite('bubbles');
    expect(createStore(s).favorites()).toEqual(['drive', 'bubbles']);
    expect(a.toggleFavorite('drive')).toBe(false);
    expect(createStore(s).favorites()).toEqual(['bubbles']);
  });
});

describe('play report', () => {
  it('adds up play time per day and game, ignoring gaps', () => {
    let t = new Date(2026, 10, 13, 10, 0, 0).getTime();
    const st = createStore(null, () => t);
    st.recordPlay('count');
    t += 30_000;
    st.tickPlay();
    t += 5 * 60_000; // asleep: not counted
    st.tickPlay();
    t += 10_000;
    st.endPlay();
    st.addStar('count');
    const r = st.playReport(7);
    expect(r).toHaveLength(7);
    expect(r[6]!.ms).toBe(40_000);
    expect(r[6]!.games.count).toBe(40_000);
    expect(r[6]!.stars).toBe(1);
    expect(r[0]!.ms).toBe(0);
  });
  it('keeps old saves and odd ages loadable', () => {
    const mem = new Map<string, string>();
    const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } as unknown as Storage;
    mem.set('be-choi:v1', JSON.stringify({ stars: { a: 1 }, settings: { age: 9 } }));
    expect(createStore(fake).settings().age).toBe(0);
    mem.set('be-choi:v1', JSON.stringify({ settings: { age: 6 } }));
    expect(createStore(fake).settings().age).toBe(6);
  });
});
