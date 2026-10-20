/**
 * The one book the child keeps: who they have met, what they have opened, which
 * quests are open, where the family photos hang. The tanks themselves are kept
 * under their own keys (see WORLD_KEY) in the shape the older games write, so the
 * engines run on them untouched.
 */
import { parseVersioned, readRaw, writeJson, writeRaw } from '../../core/save';
import { readSave as readTank } from '../aquarium/logic';
import { readSave as readBox } from '../terrarium/logic';
import { STARTERS, kindByKey, kindOf } from './catalog';
import { DECOR_START, MAX_EXTRAS, isDecorId, type DecorId } from './decor';
import { isWorldId, worldsFor, type Realm, type WorldId } from './worlds';
import type { DecorKind } from '../aquarium/scenery';

export const SAVE_KEY = 'be-choi:habitat';
/** Where each home is kept: the same shape the older games write. */
export const WORLD_KEY: Record<Realm, string> = {
  fresh: 'be-choi:habitat:fresh',
  sea: 'be-choi:habitat:sea',
  forest: 'be-choi:habitat:forest',
};
/** Where the fishing game drops its catch before it is sorted into a home. */
export const BRIDGE_KEY = 'be-choi:habitat:bridge';
/** The older games' own keys. Read, copied from, never written. */
export const LEGACY_TANK_KEY = 'be-choi:aquarium';
export const LEGACY_BOX_KEY = 'be-choi:terrarium';

export const MAX_FRAMES = 3;
export const MAX_VISITORS = 3;

export interface Extras {
  /** Fraction of the tank width, one per plant the child planted. */
  plants: number[];
  decor: { k: DecorKind; x: number }[];
}

export interface Frame {
  photo: string;
  /** Fractions of the stage. */
  x: number;
  y: number;
}

export interface WorldPhotos {
  frames: Frame[];
  backdrop: string | null;
  visitors: string[];
}

export interface QuestSlot {
  id: string;
  got: number;
}

export interface HabitatSave {
  v: 1;
  world: WorldId;
  stars: number;
  /** Keys of the animals the child has met (`aq:goldfish`). */
  owned: string[];
  decor: DecorId[];
  worlds: WorldId[];
  quests: { active: QuestSlot[]; next: number; done: number };
  /** Helpings fed since the last egg, and whether an egg is waiting. */
  eggFeeds: number;
  egg: boolean;
  hatched: number;
  extras: Record<Realm, Extras>;
  photos: Record<Realm, WorldPhotos>;
  /** The older games' saves were looked at once for who lives there. */
  imported: boolean;
}

const emptyExtras = (): Extras => ({ plants: [], decor: [] });
const emptyPhotos = (): WorldPhotos => ({ frames: [], backdrop: null, visitors: [] });

export function defaultSave(): HabitatSave {
  return {
    v: 1,
    world: 'fresh',
    stars: 0,
    owned: [...STARTERS],
    decor: [...DECOR_START],
    worlds: worldsFor(0),
    quests: { active: [], next: 0, done: 0 },
    eggFeeds: 0,
    egg: false,
    hatched: 0,
    extras: { fresh: emptyExtras(), sea: emptyExtras(), forest: emptyExtras() },
    photos: { fresh: emptyPhotos(), sea: emptyPhotos(), forest: emptyPhotos() },
    imported: false,
  };
}

const num = (n: unknown, lo: number, hi: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
const uniq = <T>(list: readonly T[]): T[] => [...new Set(list)];

function cleanExtras(raw: unknown): Extras {
  const r = (raw ?? {}) as Record<string, unknown>;
  const plants = Array.isArray(r.plants) ? r.plants.map((n) => num(n, 0, 1, -1)).filter((n) => n >= 0) : [];
  const decor: Extras['decor'] = [];
  if (Array.isArray(r.decor)) {
    for (const d of r.decor as Record<string, unknown>[]) {
      if (d && isDecorId(d.k) && d.k !== 'plant') decor.push({ k: d.k, x: num(d.x, 0, 1, 0.5) });
    }
  }
  return { plants: plants.slice(-MAX_EXTRAS), decor: decor.slice(-MAX_EXTRAS) };
}

function cleanPhotos(raw: unknown): WorldPhotos {
  const r = (raw ?? {}) as Record<string, unknown>;
  const frames: Frame[] = [];
  if (Array.isArray(r.frames)) {
    for (const f of r.frames as Record<string, unknown>[]) {
      if (f && typeof f.photo === 'string') frames.push({ photo: f.photo, x: num(f.x, 0.08, 0.92, 0.5), y: num(f.y, 0.1, 0.8, 0.3) });
    }
  }
  return {
    frames: frames.slice(0, MAX_FRAMES),
    backdrop: typeof r.backdrop === 'string' ? r.backdrop : null,
    visitors: strings(r.visitors).slice(0, MAX_VISITORS),
  };
}

export function readHabitat(raw: string | null): HabitatSave | null {
  return parseVersioned<HabitatSave>(raw, {
    current: 1,
    validate(d) {
      const base = defaultSave();
      const owned = uniq(strings(d.owned).filter((k) => kindByKey(k) !== undefined));
      const stars = Math.floor(num(d.stars, 0, 1_000_000, 0));
      const decor = uniq([...DECOR_START, ...strings(d.decor).filter(isDecorId)]);
      const worlds = uniq(worldsFor(stars, strings(d.worlds).filter(isWorldId)));
      const q = (d.quests ?? {}) as Record<string, unknown>;
      const active: QuestSlot[] = [];
      if (Array.isArray(q.active)) {
        for (const slot of q.active as Record<string, unknown>[]) {
          if (slot && typeof slot.id === 'string') active.push({ id: slot.id, got: Math.floor(num(slot.got, 0, 999, 0)) });
        }
      }
      const e = (d.extras ?? {}) as Record<string, unknown>;
      const p = (d.photos ?? {}) as Record<string, unknown>;
      const world = isWorldId(d.world) && worlds.includes(d.world) ? d.world : 'fresh';
      return {
        ...base,
        world,
        stars,
        owned: uniq([...owned]),
        decor,
        worlds,
        quests: {
          active: active.slice(0, 3),
          next: Math.floor(num(q.next, 0, 1_000_000, 0)),
          done: Math.floor(num(q.done, 0, 1_000_000, 0)),
        },
        eggFeeds: Math.floor(num(d.eggFeeds, 0, 99, 0)),
        egg: d.egg === true,
        hatched: Math.floor(num(d.hatched, 0, 1_000_000, 0)),
        extras: { fresh: cleanExtras(e.fresh), sea: cleanExtras(e.sea), forest: cleanExtras(e.forest) },
        photos: { fresh: cleanPhotos(p.fresh), sea: cleanPhotos(p.sea), forest: cleanPhotos(p.forest) },
        imported: d.imported === true,
      };
    },
  });
}

export function ownsKind(save: HabitatSave, key: string): boolean {
  return save.owned.includes(key);
}

/** Add an animal to the book. True when it is new. */
export function collect(save: HabitatSave, key: string): boolean {
  if (!kindByKey(key) || save.owned.includes(key)) return false;
  save.owned.push(key);
  return true;
}

// ---- older games ----

/** Who lives in the older games' saves, as book keys. Pure: takes the raw text. */
export function legacyOwned(rawTank: string | null, rawBox: string | null): string[] {
  const out: string[] = [];
  const tank = readTank(rawTank);
  for (const id of tank?.fish ?? []) {
    const k = kindOf('aq', id);
    if (k) out.push(k.key);
  }
  const box = readBox(rawBox);
  for (const id of box?.pets ?? []) {
    const k = kindOf('tr', id);
    if (k) out.push(k.key);
  }
  return uniq(out);
}

/**
 * Bring the older games' data in, without touching it: each home starts as a
 * copy of the old tank or box, and everyone who lives there is in the book. The
 * forest opens at once for a child who already had a box. Safe to call every time.
 */
export function importLegacy(save: HabitatSave): boolean {
  const rawTank = readRaw(LEGACY_TANK_KEY);
  const rawBox = readRaw(LEGACY_BOX_KEY);
  let changed = false;
  for (const key of legacyOwned(rawTank, rawBox)) changed = collect(save, key) || changed;
  if (!save.imported) {
    // Only a usable save is worth copying: the old key may hold anything.
    if (rawTank && readTank(rawTank) && readRaw(WORLD_KEY.fresh) === null) writeRaw(WORLD_KEY.fresh, rawTank);
    if (rawBox && readBox(rawBox) && readRaw(WORLD_KEY.forest) === null) {
      writeRaw(WORLD_KEY.forest, rawBox);
      if (!save.worlds.includes('forest')) save.worlds.push('forest');
    }
    save.imported = true;
    changed = true;
  }
  return changed;
}

export function load(): HabitatSave {
  return readHabitat(readRaw(SAVE_KEY)) ?? defaultSave();
}

/** Keep the book. Storage that is blocked or full just means it is forgotten. */
export function store(save: HabitatSave): void {
  writeJson(SAVE_KEY, save);
}
