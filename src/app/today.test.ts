import { describe, it, expect } from 'vitest';
import type { GameMeta, Skill } from '../core/types';
import { GAMES } from './registry';
import { dateKeyOf, pickToday } from './today';

const music = new Set<Skill>(['music']);
const calm = new Set<Skill>(['nature', 'care']);
const think = new Set<Skill>(['puzzle', 'logic', 'matching', 'listening', 'sorting', 'memory', 'counting']);

describe('pickToday', () => {
  const day = { dateKey: '2026-10-19' };

  it('is the same for the same day, and varies across days', () => {
    expect(pickToday(GAMES, day).map((g) => g.id)).toEqual(pickToday(GAMES, day).map((g) => g.id));
    const days = new Set(Array.from({ length: 20 }, (_, i) => pickToday(GAMES, { dateKey: `2026-11-${i + 1}` }).map((g) => g.id).join()));
    expect(days.size).toBeGreaterThan(5);
  });

  it('gives three different games, one music, one thinking, one calm', () => {
    for (let i = 1; i <= 60; i++) {
      const picks = pickToday(GAMES, { dateKey: `2027-01-${i}` });
      expect(picks).toHaveLength(3);
      expect(new Set(picks.map((g) => g.id)).size).toBe(3);
      expect(picks.filter((g) => music.has(g.skill))).toHaveLength(1);
      expect(picks.filter((g) => think.has(g.skill))).toHaveLength(1);
      expect(picks.filter((g) => calm.has(g.skill))).toHaveLength(1);
    }
  });

  it('prefers games the child has not played lately', () => {
    const musical = GAMES.filter((g) => music.has(g.skill));
    const fresh = musical[0]!;
    const recent = musical.slice(1).flatMap((g) => [g.id, g.id]);
    for (let i = 1; i <= 10; i++) {
      const picks = pickToday(GAMES, { dateKey: `2027-02-${i}`, recent });
      expect(picks.some((g) => g.id === fresh.id)).toBe(true);
    }
  });

  it('never suggests what the parent filter rejects', () => {
    const banned = new Set(GAMES.filter((g) => g.skill === 'music').map((g) => g.id));
    for (let i = 1; i <= 20; i++) {
      const picks = pickToday(GAMES, { dateKey: `2027-03-${i}`, allow: (g) => !banned.has(g.id) });
      expect(picks.some((g) => banned.has(g.id))).toBe(false);
      // The missing kind is filled by something else, still three distinct games.
      expect(new Set(picks.map((g) => g.id)).size).toBe(3);
    }
  });

  it('copes with a tiny pool', () => {
    const two: GameMeta[] = GAMES.slice(0, 2);
    expect(pickToday(two, day)).toHaveLength(2);
    expect(pickToday([], day)).toEqual([]);
  });

  it('formats the local date', () => {
    expect(dateKeyOf(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
