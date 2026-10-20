import { describe, expect, it } from 'vitest';
import { MAX_THUMB_CHARS, MAX_WORKS, STORAGE_KEY, createGallery, emptyBook, parseBook, serializeBook, trimBook, type Artwork } from './gallery';

const THUMB = 'data:image/jpeg;base64,AAAA';

function memory(limit = Infinity) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const total = [...map.entries()].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length;
      if (total > limit) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

const work = (title = '') => ({ mode: 'free' as const, thumb: THUMB, w: 300, h: 400, title });

describe('gallery', () => {
  it('starts empty and keeps what is added, across a reload', () => {
    const store = memory();
    const g = createGallery(store);
    expect(g.list()).toEqual([]);
    const r = g.add(work('ngôi nhà'));
    expect(r.kept).toBe(true);
    expect(r.art?.title).toBe('ngôi nhà');
    expect(g.made()).toBe(1);
    const again = createGallery(store);
    expect(again.list().length).toBe(1);
    expect(again.list()[0]?.id).toBe(r.art?.id);
    expect(again.made()).toBe(1);
  });

  it('refuses a thumbnail that is not an image or is absurdly big', () => {
    const g = createGallery(memory());
    expect(g.add({ ...work(), thumb: 'hello' }).art).toBeNull();
    expect(g.add({ ...work(), thumb: 'data:image/png;base64,' + 'A'.repeat(MAX_THUMB_CHARS) }).art).toBeNull();
    expect(g.add({ ...work(), w: 0 }).art).toBeNull();
    expect(g.made()).toBe(0);
  });

  it('keeps at most MAX_WORKS pages: the oldest make room, but made never goes down', () => {
    const g = createGallery(memory());
    const first = g.add(work('đầu tiên')).art!;
    for (let i = 0; i < MAX_WORKS + 4; i++) g.add(work(String(i)));
    expect(g.list().length).toBe(MAX_WORKS);
    expect(g.get(first.id)).toBeUndefined();
    expect(g.made()).toBe(MAX_WORKS + 5);
  });

  it('never drops the wallpaper to make room', () => {
    const g = createGallery(memory());
    const keep = g.add(work('phông')).art!;
    g.setWallpaper(keep.id);
    for (let i = 0; i < MAX_WORKS + 3; i++) g.add(work(String(i)));
    expect(g.get(keep.id)).toBeDefined();
    expect(g.wallpaper()?.id).toBe(keep.id);
  });

  it('on a full disk lets go of the oldest pages until the new one fits', () => {
    const big = 'data:image/jpeg;base64,' + 'B'.repeat(3000);
    const store = memory(9000);
    const g = createGallery(store);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(g.add({ ...work(String(i)), thumb: big }).art!.id);
    expect(g.list().length).toBeLessThan(6);
    expect(g.get(ids[5]!)).toBeDefined();
    expect(g.get(ids[0]!)).toBeUndefined();
    // what is on disk is what is in memory
    expect(parseBook(store.map.get(STORAGE_KEY) ?? null).works.map((w) => w.id)).toEqual(g.list().map((w) => w.id));
  });

  it('blocked storage: nothing throws, the book lives in memory, and pages are not thrown away for it', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const g = createGallery(blocked);
    for (let i = 0; i < 5; i++) {
      const r = g.add(work(String(i)));
      expect(r.kept).toBe(false);
      expect(r.art).not.toBeNull();
    }
    expect(g.list().length).toBe(5);
    expect(createGallery(null).add(work()).kept).toBe(false);
  });

  it('removing the wallpaper page clears the wallpaper; setWallpaper toggles', () => {
    const g = createGallery(memory());
    const a = g.add(work()).art!;
    const b = g.add(work()).art!;
    g.setWallpaper(a.id);
    expect(g.wallpaper()?.id).toBe(a.id);
    g.setWallpaper(b.id);
    expect(g.wallpaper()?.id).toBe(b.id);
    g.setWallpaper(b.id);
    expect(g.wallpaper()).toBeNull();
    g.setWallpaper(a.id);
    expect(g.remove(a.id)).toBe(true);
    expect(g.wallpaper()).toBeNull();
    expect(g.remove('nope')).toBe(false);
    expect(g.made()).toBe(2);
  });

  it('collects each stamp once and remembers finished themes', () => {
    const store = memory();
    const g = createGallery(store);
    expect(g.collect('🐶')).toBe(true);
    expect(g.collect('🐶')).toBe(false);
    g.markThemeDone('pets');
    g.markThemeDone('pets');
    const again = createGallery(store);
    expect(again.collected()).toEqual(['🐶']);
    expect(again.themesDone()).toEqual(['pets']);
  });

  it('tells listeners when the book changes', () => {
    const g = createGallery(memory());
    let n = 0;
    const off = g.onChange(() => n++);
    const a = g.add(work()).art!;
    g.remove(a.id);
    off();
    g.add(work());
    expect(n).toBe(2);
  });
});

describe('parseBook', () => {
  it('turns anything unusable into an empty book', () => {
    for (const raw of [null, '', 'nope', '[]', '{"v":99,"works":[]}', '{"v":"x"}']) expect(parseBook(raw)).toEqual(emptyBook());
  });
  it('drops malformed pages one by one and fixes up the counters', () => {
    const good: Artwork = { id: 'a', mode: 'copy', at: 1, thumb: THUMB, w: 1, h: 1, title: '' };
    const raw = JSON.stringify({
      v: 1,
      works: [good, { id: 'b' }, { ...good, id: 'c', mode: 'bad' }, { ...good, id: 'd', thumb: 'javascript:alert(1)' }],
      made: 0,
      wallpaper: 'gone',
      collected: ['🐶', 5],
      themesDone: 'x',
    });
    const b = parseBook(raw);
    expect(b.works.map((w) => w.id)).toEqual(['a']);
    expect(b.made).toBe(1);
    expect(b.wallpaper).toBeNull();
    expect(b.collected).toEqual(['🐶']);
    expect(b.themesDone).toEqual([]);
  });
  it('round-trips', () => {
    const b = emptyBook();
    b.works.push({ id: 'a', mode: 'free', at: 5, thumb: THUMB, w: 2, h: 3, title: 't' });
    b.made = 7;
    b.wallpaper = 'a';
    expect(parseBook(serializeBook(b))).toEqual(b);
  });
});

describe('trimBook', () => {
  it('trims by count and by size', () => {
    const b = emptyBook();
    for (let i = 0; i < 10; i++) b.works.push({ id: `w${i}`, mode: 'free', at: i, thumb: THUMB + 'x'.repeat(100), w: 1, h: 1, title: '' });
    expect(trimBook(b, 4).length).toBe(6);
    expect(b.works.map((w) => w.id)).toEqual(['w6', 'w7', 'w8', 'w9']);
    trimBook(b, 4, 300);
    expect(b.works.length).toBeLessThan(4);
    expect(b.works.length).toBeGreaterThanOrEqual(1);
  });
});
