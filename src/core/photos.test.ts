import { describe, it, expect, vi } from 'vitest';
import { cleanName, createPhotoStore, lineArtPixels, MAX_NAME, MAX_PHOTOS } from './photos';

const fakeResize = vi.fn(async (file: Blob) => `data:image/jpeg;base64,${file.size}`);

describe('photo store (memory fallback)', () => {
  it('adds, lists in order, removes and notifies', async () => {
    const store = createPhotoStore(fakeResize);
    const seen: number[] = [];
    const off = store.onChange((p) => seen.push(p.length));
    const added = await store.add([new Blob(['a']), new Blob(['bb'])]);
    expect(added.length).toBe(2);
    const all = await store.list();
    expect(all.map((p) => p.url)).toEqual(['data:image/jpeg;base64,1', 'data:image/jpeg;base64,2']);
    await store.remove(all[0]!.id);
    expect((await store.list()).length).toBe(1);
    expect(seen).toEqual([2, 1]);
    off();
    await store.add([new Blob(['c'])]);
    expect(seen).toEqual([2, 1]);
  });
  it('caps at MAX_PHOTOS and skips files that fail to decode', async () => {
    const flaky = vi.fn(async (file: Blob) => {
      if (file.size === 0) throw new Error('bad');
      return 'data:x';
    });
    const store = createPhotoStore(flaky);
    const files = Array.from({ length: MAX_PHOTOS + 3 }, (_, i) => new Blob([i === 1 ? '' : 'x']));
    const added = await store.add(files);
    expect(added.length).toBe(MAX_PHOTOS);
    expect((await store.list()).length).toBe(MAX_PHOTOS);
  });
});

describe('photo names', () => {
  it('starts without a name, so photos saved before names existed still work', async () => {
    const store = createPhotoStore(fakeResize);
    const [p] = await store.add([new Blob(['a'])]);
    expect(p!.name).toBeUndefined();
    expect((await store.list())[0]!.name).toBeUndefined();
  });
  it('renames, trims, clears and notifies; unknown ids do nothing', async () => {
    const store = createPhotoStore(fakeResize);
    const [p] = await store.add([new Blob(['a'])]);
    const seen: Array<string | undefined> = [];
    store.onChange((list) => seen.push(list[0]?.name));
    await store.rename(p!.id, '  Mẹ  ');
    expect((await store.list())[0]!.name).toBe('Mẹ');
    await store.rename(p!.id, '   ');
    expect((await store.list())[0]!.name).toBeUndefined();
    await store.rename('nope', 'Ba');
    expect(seen).toEqual(['Mẹ', undefined]);
  });
  it('keeps the name when more photos are added', async () => {
    const store = createPhotoStore(fakeResize);
    const [p] = await store.add([new Blob(['a'])]);
    await store.rename(p!.id, 'Ba');
    await store.add([new Blob(['bb'])]);
    expect((await store.list()).map((x) => x.name)).toEqual(['Ba', undefined]);
  });
  it('cleanName collapses spaces and caps the length', () => {
    expect(cleanName('  Bà   ngoại ')).toBe('Bà ngoại');
    expect(cleanName('x'.repeat(40)).length).toBe(MAX_NAME);
  });
});

describe('lineArtPixels', () => {
  it('draws black lines at strong edges and white elsewhere', () => {
    const w = 8;
    const h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x < 4 ? 0 : 255; // vertical edge between x=3 and x=4
        const p = (y * w + x) * 4;
        rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
        rgba[p + 3] = 255;
      }
    }
    const out = lineArtPixels(rgba, w, h);
    const at = (x: number, y: number) => out[(y * w + x) * 4];
    expect(at(3, 4)).toBe(40);
    expect(at(4, 4)).toBe(40);
    expect(at(0, 4)).toBe(255);
    expect(at(7, 4)).toBe(255);
    expect(out[3]).toBe(255);
  });
});
