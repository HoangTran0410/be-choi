/**
 * "Quyển vở của bé": every finished picture, kept on this device.
 *
 * Each page is a small JPEG thumbnail (a data URL) in localStorage, via the shared
 * defensive `core/save`. Storage that is blocked, full or missing never throws: the
 * book then lives in memory for this visit and `add` says it could not be kept.
 * The book holds at most `MAX_WORKS` pages and about `MAX_CHARS` of text; past that
 * the oldest page (never the one chosen as wallpaper) makes room.
 */
import { parseVersioned, readRaw, removeRaw, writeRaw, type Backend } from '../../core/save';
import type { ModeId } from './progress';

export const STORAGE_KEY = 'be-choi:draw';
export const MAX_WORKS = 36;
/** Stay well inside the ~5 M characters localStorage usually allows. */
export const MAX_CHARS = 3_000_000;
/** A thumbnail longer than this is not stored (a broken canvas, not a drawing). */
export const MAX_THUMB_CHARS = 160_000;

export interface Artwork {
  id: string;
  mode: ModeId;
  /** Milliseconds since 1970 when it was finished. */
  at: number;
  /** JPEG data URL. */
  thumb: string;
  w: number;
  h: number;
  /** Name of the picture drawn ("ngôi nhà"), when there is one. */
  title: string;
}

export interface NotebookData {
  works: Artwork[];
  /** Pictures ever finished. Never goes down, even when pages are deleted. */
  made: number;
  wallpaper: string | null;
  /** Emoji stamps used at least once. */
  collected: string[];
  /** Stamp themes whose set is complete and already rewarded. */
  themesDone: string[];
}

const MODES: readonly string[] = ['practice', 'colour', 'free', 'copy'];
const CURRENT = 1;

function isArtwork(v: unknown): v is Artwork {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.mode === 'string' &&
    MODES.includes(a.mode) &&
    typeof a.at === 'number' &&
    typeof a.thumb === 'string' &&
    a.thumb.startsWith('data:image/') &&
    typeof a.w === 'number' &&
    typeof a.h === 'number' &&
    a.w > 0 &&
    a.h > 0 &&
    typeof a.title === 'string'
  );
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function emptyBook(): NotebookData {
  return { works: [], made: 0, wallpaper: null, collected: [], themesDone: [] };
}

/** Read a saved book; anything unusable gives an empty one (and bad pages are dropped one by one). */
export function parseBook(raw: string | null): NotebookData {
  const data = parseVersioned<NotebookData>(raw, {
    current: CURRENT,
    validate: (d) => {
      const works = Array.isArray(d.works) ? d.works.filter(isArtwork) : [];
      const made = typeof d.made === 'number' && Number.isFinite(d.made) && d.made >= works.length ? Math.floor(d.made) : works.length;
      const wp = typeof d.wallpaper === 'string' && works.some((w) => w.id === d.wallpaper) ? d.wallpaper : null;
      return { works, made, wallpaper: wp, collected: strings(d.collected), themesDone: strings(d.themesDone) };
    },
  });
  return data ?? emptyBook();
}

export function serializeBook(b: NotebookData): string {
  return JSON.stringify({ ...b, v: CURRENT });
}

/**
 * Drop pages (oldest first, never the wallpaper) until there are at most `maxWorks`
 * and the saved text fits in `maxChars`. Returns the pages that were dropped.
 */
export function trimBook(b: NotebookData, maxWorks = MAX_WORKS, maxChars = MAX_CHARS): Artwork[] {
  const dropped: Artwork[] = [];
  const drop = (): boolean => {
    const i = b.works.findIndex((w) => w.id !== b.wallpaper);
    if (i < 0) return false;
    dropped.push(...b.works.splice(i, 1));
    return true;
  };
  while (b.works.length > maxWorks && drop()) {
    /* keep dropping */
  }
  while (b.works.length > 1 && serializeBook(b).length > maxChars && drop()) {
    /* keep dropping */
  }
  return dropped;
}

export interface NewWork {
  mode: ModeId;
  thumb: string;
  w: number;
  h: number;
  title?: string;
}

export interface AddResult {
  /** The page as added, or null when the thumbnail was unusable. */
  art: Artwork | null;
  /** Older pages that made room. */
  dropped: Artwork[];
  /** False when the book could not be written to the device (it still lives in memory). */
  kept: boolean;
}

export interface Gallery {
  list(): readonly Artwork[];
  made(): number;
  get(id: string): Artwork | undefined;
  add(work: NewWork): AddResult;
  remove(id: string): boolean;
  wallpaper(): Artwork | null;
  /** Make this page the wallpaper; passing the current wallpaper's id takes it off. */
  setWallpaper(id: string | null): void;
  collected(): readonly string[];
  /** Mark a stamp as used. True the first time. */
  collect(emoji: string): boolean;
  themesDone(): readonly string[];
  markThemeDone(id: string): void;
  onChange(fn: () => void): () => void;
}

let counter = 0;

export function createGallery(storage?: Backend | null): Gallery {
  const read = (): string | null => (storage === undefined ? readRaw(STORAGE_KEY) : readRaw(STORAGE_KEY, storage));
  const write = (s: string): boolean => (storage === undefined ? writeRaw(STORAGE_KEY, s) : writeRaw(STORAGE_KEY, s, storage));
  const book = parseBook(read());
  const listeners = new Set<() => void>();

  /** A tiny write works: storage is there, so a failed big write means it is full. */
  function storageAlive(): boolean {
    const key = `${STORAGE_KEY}:probe`;
    const ok = storage === undefined ? writeRaw(key, '1') : writeRaw(key, '1', storage);
    if (ok) {
      if (storage === undefined) removeRaw(key);
      else removeRaw(key, storage);
    }
    return ok;
  }

  /** Write the book; on a full disk let go of the oldest pages until it fits. */
  function persist(): { kept: boolean; dropped: Artwork[] } {
    const dropped = trimBook(book);
    for (;;) {
      if (write(serializeBook(book))) return { kept: true, dropped };
      // Blocked storage (private mode): nothing will ever fit, so do not throw pages away for it.
      if (!storageAlive()) return { kept: false, dropped };
      const i = book.works.findIndex((w) => w.id !== book.wallpaper);
      if (i < 0 || book.works.length <= 1) return { kept: false, dropped };
      dropped.push(...book.works.splice(i, 1));
    }
  }
  const changed = (): void => {
    for (const fn of [...listeners]) fn();
  };

  return {
    list: () => book.works,
    made: () => book.made,
    get: (id) => book.works.find((w) => w.id === id),
    add(work) {
      if (!work.thumb.startsWith('data:image/') || work.thumb.length > MAX_THUMB_CHARS || !(work.w > 0) || !(work.h > 0)) {
        return { art: null, dropped: [], kept: false };
      }
      const art: Artwork = {
        id: `w${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        mode: work.mode,
        at: Date.now(),
        thumb: work.thumb,
        w: work.w,
        h: work.h,
        title: work.title ?? '',
      };
      book.works.push(art);
      book.made++;
      const { kept, dropped } = persist();
      changed();
      return { art: book.works.includes(art) ? art : null, dropped, kept };
    },
    remove(id) {
      const i = book.works.findIndex((w) => w.id === id);
      if (i < 0) return false;
      book.works.splice(i, 1);
      if (book.wallpaper === id) book.wallpaper = null;
      persist();
      changed();
      return true;
    },
    wallpaper: () => book.works.find((w) => w.id === book.wallpaper) ?? null,
    setWallpaper(id) {
      const next = id !== null && book.works.some((w) => w.id === id) ? id : null;
      book.wallpaper = next === book.wallpaper ? null : next;
      persist();
      changed();
    },
    collected: () => book.collected,
    collect(emoji) {
      if (book.collected.includes(emoji)) return false;
      book.collected.push(emoji);
      persist();
      changed();
      return true;
    },
    themesDone: () => book.themesDone,
    markThemeDone(id) {
      if (book.themesDone.includes(id)) return;
      book.themesDone.push(id);
      persist();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
