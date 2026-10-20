import { parseVersioned, saveVersioned, type Backend } from '../../core/save';
import { CHARACTERS, giftsBetween, HATS, STAGES, type Gift } from './catalog';

/** What the child keeps between visits: the tickets earned and how the singer is dressed. */
export interface Progress {
  v: 1;
  /** Lifetime tickets. Never spent, so a gift never closes again. */
  tickets: number;
  shows: number;
  /** `char:<id>` or `photo:<id>`. */
  face: string;
  hat: string;
  stage: string;
}

export const SAVE_KEY = 'be-choi:singalong';
export const DEFAULT_FACE = `char:${CHARACTERS[0]?.id ?? 'kid'}`;

export function freshProgress(): Progress {
  return { v: 1, tickets: 0, shows: 0, face: DEFAULT_FACE, hat: 'none', stage: 'theatre' };
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(100000, Math.floor(v)) : 0;
}

/** Anything unreadable, or from a newer app, is ignored and the child starts afresh. */
export function readProgress(raw: string | null): Progress | null {
  return parseVersioned<Progress>(raw, {
    current: 1,
    validate(d) {
      const tickets = count(d.tickets);
      const hat = typeof d.hat === 'string' && isOpenHat(d.hat, tickets) ? d.hat : 'none';
      const stage = typeof d.stage === 'string' && isOpenStage(d.stage, tickets) ? d.stage : 'theatre';
      const face = typeof d.face === 'string' && /^(char|photo):.+/.test(d.face) ? d.face : DEFAULT_FACE;
      return { v: 1, tickets, shows: count(d.shows), face, hat, stage };
    },
  });
}

export function isOpenHat(id: string, tickets: number): boolean {
  return HATS.some((h) => h.id === id && h.at <= tickets);
}
export function isOpenStage(id: string, tickets: number): boolean {
  return STAGES.some((s) => s.id === id && s.at <= tickets);
}

export interface ProgressStore {
  get(): Readonly<Progress>;
  /** Count a finished show. Returns what it opened. */
  addShow(tickets: number): { before: number; after: number; gifts: Gift[] };
  setFace(face: string): void;
  setHat(id: string): void;
  setStage(id: string): void;
}

export function createProgress(storage?: Backend | null): ProgressStore {
  const read = (): Progress | null => {
    try {
      const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
      return store ? readProgress(store.getItem(SAVE_KEY)) : null;
    } catch {
      return null;
    }
  };
  let state: Progress = read() ?? freshProgress();
  const save = (): void => {
    try {
      const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) saveVersioned(SAVE_KEY, state, { current: 1 }, store);
    } catch {
      /* the game goes on with what it has in memory */
    }
  };
  return {
    get: () => state,
    addShow(tickets) {
      const before = state.tickets;
      const after = before + Math.max(0, Math.floor(tickets));
      state = { ...state, tickets: after, shows: state.shows + 1 };
      save();
      return { before, after, gifts: giftsBetween(before, after) };
    },
    setFace(face) {
      state = { ...state, face };
      save();
    },
    setHat(id) {
      if (!isOpenHat(id, state.tickets)) return;
      state = { ...state, hat: id };
      save();
    },
    setStage(id) {
      if (!isOpenStage(id, state.tickets)) return;
      state = { ...state, stage: id };
      save();
    },
  };
}
