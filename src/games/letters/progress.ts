import { loadVersioned, saveVersioned, type Backend, type VersionedSpec } from '../../core/save';
import type { Mastery } from './quiz';

/** Saved under this key; the shape is versioned (`v`), see core/save. */
export const MASTERY_KEY = 'be-choi:letters';

const SPEC: VersionedSpec<Mastery> = {
  current: 1,
  validate(data) {
    const raw = data.stats;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const out: Mastery = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const { asked, right } = value as Record<string, unknown>;
      if (typeof asked !== 'number' || typeof right !== 'number') continue;
      if (!Number.isFinite(asked) || !Number.isFinite(right) || asked < 0 || right < 0) continue;
      out[key] = { asked: Math.floor(asked), right: Math.min(Math.floor(right), Math.floor(asked)) };
    }
    return out;
  },
};

export function loadMastery(storage?: Backend | null): Mastery {
  return (storage === undefined ? loadVersioned(MASTERY_KEY, SPEC) : loadVersioned(MASTERY_KEY, SPEC, storage)) ?? {};
}

export function saveMastery(m: Mastery, storage?: Backend | null): boolean {
  const data = { stats: m };
  return storage === undefined ? saveVersioned(MASTERY_KEY, data, SPEC) : saveVersioned(MASTERY_KEY, data, SPEC, storage);
}
