import { loadVersioned, saveVersioned, type Backend, type VersionedSpec } from '../../core/save';
import { EVENTS, type DayEvent } from './day';

export const SAVE_KEY = 'be-choi:day';
const VERSION = 1;
const MAX_DAYS = 9999;

export interface Progress {
  /** Days the little friend has lived through to bedtime. */
  days: number;
  /** Id of the family photo used as the face, or null for the drawn face. */
  face: string | null;
  /** The surprise of the last day, so the next one differs. */
  lastEvent: DayEvent | null;
  seed: number;
}

const SPEC: VersionedSpec<Progress> = {
  current: VERSION,
  validate(d) {
    const days = typeof d.days === 'number' && Number.isFinite(d.days) ? Math.max(0, Math.min(MAX_DAYS, Math.floor(d.days))) : 0;
    const face = typeof d.face === 'string' && d.face.length < 200 ? d.face : null;
    const lastEvent = EVENTS.find((e) => e === d.lastEvent) ?? null;
    const seed = typeof d.seed === 'number' && Number.isFinite(d.seed) ? Math.floor(Math.abs(d.seed)) % 1_000_000_000 : 0;
    return { days, face, lastEvent, seed };
  },
};

export function freshProgress(rng: () => number = Math.random): Progress {
  return { days: 0, face: null, lastEvent: null, seed: Math.floor(rng() * 1e9) + 1 };
}

export function loadProgress(storage?: Backend | null): Progress {
  const got = storage === undefined ? loadVersioned(SAVE_KEY, SPEC) : loadVersioned(SAVE_KEY, SPEC, storage);
  if (!got) return freshProgress();
  return got.seed === 0 ? { ...got, seed: freshProgress().seed } : got;
}

export function saveProgress(p: Progress, storage?: Backend | null): boolean {
  return storage === undefined ? saveVersioned(SAVE_KEY, p, SPEC) : saveVersioned(SAVE_KEY, p, SPEC, storage);
}
