import { describe, expect, it } from 'vitest';
import { PICTURES } from '../trace/pictures';
import {
  COLOR_STEPS,
  THEMES,
  TOTAL_STAMPS,
  nextMilestone,
  pickNextPicture,
  pictureCount,
  slow,
  stampName,
  themeComplete,
  themeOf,
  themeProgress,
  unlockedBrushes,
  unlockedColors,
  unlockedThemes,
  unlocksBetween,
} from './progress';

describe('slow voice text', () => {
  it('pauses after the first word', () => {
    expect(slow('màu đỏ')).toBe('Màu… đỏ.');
    expect(slow('ông mặt trời')).toBe('Ông… mặt trời.');
    expect(slow('Tập')).toBe('Tập.');
    expect(slow('  ')).toBe('');
  });
});

describe('unlocks by pictures finished', () => {
  it('starts with six colours, two pens, two themes and eight pictures', () => {
    expect(unlockedColors(0).length).toBe(6);
    expect(unlockedBrushes(0).map((b) => b.kind)).toEqual(['pen', 'crayon']);
    expect(unlockedThemes(0).map((t) => t.id)).toEqual(['pets', 'nature']);
    expect(pictureCount(0, PICTURES.length)).toBe(8);
  });
  it('only ever adds', () => {
    let prev = { c: 0, b: 0, t: 0, p: 0 };
    for (let n = 0; n <= 20; n++) {
      const now = { c: unlockedColors(n).length, b: unlockedBrushes(n).length, t: unlockedThemes(n).length, p: pictureCount(n, PICTURES.length) };
      expect(now.c).toBeGreaterThanOrEqual(prev.c);
      expect(now.b).toBeGreaterThanOrEqual(prev.b);
      expect(now.t).toBeGreaterThanOrEqual(prev.t);
      expect(now.p).toBeGreaterThanOrEqual(prev.p);
      prev = now;
    }
    expect(unlockedColors(99).length).toBe(COLOR_STEPS.length);
    expect(unlockedThemes(99).length).toBe(THEMES.length);
    expect(pictureCount(99, PICTURES.length)).toBe(PICTURES.length);
    expect(pictureCount(-3, 24)).toBe(8);
  });
  it('lists exactly what opens between two counts', () => {
    const u = unlocksBetween(1, 3, PICTURES);
    expect(u.filter((x) => x.kind === 'color').length).toBe(2); // purple at 2, brown at 3
    expect(u.some((x) => x.kind === 'brush')).toBe(true); // rainbow at 3
    expect(u.some((x) => x.kind === 'theme')).toBe(true); // food at 2
    expect(u.filter((x) => x.kind === 'picture').length).toBe(4);
    expect(unlocksBetween(3, 3, PICTURES)).toEqual([]);
    expect(unlocksBetween(5, 2, PICTURES)).toEqual([]);
  });
  it('points at the next milestone until everything is open', () => {
    const m = nextMilestone(0, PICTURES)!;
    expect(m.at).toBe(1);
    expect(m.remaining).toBe(1);
    expect(m.preview.name.length).toBeGreaterThan(0);
    expect(nextMilestone(1, PICTURES)!.at).toBe(2);
    expect(nextMilestone(99, PICTURES)).toBeNull();
  });
});

describe('stamp collection', () => {
  it('has six distinct, named stamps in each of seven themes', () => {
    const all = THEMES.flatMap((t) => t.items.map((i) => i.emoji));
    expect(all.length).toBe(TOTAL_STAMPS);
    expect(new Set(all).size).toBe(all.length);
    for (const t of THEMES) {
      expect(t.items.length).toBe(6);
      for (const i of t.items) expect(i.name.length).toBeGreaterThan(0);
    }
    expect(stampName('🐶')).toBe('con chó');
    expect(stampName('🦄')).toBe('');
    expect(themeOf('🚗')?.id).toBe('vehicles');
  });
  it('counts a theme as complete only when every stamp is collected', () => {
    const pets = THEMES[0]!;
    const five = pets.items.slice(0, 5).map((i) => i.emoji);
    expect(themeProgress(pets, five)).toBe(5);
    expect(themeComplete(pets, five)).toBe(false);
    expect(themeComplete(pets, [...five, pets.items[5]!.emoji])).toBe(true);
  });
});

describe('pickNextPicture', () => {
  it('offers unseen pictures first, in order, then anything but the one just drawn', () => {
    const ids = ['a', 'b', 'c'];
    expect(pickNextPicture(ids, new Set(), null)).toBe('a');
    expect(pickNextPicture(ids, new Set(['a']), 'a')).toBe('b');
    expect(pickNextPicture(ids, new Set(ids), 'c', () => 0)).toBe('a');
    expect(pickNextPicture(['a'], new Set(['a']), 'a')).toBe('a');
    expect(pickNextPicture([], new Set(), null)).toBeNull();
  });
});
