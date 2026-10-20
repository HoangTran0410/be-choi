import { describe, it, expect } from 'vitest';
import { CAPACITY, createLineup } from './lineup';

describe('lineup', () => {
  it('starts empty with eight seats', () => {
    const l = createLineup();
    expect(l.capacity).toBe(CAPACITY);
    expect(CAPACITY).toBe(8);
    expect(l.count()).toBe(0);
    expect(l.full()).toBe(false);
    expect(l.firstEmpty()).toBe(0);
    expect(l.robots()).toEqual([]);
  });

  it('places robots into empty seats at the middle level, once each', () => {
    const l = createLineup();
    expect(l.place(2, 'kick')).toBe(true);
    expect(l.seat(2)).toEqual({ robot: 'kick', level: 2 });
    expect(l.place(2, 'bass')).toBe(false); // taken
    expect(l.place(3, 'kick')).toBe(false); // already on stage
    expect(l.place(-1, 'bass')).toBe(false);
    expect(l.place(8, 'bass')).toBe(false);
    expect(l.place(0, 'bass', 3)).toBe(true);
    expect(l.robots()).toEqual(['bass', 'kick']);
    expect(l.slotOf('kick')).toBe(2);
    expect(l.slotOf('piano')).toBe(-1);
    expect(l.firstEmpty()).toBe(1);
  });

  it('cycles the level 1 → 2 → 3 → 1', () => {
    const l = createLineup();
    l.place(0, 'kick');
    expect([l.cycle(0), l.cycle(0), l.cycle(0), l.cycle(0)]).toEqual([3, 1, 2, 3]);
    expect(l.cycle(5)).toBe(0);
  });

  it('removes, moves and swaps — and a move that cannot happen changes nothing', () => {
    const l = createLineup();
    l.place(0, 'kick');
    l.place(1, 'bass', 3);
    expect(l.move(0, 4)).toBe('moved');
    expect(l.seat(0)).toBeNull();
    expect(l.seat(4)?.robot).toBe('kick');
    expect(l.move(4, 1)).toBe('swapped');
    expect(l.seat(1)?.robot).toBe('kick');
    expect(l.seat(4)).toEqual({ robot: 'bass', level: 3 });
    expect(l.move(1, 1)).toBe('none');
    expect(l.move(7, 2)).toBe('none');
    expect(l.move(1, 99)).toBe('none');
    expect(l.remove(1)?.robot).toBe('kick');
    expect(l.remove(1)).toBeNull();
    expect(l.count()).toBe(1);
  });

  it('knows when it is full, and snapshots are copies', () => {
    const l = createLineup();
    for (let i = 0; i < 8; i++) l.place(i, `r${i}`);
    expect(l.full()).toBe(true);
    expect(l.firstEmpty()).toBe(-1);
    const snap = l.snapshot();
    snap[0]!.level = 1;
    expect(l.seat(0)?.level).toBe(2);
    l.clear();
    expect(l.count()).toBe(0);
  });
});
