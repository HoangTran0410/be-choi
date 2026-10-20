/**
 * Gentle goals with no words: a row of little pictures that light up as the stage fills in.
 * Finish one and the child gets a star and a sticker, and new robots appear on the shelf.
 * Nothing is ordered — any goal can be finished first, and nothing is ever lost.
 *
 * Progress is saved with a version so a later update can still read it.
 */
import { loadVersioned, saveVersioned, type Backend, type VersionedSpec } from '../../core/save';
import { SONGS, type Level, type SongId } from './groove';
import { CAPACITY } from './lineup';
import { ROBOTS, STARTERS, findRobot } from './robots';

export const SAVE_KEY = 'be-choi:robots';

/** What the quests can see of the stage. */
export interface View {
  /** Robot ids on stage. */
  robots: readonly string[];
  tried: ReadonlySet<SongId>;
  /** Songs the child has filled the whole stage in. */
  fullIn: ReadonlySet<SongId>;
}

export interface Part {
  icon: string;
  done: boolean;
}

export interface Quest {
  id: string;
  /** The sticker the child gets. */
  sticker: string;
  /** New robots on the shelf. */
  reward: readonly string[];
  parts(v: View): Part[];
}

const roleOn = (v: View, pick: (id: string) => boolean): boolean => v.robots.some(pick);

export const QUESTS: readonly Quest[] = [
  {
    id: 'trio',
    sticker: '🏅',
    reward: ['snare', 'bell'],
    parts: (v) => [
      { icon: '🥁', done: roleOn(v, (id) => findRobot(id)?.role === 'beat') },
      { icon: '🎹', done: roleOn(v, (id) => findRobot(id)?.role === 'chord') },
      { icon: '🎵', done: roleOn(v, (id) => findRobot(id)?.role === 'melody') },
    ],
  },
  {
    id: 'four',
    sticker: '🌈',
    reward: ['shaker', 'flute'],
    parts: (v) => [0, 1, 2, 3].map((i) => ({ icon: '🤖', done: v.robots.length > i })),
  },
  {
    id: 'songs',
    sticker: '🎁',
    reward: ['cowbell', 'tom'],
    parts: (v) => SONGS.map((s) => ({ icon: s.icon, done: v.tried.has(s.id) })),
  },
  {
    id: 'groups',
    sticker: '🏆',
    reward: ['trumpet'],
    parts: (v) => [
      { icon: '🥁', done: roleOn(v, (id) => findRobot(id)?.group === 'gõ') },
      { icon: '🎸', done: roleOn(v, (id) => findRobot(id)?.group === 'gảy') },
      { icon: '🎺', done: roleOn(v, (id) => findRobot(id)?.group === 'thổi') },
      { icon: '🎻', done: roleOn(v, (id) => findRobot(id)?.group === 'kéo' || findRobot(id)?.group === 'phím') },
    ],
  },
  {
    id: 'full',
    sticker: '🎉',
    reward: ['sax', 'violin'],
    parts: (v) => Array.from({ length: CAPACITY }, (_, i) => ({ icon: '🤖', done: v.robots.length > i })),
  },
  {
    id: 'grand',
    sticker: '👑',
    reward: ['triangle'],
    parts: (v) => SONGS.map((s) => ({ icon: s.icon, done: v.fullIn.has(s.id) })),
  },
];

export function questById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id);
}

export function isDone(q: Quest, v: View): boolean {
  return q.parts(v).every((p) => p.done);
}

/** Quests the stage satisfies right now that are not recorded as done yet. */
export function newlyDone(done: ReadonlySet<string>, v: View): Quest[] {
  return QUESTS.filter((q) => !done.has(q.id) && isDone(q, v));
}

/** The goal to show: the first one not yet done. */
export function currentQuest(done: ReadonlySet<string>): Quest | undefined {
  return QUESTS.find((q) => !done.has(q.id));
}

/** The shelf: the starters plus whatever finished quests have given. Always in `ROBOTS` order. */
export function unlockedIds(done: ReadonlySet<string>): string[] {
  const out = new Set<string>(STARTERS);
  for (const q of QUESTS) if (done.has(q.id)) for (const r of q.reward) out.add(r);
  return ROBOTS.map((r) => r.id).filter((id) => out.has(id));
}

// ---------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------

export interface SavedSeat {
  robot: string;
  level: Level;
}

export interface Progress {
  done: string[];
  tried: SongId[];
  fullIn: SongId[];
  /** The last line-up, so a child can ask for it back. */
  last: (SavedSeat | null)[];
  song: SongId;
}

export function emptyProgress(): Progress {
  return { done: [], tried: [], fullIn: [], last: [], song: 'fun' };
}

const SPEC: VersionedSpec<Progress> = {
  current: 1,
  validate(d) {
    const songs = new Set<string>(SONGS.map((s) => s.id));
    const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
    const known = new Set(QUESTS.map((q) => q.id));
    const last = (Array.isArray(d.last) ? d.last : []).slice(0, CAPACITY).map((s): SavedSeat | null => {
      const o = s as { robot?: unknown; level?: unknown } | null;
      if (!o || typeof o.robot !== 'string' || !findRobot(o.robot)) return null;
      const level = o.level === 1 || o.level === 2 || o.level === 3 ? o.level : 2;
      return { robot: o.robot, level };
    });
    return {
      done: strings(d.done).filter((id) => known.has(id)),
      tried: strings(d.tried).filter((id): id is SongId => songs.has(id)),
      fullIn: strings(d.fullIn).filter((id): id is SongId => songs.has(id)),
      last,
      song: typeof d.song === 'string' && songs.has(d.song) ? (d.song as SongId) : 'fun',
    };
  },
};

export function loadProgress(storage?: Backend | null): Progress {
  const got = storage === undefined ? loadVersioned(SAVE_KEY, SPEC) : loadVersioned(SAVE_KEY, SPEC, storage);
  return got ?? emptyProgress();
}

export function saveProgress(p: Progress, storage?: Backend | null): boolean {
  return storage === undefined ? saveVersioned(SAVE_KEY, p, SPEC) : saveVersioned(SAVE_KEY, p, SPEC, storage);
}
