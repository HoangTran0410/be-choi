import { beforeEach, describe, expect, it } from 'vitest';
import { emptyBoard, place } from '../bricks/logic';
import { magnetPull, isNear } from './magnet';
import {
  GALLERY_KEY,
  MAX_WORKS,
  PROGRESS_KEY,
  addWork,
  loadGallery,
  loadProgress,
  removeWork,
  saveGallery,
  saveProgress,
  workBounds,
  workFromBoard,
  workSvg,
  type Work,
} from './store';

const work = (id: string, bricks: Work['bricks'] = [[0, 0, 2, 1, '#ef4444']]): Work => ({ id, name: 'tháp', at: 1, bricks });

beforeEach(() => localStorage.clear());

describe('progress', () => {
  it('starts empty and round-trips', () => {
    expect(loadProgress().counts).toEqual({ puzzle: 0, shadow: 0, build: 0 });
    saveProgress({ counts: { puzzle: 3, shadow: 1, build: 2 }, mode: 'build' });
    expect(loadProgress()).toEqual({ counts: { puzzle: 3, shadow: 1, build: 2 }, mode: 'build' });
  });
  it('shrugs off garbage', () => {
    localStorage.setItem(PROGRESS_KEY, '{nope');
    expect(loadProgress().mode).toBe('puzzle');
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, counts: { puzzle: -4, shadow: 'x', build: 2.9 }, mode: 'zzz' }));
    expect(loadProgress()).toEqual({ counts: { puzzle: 0, shadow: 0, build: 2 }, mode: 'puzzle' });
  });
});

describe('cabinet', () => {
  it('keeps the newest first and at most MAX_WORKS', () => {
    let list: Work[] = [];
    for (let i = 0; i < MAX_WORKS + 3; i++) list = addWork(list, work(`w${i}`));
    expect(list).toHaveLength(MAX_WORKS);
    expect(list[0]!.id).toBe(`w${MAX_WORKS + 2}`);
    expect(removeWork(list, list[0]!.id)).toHaveLength(MAX_WORKS - 1);
  });
  it('round-trips and drops broken works', () => {
    saveGallery([work('a'), work('b')]);
    expect(loadGallery().map((w) => w.id)).toEqual(['a', 'b']);
    localStorage.setItem(
      GALLERY_KEY,
      JSON.stringify({
        v: 1,
        works: [{ id: 'x', bricks: [[0, 0, 1, 1, 'url(javascript:1)']] }, { id: 'y', bricks: [[0, 0, 1, 1, '#fff']] }, 7],
      }),
    );
    expect(loadGallery().map((w) => w.id)).toEqual(['y']);
  });
  it('makes a work from the plate, none from an empty one', () => {
    expect(workFromBoard(emptyBoard(), 'x', 5)).toBeNull();
    const b = place(emptyBoard(), { x: 2, y: 0, w: 3, h: 1, color: '#22c55e' });
    const w = workFromBoard(b, 'cầu', 5);
    expect(w?.bricks).toEqual([[2, 0, 3, 1, '#22c55e']]);
  });
  it('draws an svg cropped to the work', () => {
    const w = work('s', [
      [3, 0, 2, 1, '#ef4444'],
      [3, 1, 2, 1, '#3b82f6'],
    ]);
    expect(workBounds(w)).toEqual({ minX: 3, width: 2, height: 2 });
    const svg = workSvg(w);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<circle/g)).toHaveLength(4);
  });
});

describe('magnet', () => {
  it('pulls only inside the radius, harder when nearer, never past the place', () => {
    expect(magnetPull({ x: 100, y: 0 }, 50)).toEqual({ x: 0, y: 0 });
    const far = magnetPull({ x: 40, y: 0 }, 50).x;
    const near = magnetPull({ x: 10, y: 0 }, 50);
    expect(far).toBeGreaterThan(0);
    expect(near.x / 10).toBeGreaterThan(far / 40);
    expect(near.x).toBeLessThan(10);
    expect(isNear(49, 50)).toBe(true);
    expect(isNear(51, 50)).toBe(false);
  });
});
