import { describe, it, expect } from 'vitest';
import { createChecklist } from '../../core/chores';
import { ANIMALS } from '../../core/content';
import { mulberry32 } from '../../core/dom';
import { SONGS } from '../../core/music';
import {
  CHEERS,
  JOBS,
  JOB_ICON,
  LULLABY_BPM,
  LULLABY_NOTES,
  MAX_TOYS,
  MIN_TOYS,
  NUDGES,
  TOYS,
  TOY_ACROSS,
  TOY_DOWN,
  TOY_MAX_X,
  UNDOS,
  makeNight,
  toyCount,
  type Job,
} from './logic';

describe('the evening', () => {
  it('has four jobs, none of which waits for another', () => {
    expect([...JOBS].sort()).toEqual(['blanket', 'light', 'lullaby', 'toys']);
    const chores = createChecklist(JOBS);
    // Back to front, which is exactly what a two-year-old does.
    for (const job of ['lullaby', 'blanket', 'light'] as Job[]) chores.set(job, true);
    expect(chores.left()).toEqual(['toys']);
    expect(chores.allDone()).toBe(false);
    chores.set('toys', true);
    expect(chores.allDone()).toBe(true);
  });

  it('has a picture, a nudge and a cheer for every job', () => {
    for (const job of JOBS as Job[]) {
      expect(JOB_ICON[job].length).toBeGreaterThan(0);
      expect(NUDGES[job].length).toBeGreaterThan(0);
      expect(CHEERS[job].length).toBeGreaterThan(0);
    }
  });

  it('has something to say when the switches go back the other way', () => {
    expect(UNDOS.light?.length).toBeGreaterThan(0);
    expect(UNDOS.blanket?.length).toBeGreaterThan(0);
  });

  it('sings a short piece of a song the app already knows', () => {
    expect(SONGS[0]?.notes.length).toBeGreaterThan(LULLABY_NOTES);
    expect(LULLABY_BPM).toBeGreaterThan(0);
  });
});

describe('a night', () => {
  it('gives more toys to tidy as the child gets the hang of it', () => {
    expect(toyCount(0)).toBe(MIN_TOYS);
    expect(toyCount(1)).toBe(3);
    expect(toyCount(9)).toBe(MAX_TOYS);
  });

  it('puts a friend to bed with their toys on the floor', () => {
    const night = makeNight(1, mulberry32(4));
    expect(ANIMALS).toContainEqual(night.friend);
    expect(night.toys.length).toBe(toyCount(1));
    expect(new Set(night.toys.map((t) => t.emoji)).size).toBe(night.toys.length);
    for (const toy of night.toys) expect(TOYS).toContain(toy.emoji);
  });

  it('leaves the toys apart, on the floor, and clear of the basket', () => {
    for (let seed = 1; seed < 40; seed++) {
      const night = makeNight(9, mulberry32(seed));
      for (const toy of night.toys) {
        expect(toy.x).toBeGreaterThan(8);
        expect(toy.x).toBeLessThanOrEqual(TOY_MAX_X);
        expect(toy.y).toBeGreaterThan(15);
        expect(toy.y).toBeLessThan(90);
      }
      for (let i = 0; i < night.toys.length; i++) {
        for (let j = i + 1; j < night.toys.length; j++) {
          const a = night.toys[i]!;
          const b = night.toys[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(Math.min(TOY_ACROSS, TOY_DOWN) * 0.5);
        }
      }
    }
  });

  it('puts a different friend to bed the next night', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(makeNight(0, mulberry32(seed), '🐨').friend.emoji).not.toBe('🐨');
    }
  });
});
