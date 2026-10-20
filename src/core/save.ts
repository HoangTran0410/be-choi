/**
 * Shared, defensive persistence for everything the child (or parent) keeps.
 *
 * - Every storage access is guarded: blocked storage (private mode), a full
 *   quota, a throwing accessor or a missing `localStorage` never throws; reads
 *   give `null`/fallback, writes give `false` and the game keeps its in-memory
 *   state.
 * - Keys and on-disk formats are never renamed, so what a child already saved
 *   (tank, terrarium, drawing...) is still read after an update.
 * - Structured saves carry a version `v`. A save with no `v` (written before
 *   versions existed) is treated as version 0 and walked up through `migrations`.
 *   A save from a *newer* app than this one is refused rather than guessed at.
 */

export type Backend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Key aliases: while one is set, everything that reads or writes `from` really
 * touches `to`. A game that folds older games together uses this to run their
 * code unchanged on its own copy of their data, so the older games' saves are
 * never modified. `onWrite` hears every write to the alias (the new raw text).
 */
const aliases = new Map<string, { to: string; onWrite?: (raw: string) => void }>();

/** Point `from` at `to` until the returned function is called. */
export function aliasKey(from: string, to: string, onWrite?: (raw: string) => void): () => void {
  const entry = { to, onWrite };
  aliases.set(from, entry);
  return () => {
    if (aliases.get(from) === entry) aliases.delete(from);
  };
}

function resolve(key: string): string {
  return aliases.get(key)?.to ?? key;
}

function defaultBackend(): Backend | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Raw string under `key`, or null if absent or storage is unavailable. */
export function readRaw(key: string, storage: Backend | null = defaultBackend()): string | null {
  try {
    return storage?.getItem(resolve(key)) ?? null;
  } catch {
    return null;
  }
}

/** Store a raw string. Returns false if it could not be kept (blocked or full). */
export function writeRaw(key: string, value: string, storage: Backend | null = defaultBackend()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(resolve(key), value);
    try {
      aliases.get(key)?.onWrite?.(value);
    } catch {
      /* a listener must never break a save */
    }
    return true;
  } catch {
    return false;
  }
}

/** Remove `key`; false if storage refused. */
export function removeRaw(key: string, storage: Backend | null = defaultBackend()): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(resolve(key));
    return true;
  } catch {
    return false;
  }
}

/** JSON under `key`, or `fallback` for absent / corrupt / unreadable. */
export function readJson<T>(key: string, fallback: T, storage: Backend | null = defaultBackend()): unknown {
  const raw = readRaw(key, storage);
  if (raw === null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/** Write `value` as JSON; false if unserialisable or storage refused. */
export function writeJson(key: string, value: unknown, storage: Backend | null = defaultBackend()): boolean {
  try {
    return writeRaw(key, JSON.stringify(value), storage);
  } catch {
    return false;
  }
}

export interface VersionedSpec<T> {
  /** Version this app writes. */
  current: number;
  /**
   * `migrations[n]` turns a version-n object into version n+1. A save with no
   * `v` starts at 0. Missing steps mean "shape unchanged".
   */
  migrations?: Record<number, (old: Record<string, unknown>) => Record<string, unknown>>;
  /** Final check/normalise of a current-version object; return null to reject. */
  validate: (data: Record<string, unknown>) => T | null;
}

/**
 * Parse raw saved text, migrate it up to `spec.current` and validate it.
 * Returns null for anything unusable: empty, corrupt JSON, not an object,
 * from a newer version, or rejected by `validate`.
 */
export function parseVersioned<T>(raw: string | null, spec: VersionedSpec<T>): T | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    let data = parsed as Record<string, unknown>;
    const v = data.v;
    let version = v === undefined ? 0 : typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : -1;
    if (version < 0 || version > spec.current) return null;
    while (version < spec.current) {
      const step = spec.migrations?.[version];
      data = step ? step(data) : data;
      version++;
    }
    return spec.validate({ ...data, v: spec.current });
  } catch {
    return null;
  }
}

/** Read + migrate a versioned save from storage. */
export function loadVersioned<T>(key: string, spec: VersionedSpec<T>, storage: Backend | null = defaultBackend()): T | null {
  return parseVersioned(readRaw(key, storage), spec);
}

/** Write a versioned save (stamping `v: spec.current`). */
export function saveVersioned(
  key: string,
  data: object,
  spec: Pick<VersionedSpec<unknown>, 'current'>,
  storage: Backend | null = defaultBackend(),
): boolean {
  return writeJson(key, { ...data, v: spec.current }, storage);
}
