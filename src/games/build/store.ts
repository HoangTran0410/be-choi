/**
 * What the workshop keeps on the device: the child's stars per mode and the display cabinet
 * ("Tủ trưng bày") of brick works. A work is stored as its bricks (a few dozen numbers), not as a
 * picture: tiny, always sharp, and drawn as SVG when it is shown. Everything goes through core/save,
 * so blocked or full storage just means the cabinet lives until the child leaves the game.
 */
import { loadVersioned, saveVersioned, type VersionedSpec } from '../../core/save';
import type { Board } from '../bricks/logic';
import { MODE_IDS, emptyProgress, type ModeId, type Progress } from './levels';

export const PROGRESS_KEY = 'be-choi:build:progress';
export const GALLERY_KEY = 'be-choi:build:gallery';
/** The cabinet holds this many works; a new one pushes the oldest out. */
export const MAX_WORKS = 12;

const HEX = /^#[0-9a-fA-F]{3,8}$/;

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(100000, Math.floor(v)) : 0;
}

const PROGRESS_SPEC: VersionedSpec<Progress> = {
  current: 1,
  validate(data) {
    const c = (data.counts ?? {}) as Record<string, unknown>;
    const mode = MODE_IDS.includes(data.mode as ModeId) ? (data.mode as ModeId) : 'puzzle';
    return { counts: { puzzle: count(c.puzzle), shadow: count(c.shadow), build: count(c.build) }, mode };
  },
};

export function loadProgress(): Progress {
  return loadVersioned(PROGRESS_KEY, PROGRESS_SPEC) ?? emptyProgress();
}

export function saveProgress(p: Progress): boolean {
  return saveVersioned(PROGRESS_KEY, p, PROGRESS_SPEC);
}

/** One brick of a work: `[x, y, w, h, colour]`, `y = 0` the ground row. */
export type WorkBrick = [number, number, number, number, string];

export interface Work {
  id: string;
  /** Vietnamese name shown under the work ("tháp cao", or "Tác phẩm của bé"). */
  name: string;
  at: number;
  bricks: WorkBrick[];
}

function parseBrick(b: unknown): WorkBrick | null {
  if (!Array.isArray(b) || b.length !== 5) return null;
  const [x, y, w, h, color] = b as unknown[];
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
  if (!ok(x) || !ok(y) || !ok(w) || !ok(h) || typeof color !== 'string' || !HEX.test(color)) return null;
  if (x < 0 || y < 0 || w < 1 || h < 1 || w > 40 || h > 40 || x > 100 || y > 100) return null;
  return [x, y, w, h, color];
}

function parseWork(raw: unknown): Work | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !Array.isArray(r.bricks)) return null;
  const bricks = r.bricks.map(parseBrick).filter((b): b is WorkBrick => b !== null);
  if (!bricks.length) return null;
  return {
    id: r.id.slice(0, 40),
    name: typeof r.name === 'string' ? r.name.slice(0, 60) : '',
    at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
    bricks,
  };
}

const GALLERY_SPEC: VersionedSpec<Work[]> = {
  current: 1,
  validate(data) {
    const list = Array.isArray(data.works) ? data.works : [];
    return list.map(parseWork).filter((w): w is Work => w !== null).slice(0, MAX_WORKS);
  },
};

/** Newest first. */
export function loadGallery(): Work[] {
  return loadVersioned(GALLERY_KEY, GALLERY_SPEC) ?? [];
}

export function saveGallery(works: readonly Work[]): boolean {
  return saveVersioned(GALLERY_KEY, { works }, GALLERY_SPEC);
}

/** The cabinet with `work` added at the front; the oldest falls off the end. */
export function addWork(list: readonly Work[], work: Work): Work[] {
  return [work, ...list.filter((w) => w.id !== work.id)].slice(0, MAX_WORKS);
}

export function removeWork(list: readonly Work[], id: string): Work[] {
  return list.filter((w) => w.id !== id);
}

/** A work from the bricks on the plate. `null` for an empty plate: there is nothing to show. */
export function workFromBoard(board: Board, name: string, now: number): Work | null {
  if (!board.bricks.length) return null;
  return {
    id: `w${now.toString(36)}${board.bricks.length}`,
    name,
    at: now,
    bricks: board.bricks.map((b) => [b.x, b.y, b.w, b.h, b.color]),
  };
}

/** Bounding box of a work in cells. */
export function workBounds(work: Work): { minX: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, w, h] of work.bricks) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  return { minX, width: maxX - minX, height: maxY };
}

const MARGIN = 0.6;

/**
 * The work as an `<svg>` string: bricks with studs on a strip of baseplate, cropped to the work.
 * Colours were checked on load, so the string is safe to put in `innerHTML`.
 */
export function workSvg(work: Work): string {
  const { minX, width, height } = workBounds(work);
  const vw = width + MARGIN * 2;
  const vh = height + MARGIN * 2;
  const parts: string[] = [];
  for (const [x, y, w, h, color] of work.bricks) {
    const left = x - minX + MARGIN;
    const top = height - (y + h) + MARGIN;
    parts.push(`<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="0.12" fill="${color}" stroke="rgba(0,0,0,.28)" stroke-width="0.05"/>`);
    parts.push(`<rect x="${left}" y="${top + h - 0.14}" width="${w}" height="0.14" fill="rgba(0,0,0,.2)"/>`);
    for (let i = 0; i < w; i++) {
      parts.push(`<circle cx="${left + i + 0.5}" cy="${top + 0.2}" r="0.14" fill="rgba(255,255,255,.55)"/>`);
    }
  }
  const base = `<rect x="0.1" y="${height + MARGIN}" width="${vw - 0.2}" height="${MARGIN - 0.1}" rx="0.2" fill="#4ade80"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${base}${parts.join('')}</svg>`;
}
