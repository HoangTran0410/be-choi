/** What the child keeps between visits: stars, the skill of each station, who they are on the island. */
import { loadVersioned, saveVersioned, type VersionedSpec } from '../../core/save';
import { avatarsOpen, freshSkill, islandsOpen, MAX_LEVEL, START_AVATAR, STATION_IDS, type Skill, type StationId } from './levels';

export const KEY = 'be-choi:brain';
export const VERSION = 1;

export interface Progress {
  stars: number;
  skills: Record<StationId, Skill>;
  /** Rounds played per station — also the seed, so a new round is a new board. */
  rounds: Record<StationId, number>;
  avatar: string;
  island: number;
  last: StationId | null;
}

export function freshProgress(): Progress {
  return {
    stars: 0,
    skills: Object.fromEntries(STATION_IDS.map((id) => [id, freshSkill()])) as Record<StationId, Skill>,
    rounds: Object.fromEntries(STATION_IDS.map((id) => [id, 0])) as Record<StationId, number>,
    avatar: START_AVATAR,
    island: 0,
    last: null,
  };
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
}

/** Take whatever was on disk and make it a safe `Progress`: bad fields fall back, nothing throws. */
export function normalise(data: Record<string, unknown>): Progress {
  const p = freshProgress();
  p.stars = int(data.stars, 0, 100000, 0);
  const skills = (typeof data.skills === 'object' && data.skills !== null ? data.skills : {}) as Record<string, unknown>;
  const rounds = (typeof data.rounds === 'object' && data.rounds !== null ? data.rounds : {}) as Record<string, unknown>;
  for (const id of STATION_IDS) {
    const s = (typeof skills[id] === 'object' && skills[id] !== null ? skills[id] : {}) as Record<string, unknown>;
    p.skills[id] = { level: int(s.level, 0, MAX_LEVEL[id], 0), streak: int(s.streak, 0, 10, 0), slips: int(s.slips, 0, 10, 0) };
    p.rounds[id] = int(rounds[id], 0, 1_000_000, 0);
  }
  const avatars = avatarsOpen(p.stars);
  p.avatar = typeof data.avatar === 'string' && avatars.includes(data.avatar) ? data.avatar : START_AVATAR;
  p.island = int(data.island, 0, islandsOpen(p.stars) - 1, 0);
  p.last = typeof data.last === 'string' && (STATION_IDS as readonly string[]).includes(data.last) ? (data.last as StationId) : null;
  return p;
}

export const SPEC: VersionedSpec<Progress> = {
  current: VERSION,
  validate: (data) => normalise(data),
};

export function loadProgress(): Progress {
  return loadVersioned(KEY, SPEC) ?? freshProgress();
}

export function saveProgress(p: Progress): void {
  saveVersioned(KEY, p, SPEC);
}
