import { describe, it, expect } from 'vitest';
import type { Backend } from '../../core/save';
import { SONGS, type SongId } from './groove';
import { QUESTS, SAVE_KEY, currentQuest, emptyProgress, loadProgress, newlyDone, saveProgress, unlockedIds, type View } from './quests';
import { ROBOTS, STARTERS, findRobot } from './robots';

const view = (robots: string[], tried: SongId[] = [], fullIn: SongId[] = []): View => ({
  robots,
  tried: new Set(tried),
  fullIn: new Set(fullIn),
});

function memory(): Backend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('quests', () => {
  it('has a handful of picture-only goals with distinct stickers, and rewards that exist', () => {
    expect(QUESTS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    expect(new Set(QUESTS.map((q) => q.sticker)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      for (const r of q.reward) expect(findRobot(r), `${q.id} rewards ${r}`).toBeDefined();
      expect(q.parts(view([])).length).toBeGreaterThan(0);
      expect(q.parts(view([])).every((p) => !p.done)).toBe(true);
    }
  });

  it('shelf grows from 5 to every robot, each given exactly once', () => {
    expect(unlockedIds(new Set()).length).toBe(5);
    expect(unlockedIds(new Set()).sort()).toEqual([...STARTERS].sort());
    const all = unlockedIds(new Set(QUESTS.map((q) => q.id)));
    expect(all.length).toBe(ROBOTS.length);
    const rewards = QUESTS.flatMap((q) => q.reward);
    expect(new Set(rewards).size).toBe(rewards.length);
    expect(rewards.length + STARTERS.length).toBe(ROBOTS.length);
    for (const r of rewards) expect(STARTERS).not.toContain(r);
  });

  it('trio: a beat, an accompaniment and a melody, in any order', () => {
    expect(newlyDone(new Set(), view(['kick', 'piano'])).map((q) => q.id)).toEqual([]);
    const done = newlyDone(new Set(), view(['xylo', 'guitar', 'kick']));
    expect(done.map((q) => q.id)).toContain('trio');
    expect(newlyDone(new Set(['trio']), view(['xylo', 'guitar', 'kick'])).map((q) => q.id)).not.toContain('trio');
  });

  it('four: any four robots', () => {
    expect(newlyDone(new Set(), view(['kick', 'bass', 'piano'])).map((q) => q.id)).not.toContain('four');
    expect(newlyDone(new Set(), view(['kick', 'bass', 'piano', 'guitar'])).map((q) => q.id)).toContain('four');
  });

  it('songs: all three songs tried; grand: all three filled', () => {
    expect(newlyDone(new Set(), view([], ['fun', 'disco'])).map((q) => q.id)).not.toContain('songs');
    expect(
      newlyDone(
        new Set(),
        view(
          [],
          SONGS.map((s) => s.id),
        ),
      ).map((q) => q.id),
    ).toContain('songs');
    expect(newlyDone(new Set(), view([], [], ['fun', 'calm'])).map((q) => q.id)).not.toContain('grand');
    expect(
      newlyDone(
        new Set(),
        view(
          [],
          [],
          SONGS.map((s) => s.id),
        ),
      ).map((q) => q.id),
    ).toContain('grand');
  });

  it('groups: percussion, plucked, wind and bowed/keys', () => {
    expect(newlyDone(new Set(), view(['kick', 'bass', 'piano'])).map((q) => q.id)).not.toContain('groups');
    expect(newlyDone(new Set(), view(['kick', 'bass', 'piano', 'flute'])).map((q) => q.id)).toContain('groups');
    expect(newlyDone(new Set(), view(['kick', 'guitar', 'trumpet', 'violin'])).map((q) => q.id)).toContain('groups');
  });

  it('full: all eight seats', () => {
    const eight = ['kick', 'bass', 'piano', 'guitar', 'xylo', 'snare', 'bell', 'flute'];
    expect(newlyDone(new Set(), view(eight.slice(0, 7))).map((q) => q.id)).not.toContain('full');
    expect(newlyDone(new Set(), view(eight)).map((q) => q.id)).toContain('full');
  });

  it('every quest can be finished with what is on the shelf at that point (nothing is locked behind itself)', () => {
    // Playing the quests in listed order, a child can always pick at most eight robots from the shelf
    // that light every picture of the next goal. (A greedy pick: add the robot that lights the most.)
    const done = new Set<string>();
    const all = SONGS.map((s) => s.id);
    for (const q of QUESTS) {
      const shelf = unlockedIds(done);
      const pick: string[] = [];
      const lit = (robots: string[]): number => q.parts(view(robots, all, all)).filter((p) => p.done).length;
      while (pick.length < 8 && lit(pick) < q.parts(view([], all, all)).length) {
        const next = shelf.filter((r) => !pick.includes(r)).sort((x, y) => lit([...pick, y]) - lit([...pick, x]))[0];
        if (!next || lit([...pick, next]) <= lit(pick)) break;
        pick.push(next);
      }
      expect(
        q.parts(view(pick, all, all)).every((p) => p.done),
        `${q.id} unreachable with ${shelf.length} robots`,
      ).toBe(true);
      done.add(q.id);
    }
  });

  it('shows the first goal not yet done', () => {
    expect(currentQuest(new Set())?.id).toBe(QUESTS[0]!.id);
    expect(currentQuest(new Set([QUESTS[0]!.id]))?.id).toBe(QUESTS[1]!.id);
    expect(currentQuest(new Set(QUESTS.map((q) => q.id)))).toBeUndefined();
  });
});

describe('saved progress', () => {
  it('round-trips with a version', () => {
    const s = memory();
    const p = {
      done: ['trio'],
      tried: ['fun', 'calm'] as SongId[],
      fullIn: ['fun'] as SongId[],
      last: [{ robot: 'kick', level: 3 as const }, null, { robot: 'piano', level: 1 as const }],
      song: 'disco' as SongId,
      photoFaces: true,
    };
    expect(saveProgress(p, s)).toBe(true);
    expect(JSON.parse(s.data.get(SAVE_KEY)!).v).toBe(1);
    expect(loadProgress(s)).toEqual(p);
  });

  it('starts fresh with nothing saved, corrupt text, or storage that refuses', () => {
    expect(loadProgress(memory())).toEqual(emptyProgress());
    const s = memory();
    s.data.set(SAVE_KEY, '{nope');
    expect(loadProgress(s)).toEqual(emptyProgress());
    expect(loadProgress(null)).toEqual(emptyProgress());
    expect(saveProgress(emptyProgress(), null)).toBe(false);
  });

  it('throws away anything it does not know instead of trusting it', () => {
    const s = memory();
    s.data.set(
      SAVE_KEY,
      JSON.stringify({
        v: 1,
        done: ['trio', 'nope', 7],
        tried: ['fun', 'xx'],
        fullIn: 'oops',
        last: [{ robot: 'kick', level: 9 }, { robot: 'ghost', level: 1 }, 5, null],
        song: 'polka',
      }),
    );
    expect(loadProgress(s)).toEqual({
      done: ['trio'],
      tried: ['fun'],
      fullIn: [],
      last: [{ robot: 'kick', level: 2 }, null, null, null],
      song: 'fun',
      photoFaces: false,
    });
  });

  it('refuses a save from a newer app rather than guessing', () => {
    const s = memory();
    s.data.set(SAVE_KEY, JSON.stringify({ v: 99, done: ['trio'] }));
    expect(loadProgress(s)).toEqual(emptyProgress());
  });
});
