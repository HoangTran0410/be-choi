import { beforeEach, describe, expect, it } from 'vitest';
import { parseVersioned } from '../../core/save';
import { freshProgress, KEY, loadProgress, normalise, saveProgress, SPEC } from './progress';

describe('brain progress', () => {
  beforeEach(() => localStorage.clear());

  it('starts fresh when nothing is saved or the save is garbage', () => {
    expect(loadProgress()).toEqual(freshProgress());
    localStorage.setItem(KEY, '{nope');
    expect(loadProgress()).toEqual(freshProgress());
  });

  it('round-trips and writes a version', () => {
    const p = freshProgress();
    p.stars = 7;
    p.skills.cards.level = 2;
    p.rounds.cards = 4;
    p.avatar = '🦊';
    p.last = 'diff';
    saveProgress(p);
    expect(JSON.parse(localStorage.getItem(KEY)!).v).toBe(1);
    expect(loadProgress()).toEqual({ ...p, last: 'diff' });
  });

  it('refuses a save from a newer app instead of guessing', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 99, stars: 50 }));
    expect(loadProgress()).toEqual(freshProgress());
  });

  it('reads an unversioned save (v0) and clamps nonsense', () => {
    const p = parseVersioned(
      JSON.stringify({ stars: -5, skills: { cards: { level: 99, streak: 'x' }, tubes: null }, avatar: '🦁', island: 5, last: 'zzz' }),
      SPEC,
    )!;
    expect(p.stars).toBe(0);
    expect(p.skills.cards.level).toBe(4);
    expect(p.skills.cards.streak).toBe(0);
    expect(p.skills.tubes.level).toBe(0);
    expect(p.avatar).toBe('🧒'); // not unlocked yet
    expect(p.island).toBe(0);
    expect(p.last).toBeNull();
  });

  it('keeps an avatar and island the stars have really earned', () => {
    const p = normalise({ stars: 30, avatar: '🦁', island: 2 });
    expect(p.avatar).toBe('🦁');
    expect(p.island).toBe(2);
  });

  it('does not throw when storage is blocked', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(loadProgress()).toEqual(freshProgress());
    } finally {
      Storage.prototype.getItem = real;
    }
  });
});
