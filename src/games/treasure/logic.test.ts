import { describe, expect, it } from 'vitest';
import { generateLevel, kindFor, loadSave, nextHint, persist, simulate, sizeFor, solve, type Level } from './logic';

const base = { size: 3, start: { r: 2, c: 0 }, chest: { r: 0, c: 2 }, rocks: [], stars: [] };

describe('treasure solver', () => {
  it('finds the shortest program, with turns', () => {
    const sol = solve({ ...base, tiles: ['up', 'down', 'left', 'right'] })!;
    expect(sol).toHaveLength(4);
    expect(simulate(base, sol).outcome).toBe('win');
  });

  it('goes around rocks and never through them', () => {
    const w = { ...base, start: { r: 1, c: 0 }, chest: { r: 1, c: 2 }, rocks: [{ r: 1, c: 1 }], tiles: ['up', 'down', 'left', 'right'] as const };
    const sol = solve({ ...w, tiles: [...w.tiles] })!;
    expect(sol.length).toBe(4);
    expect(simulate(w, sol).outcome).toBe('win');
  });

  it('needs the stars before the chest counts', () => {
    const w = { size: 3, start: { r: 0, c: 0 }, chest: { r: 0, c: 1 }, rocks: [], stars: [{ r: 2, c: 0 }], tiles: ['up', 'down', 'left', 'right'] as const };
    expect(simulate(w, ['right']).outcome).toBe('short');
    const sol = solve({ ...w, tiles: [...w.tiles] })!;
    expect(sol.length).toBe(5);
    expect(simulate(w, sol).moves.some((m) => m.star === 0)).toBe(true);
  });

  it('"again" repeats the last move twice and can be shorter', () => {
    const w = { size: 4, start: { r: 0, c: 0 }, chest: { r: 0, c: 3 }, rocks: [], stars: [] };
    expect(solve({ ...w, tiles: ['left', 'right'] })).toHaveLength(3);
    const sol = solve({ ...w, tiles: ['left', 'right', 'again'] })!;
    expect(sol).toEqual(['right', 'again']);
    expect(simulate(w, sol).outcome).toBe('win');
    expect(simulate(w, ['again']).moves).toHaveLength(0);
  });

  it('a bump stops the program softly; a short program just ends', () => {
    const w = { ...base, rocks: [{ r: 2, c: 1 }] };
    const r = simulate(w, ['right', 'up']);
    expect(r.outcome).toBe('bump');
    expect(r.moves.at(-1)!.kind).toBe('rock');
    expect(r.at).toEqual({ r: 2, c: 0 });
    expect(simulate(base, ['left']).moves[0]!.kind).toBe('wall');
    expect(simulate(base, ['up']).outcome).toBe('short');
  });

  it('returns null when out of depth', () => {
    expect(solve({ ...base, tiles: ['up', 'down', 'left', 'right'] }, 3)).toBeNull();
  });
});

describe('treasure level generator', () => {
  const levels: Level[] = Array.from({ length: 60 }, (_, k) => generateLevel(k));

  it('every level is solvable within its tray, deterministic, and sane', () => {
    for (const lv of levels) {
      expect(simulate(lv, lv.solution).outcome, `level ${lv.k}`).toBe('win');
      expect(lv.solution.length).toBeLessThanOrEqual(lv.maxSteps);
      expect(lv.maxSteps).toBeLessThanOrEqual(8);
      expect(lv.size).toBe(sizeFor(lv.k));
      expect(lv.rocks.some((r) => (r.r === lv.start.r && r.c === lv.start.c) || (r.r === lv.chest.r && r.c === lv.chest.c))).toBe(false);
      expect(generateLevel(lv.k)).toEqual(lv);
      const again = lv.tiles.includes('again');
      if (again) expect(solve({ ...lv, tiles: lv.tiles.filter((t) => t !== 'again') }, lv.maxSteps)).toBeNull();
    }
  });

  it('follows the ramp: straight, turns, rocks, stars, repeat; grid grows 3 to 5', () => {
    expect(levels[0]!.solution).toHaveLength(1);
    expect(levels[1]!.solution).toHaveLength(2);
    expect(new Set(levels[1]!.solution).size).toBe(1);
    expect(new Set(levels[2]!.solution).size).toBe(2);
    expect(levels[4]!.rocks.length).toBeGreaterThan(0);
    expect(levels[6]!.stars.length).toBe(1);
    expect(levels[7]!.stars.length).toBe(2);
    expect(levels[8]!.tiles).toContain('again');
    expect(levels[0]!.size).toBe(3);
    expect(levels[20]!.size).toBe(5);
    expect(kindFor(1, () => 0)).toBe('straight');
  });

  it('points at the next tile only while the tray follows the solution', () => {
    const lv = levels[3]!;
    expect(nextHint(lv, [])).toBe(lv.solution[0]);
    expect(nextHint(lv, [lv.solution[0]!])).toBe(lv.solution[1]);
    const wrong = lv.solution[0] === 'up' ? 'down' : 'up';
    expect(nextHint(lv, [wrong])).toBeNull();
  });

  it('saves the next level, versioned, and survives junk', () => {
    expect(loadSave().level).toBe(0);
    persist({ v: 1, level: 7 });
    expect(JSON.parse(localStorage.getItem('be-choi:treasure')!).v).toBe(1);
    expect(loadSave().level).toBe(7);
    localStorage.setItem('be-choi:treasure', '{"v":1,"level":-3}');
    expect(loadSave().level).toBe(0);
    localStorage.clear();
  });
});
