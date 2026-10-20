/**
 * Everything the farm remembers between visits, and how it is kept.
 *
 * Farm progress ("sao trang trại", xp) is separate from the stars in the album:
 * it only decides what has moved onto the farm (seeds, animals, plots). It only
 * ever goes up. The save is versioned (`core/save`), and anything unreadable in
 * it is dropped piece by piece rather than throwing the whole farm away.
 *
 * Nothing was saved by the older `farm` and `garden` games, so there is nothing
 * of theirs to inherit; they keep working on their own.
 */
import { loadVersioned, saveVersioned, type Backend, type VersionedSpec } from '../../core/save';
import { cropById, cropsAt, emptyPlot, plotCountFor, RIPE, type Plot } from './crops';
import { speciesAt, speciesById, syncPens, type Pen, type Phase } from './animals';
import { itemById, type Order } from './orders';

export const SAVE_KEY = 'be-choi:harvest';
export const SAVE_VERSION = 1;

/** Farm xp needed for each level; level 1 is where you start. */
export const LEVEL_XP: readonly number[] = [0, 6, 16, 32, 56, 90, 140];
export const MAX_LEVEL = LEVEL_XP.length;
/** The most plots ever on the farm. */
export const MAX_PLOTS = 12;

export const XP_HARVEST = 1;
export const XP_COLLECT = 1;
export const XP_ORDER = 3;

export function levelFor(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]!) level = i + 1;
  return level;
}

/** 0 … 1 of the way from this level to the next (1 at the top). */
export function levelProgress(xp: number): number {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return 1;
  const lo = LEVEL_XP[level - 1]!;
  const hi = LEVEL_XP[level]!;
  return Math.min(1, Math.max(0, (xp - lo) / (hi - lo)));
}

export interface Unlock {
  kind: 'crop' | 'animal' | 'plots';
  id: string;
  emoji: string;
  name: string;
}

/** Everything that arrives on reaching `level`, for the "new!" card and the HUD's next-prize picture. */
export function unlocksAt(level: number): Unlock[] {
  const out: Unlock[] = [];
  for (const c of cropsAt(level)) if (c.level === level) out.push({ kind: 'crop', id: c.id, emoji: c.emoji, name: `hạt ${c.name}` });
  for (const s of speciesAt(level)) if (s.level === level) out.push({ kind: 'animal', id: s.id, emoji: s.emoji, name: s.name });
  if (level > 1 && plotCountFor(level) > plotCountFor(level - 1))
    out.push({ kind: 'plots', id: 'plots', emoji: '🟫', name: 'thêm đất trồng' });
  return out;
}

export interface FarmState {
  xp: number;
  /** Seconds of farm time, which sets the time of day. */
  clock: number;
  stock: Record<string, number>;
  plots: Plot[];
  pens: Pen[];
  order: Order | null;
  /** The highest level whose "new!" card has been shown. */
  seen: number;
  /** Customers served, for the parent's curiosity and the next photo to show. */
  served: number;
}

export function newState(): FarmState {
  return {
    xp: 0,
    clock: 0,
    // A little something to start with, so the first animal can be fed straight away.
    stock: { carrot: 2, corn: 2 },
    plots: Array.from({ length: plotCountFor(1) }, emptyPlot),
    pens: syncPens([], 1),
    order: null,
    seen: 1,
    served: 0,
  };
}

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanPlot(v: unknown): Plot {
  if (!isObj(v) || typeof v.crop !== 'string' || !cropById(v.crop)) return emptyPlot();
  const stage = Math.round(num(v.stage, 0, 0, RIPE));
  return { crop: v.crop, stage, wet: stage < RIPE && v.wet === true, prog: stage < RIPE ? num(v.prog, 0, 0, 0.99) : 0 };
}

function cleanPen(v: unknown): Pen | null {
  if (!isObj(v) || typeof v.id !== 'string' || !speciesById(v.id)) return null;
  const phase: Phase = v.phase === 'chewing' || v.phase === 'ready' ? v.phase : 'hungry';
  return { id: v.id, phase, fed: Math.round(num(v.fed, 0, 0, 1)), t: phase === 'chewing' ? num(v.t, 1, 0.1, 30) : 0 };
}

function cleanOrder(v: unknown): Order | null {
  if (!isObj(v) || !Array.isArray(v.wants)) return null;
  const wants = v.wants
    .filter(isObj)
    .filter((w) => typeof w.item === 'string' && !!itemById(w.item))
    .slice(0, 3)
    .map((w) => {
      const n = Math.round(num(w.n, 1, 1, 6));
      return { item: w.item as string, n, got: Math.round(num(w.got, 0, 0, n)) };
    });
  if (!wants.length) return null;
  return { shopper: Math.round(num(v.shopper, 0, 0, 99)), photo: v.photo === true, wants };
}

const SPEC: VersionedSpec<FarmState> = {
  current: SAVE_VERSION,
  validate(data) {
    const base = newState();
    const xp = Math.round(num(data.xp, 0, 0, 1_000_000));
    const level = levelFor(xp);
    const stock: Record<string, number> = {};
    if (isObj(data.stock)) {
      for (const [id, n] of Object.entries(data.stock)) if (itemById(id)) stock[id] = Math.round(num(n, 0, 0, 999));
    } else Object.assign(stock, base.stock);
    const plots = Array.isArray(data.plots) ? data.plots.slice(0, MAX_PLOTS).map(cleanPlot) : [];
    while (plots.length < plotCountFor(level)) plots.push(emptyPlot());
    const pens = Array.isArray(data.pens) ? data.pens.map(cleanPen).filter((p): p is Pen => p !== null) : [];
    return {
      xp,
      clock: num(data.clock, 0, 0, 1e9),
      stock,
      plots,
      pens: syncPens(pens, level),
      order: cleanOrder(data.order),
      seen: Math.round(num(data.seen, level, 1, MAX_LEVEL)),
      served: Math.round(num(data.served, 0, 0, 1e9)),
    };
  },
};

export function loadFarm(storage?: Backend | null): FarmState {
  return (storage === undefined ? loadVersioned(SAVE_KEY, SPEC) : loadVersioned(SAVE_KEY, SPEC, storage)) ?? newState();
}

export function saveFarm(state: FarmState, storage?: Backend | null): boolean {
  const spec = { current: SAVE_VERSION };
  return storage === undefined ? saveVersioned(SAVE_KEY, state, spec) : saveVersioned(SAVE_KEY, state, spec, storage);
}

export function stockOf(state: FarmState, id: string): number {
  return state.stock[id] ?? 0;
}

export function addStock(state: FarmState, id: string, n: number): void {
  state.stock[id] = Math.min(999, stockOf(state, id) + n);
}

/** Take one from the basket. False if there is none. */
export function takeStock(state: FarmState, id: string): boolean {
  const have = stockOf(state, id);
  if (have <= 0) return false;
  state.stock[id] = have - 1;
  return true;
}

/**
 * Add xp and make the farm bigger if a level was reached. Returns the new level when it went up
 * and its card has not been shown yet (the caller shows it and the stored `seen` moves on).
 */
export function gainXp(state: FarmState, amount: number): number | null {
  const before = levelFor(state.xp);
  state.xp += amount;
  const after = levelFor(state.xp);
  if (after === before) return null;
  while (state.plots.length < plotCountFor(after)) state.plots.push(emptyPlot());
  state.pens = syncPens(state.pens, after);
  return after;
}
