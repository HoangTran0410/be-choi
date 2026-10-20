/**
 * What the workshop offers and when: the ladder of difficulty and the things stars unlock in each of
 * the three modes, plus the slow, short phrases the workshop says. Pure data and rules, no DOM.
 *
 * Every finished activity earns one star in its mode (`Progress.counts`). Each mode reads only its
 * own count, so a child who loves bricks gets new blueprints without being pushed through puzzles.
 */
import type { FxKind } from '../../core/audio';
import { ANIMALS, FRUITS, NUMBERS_VI, VEHICLES, type Item } from '../../core/content';
import { randInt } from '../../core/dom';
import { PICTURES as BLOCK_PICTURES, type BlockShape, type Picture } from '../blocks/logic';
import { MODELS, colorName as brickColorName, type Model, type Suggestion } from '../bricks/logic';
import { levelFor, PICTURE_BGS, type Level } from '../jigsaw/logic';
import { SCENES, type Scene } from './scenes';

export type ModeId = 'puzzle' | 'shadow' | 'build';
export const MODE_IDS: readonly ModeId[] = ['puzzle', 'shadow', 'build'];

export interface ModeInfo {
  id: ModeId;
  /** Emoji on the big HUD button. */
  icon: string;
  /** Vietnamese name, spoken when the child switches to it. */
  label: string;
  /** Spoken right after the name. */
  prompt: string;
}

export const MODE_INFO: Readonly<Record<ModeId, ModeInfo>> = {
  puzzle: { id: 'puzzle', icon: '🧩', label: 'Ghép tranh', prompt: 'Kéo từng mảnh vào tranh nhé' },
  shadow: { id: 'shadow', icon: '🐘', label: 'Xếp theo bóng', prompt: 'Kéo các khối vào cái bóng đen nhé' },
  build: { id: 'build', icon: '🧱', label: 'Xây tự do', prompt: 'Mình cùng xây bằng gạch nhé' },
};

export interface Progress {
  /** Stars earned per mode. */
  counts: Record<ModeId, number>;
  /** The mode the child was in last, so the workshop opens where they left off. */
  mode: ModeId;
}

export function emptyProgress(): Progress {
  return { counts: { puzzle: 0, shadow: 0, build: 0 }, mode: 'puzzle' };
}

export function totalStars(p: Progress): number {
  return p.counts.puzzle + p.counts.shadow + p.counts.build;
}

/* ---------------------------------------------------------------------------
 * Puzzle: pictures and the cut ladder.
 * ------------------------------------------------------------------------- */

export interface PuzzleArt {
  id: string;
  /** Vietnamese name, spoken. */
  name: string;
  /** Emoji painted on the picture, or standing for the scene on a picker tile. */
  emoji: string;
  kind: 'emoji' | 'scene';
  scene?: Scene;
  /** Puzzle stars needed to unlock. */
  unlockAt: number;
}

/** Pictures that are there from the very first minute. */
export const FREE_ARTS = 6;

function emojiArt(item: Item): Omit<PuzzleArt, 'unlockAt'> {
  return { id: `emoji:${item.emoji}`, name: item.name, emoji: item.emoji, kind: 'emoji' };
}

const SCENE_EMOJI: Readonly<Record<string, string>> = {
  farm: '🏡',
  sea: '🌊',
  space: '🚀',
  garden: '🌻',
  zoo: '🦒',
  city: '🏙️',
  snow: '⛄',
  park: '🎠',
};

function sceneArt(scene: Scene): Omit<PuzzleArt, 'unlockAt'> {
  return { id: `scene:${scene.id}`, name: scene.name, emoji: SCENE_EMOJI[scene.id] ?? '🖼️', kind: 'scene', scene };
}

function roundRobin<T>(lists: readonly (readonly T[])[]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const l of lists) {
      const v = l[i];
      if (v !== undefined) out.push(v);
    }
  }
  return out;
}

/** Every picture in unlock order: six animals first, then animals, scenes, vehicles and fruits take turns. */
export const PUZZLE_ARTS: readonly PuzzleArt[] = (() => {
  const animals = ANIMALS.map(emojiArt);
  const rest = roundRobin([animals.slice(FREE_ARTS), SCENES.map(sceneArt), VEHICLES.map(emojiArt), FRUITS.map(emojiArt)]);
  return [...animals.slice(0, FREE_ARTS), ...rest].map((a, i) => ({ ...a, unlockAt: Math.max(0, i - FREE_ARTS + 1) }));
})();

export function puzzleArtsAt(stars: number): PuzzleArt[] {
  return PUZZLE_ARTS.filter((a) => a.unlockAt <= stars);
}

/**
 * The next picture: from the freshly unlocked ones about every other time (so a new star is felt),
 * otherwise anything unlocked. Never `excludeId` when something else exists.
 */
export function pickArt(stars: number, rng: () => number = Math.random, excludeId?: string): PuzzleArt {
  const open = puzzleArtsAt(stars);
  const fresh = open.filter((a) => a.id !== excludeId);
  const pool = fresh.length ? fresh : open;
  const newest = pool.slice(-3);
  const from = stars > 0 && rng() < 0.45 ? newest : pool;
  return from[randInt(0, from.length - 1, rng)] as PuzzleArt;
}

export function artBg(rng: () => number = Math.random): string {
  return PICTURE_BGS[randInt(0, PICTURE_BGS.length - 1, rng)] ?? '#fde68a';
}

/** Rung of the jigsaw ladder for a child with this many puzzle stars (14 and up is the endless pick). */
export function puzzleRung(stars: number): number {
  return Math.floor(stars * 0.7);
}

export function puzzleLevel(stars: number, rng: () => number = Math.random): Level {
  return levelFor(puzzleRung(stars), rng);
}

/* ---------------------------------------------------------------------------
 * Shadow: the block pictures from easy to hard.
 * ------------------------------------------------------------------------- */

/** Pictures with the fewest blocks first (the sort is stable, so the authored order is kept within a size). */
export const SHADOW_ORDER: readonly Picture[] = [...BLOCK_PICTURES].sort((a, b) => a.blocks.length - b.blocks.length);

/** Shadows open on day one; each star opens one more. */
export const FREE_SHADOWS = 5;

export function shadowPoolAt(stars: number): Picture[] {
  return SHADOW_ORDER.slice(0, Math.min(SHADOW_ORDER.length, FREE_SHADOWS + stars));
}

/** Until this many stars the seams between the blocks show in the shadow; after that it is a plain black shape. */
export const SEAMS_UNTIL = 6;

export function shadowHasSeams(stars: number): boolean {
  return stars < SEAMS_UNTIL;
}

export function pickShadow(stars: number, rng: () => number = Math.random, excludeId?: string): Picture {
  const open = shadowPoolAt(stars);
  const fresh = open.filter((p) => p.id !== excludeId);
  const pool = fresh.length ? fresh : open;
  const from = stars > 0 && rng() < 0.45 ? pool.slice(-3) : pool;
  return from[randInt(0, from.length - 1, rng)] as Picture;
}

const SHAPE_NAMES: Readonly<Record<BlockShape, string>> = {
  square: 'hình vuông',
  rect: 'hình chữ nhật',
  triangle: 'hình tam giác',
  circle: 'hình tròn',
  semicircle: 'hình bán nguyệt',
  diamond: 'hình thoi',
  trapezoid: 'hình thang',
};

export function shapeName(shape: BlockShape): string {
  return SHAPE_NAMES[shape];
}

const BLOCK_COLOR_NAMES: Readonly<Record<string, string>> = {
  '#ef4444': 'màu đỏ',
  '#f97316': 'màu cam',
  '#f59e0b': 'màu vàng đậm',
  '#d97706': 'màu nâu',
  '#facc15': 'màu vàng',
  '#84cc16': 'màu xanh non',
  '#22c55e': 'màu xanh lá',
  '#38bdf8': 'màu xanh da trời',
  '#3b82f6': 'màu xanh dương',
  '#a855f7': 'màu tím',
  '#ec4899': 'màu hồng',
  '#f8fafc': 'màu trắng',
};

export function blockColorName(hex: string): string {
  return BLOCK_COLOR_NAMES[hex.toLowerCase()] ?? 'nhiều màu';
}

/** "Hình tam giác, màu đỏ": what a block is, said slowly when the child picks it up. */
export function describeBlock(shape: BlockShape, color: string): string {
  return `${shapeName(shape)}, ${blockColorName(color)}`;
}

/* ---------------------------------------------------------------------------
 * Build: blueprints in the order they unlock.
 * ------------------------------------------------------------------------- */

/** Blueprint ids, easiest first; the `n`-th one opens after that many stars (the first two are free). */
export const BLUEPRINT_ORDER: readonly string[] = [
  'tower',
  'hat',
  'stairs',
  'worm',
  'chair',
  'house',
  'car',
  'flower',
  'duck',
  'boat',
  'tree',
  'train',
  'bridge',
  'robot',
  'castle',
];

export interface Blueprint {
  model: Model;
  unlockAt: number;
}

export const BLUEPRINTS: readonly Blueprint[] = BLUEPRINT_ORDER.map((id, i) => {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`build: no model ${id}`);
  return { model, unlockAt: Math.max(0, i - 1) };
});

export function blueprintsAt(stars: number): Blueprint[] {
  return BLUEPRINTS.filter((b) => b.unlockAt <= stars);
}

/** The next blueprint: the easiest one not yet built comes first, i.e. the freshest unlocked one is preferred. */
export function pickBlueprint(stars: number, rng: () => number = Math.random, excludeId?: string): Model {
  const open = blueprintsAt(stars);
  const fresh = open.filter((b) => b.model.id !== excludeId);
  const pool = fresh.length ? fresh : open;
  const from = stars > 0 && rng() < 0.5 ? pool.slice(-2) : pool;
  return (from[randInt(0, from.length - 1, rng)] as Blueprint).model;
}

function numberWord(n: number): string {
  return NUMBERS_VI[n] ?? String(n);
}

/** "Gạch màu đỏ, dài hai ô": the next step of a blueprint, short enough to be said slowly. */
export function describeStep(s: Suggestion): string {
  const size = s.h === 1 ? (s.w === 1 ? 'một ô' : `dài ${numberWord(s.w)} ô`) : `to ${numberWord(s.w)} nhân ${numberWord(s.h)}`;
  return `Gạch ${brickColorName(s.color)}, ${size}`;
}

/* ---------------------------------------------------------------------------
 * Unlock clock, shared by the three modes.
 * ------------------------------------------------------------------------- */

/** Sorted star counts (> 0) at which something new opens in `mode`. */
export function unlockTimes(mode: ModeId): number[] {
  const set = new Set<number>();
  if (mode === 'puzzle') for (const a of PUZZLE_ARTS) set.add(a.unlockAt);
  else if (mode === 'shadow') for (let n = 1; n <= SHADOW_ORDER.length - FREE_SHADOWS; n++) set.add(n);
  else for (const b of BLUEPRINTS) set.add(b.unlockAt);
  set.delete(0);
  return [...set].sort((a, b) => a - b);
}

export interface NextUnlock {
  /** Stars still needed; 0 when everything is open. */
  remaining: number;
  /** How far between the last unlock and the next, 0 … 1 (1 when everything is open). */
  fraction: number;
}

export function nextUnlock(mode: ModeId, stars: number): NextUnlock {
  const times = unlockTimes(mode);
  const next = times.find((t) => t > stars);
  if (next === undefined) return { remaining: 0, fraction: 1 };
  const prev = [0, ...times].filter((t) => t <= stars).pop() ?? 0;
  return { remaining: next - stars, fraction: (stars - prev) / (next - prev) };
}

/** Names of what opens exactly when the count reaches `stars` (empty most of the time). */
export function unlockedAt(mode: ModeId, stars: number): string[] {
  if (stars <= 0) return [];
  if (mode === 'puzzle') return PUZZLE_ARTS.filter((a) => a.unlockAt === stars).map((a) => a.name);
  if (mode === 'shadow') {
    const p = SHADOW_ORDER[FREE_SHADOWS + stars - 1];
    return p ? [p.name] : [];
  }
  return BLUEPRINTS.filter((b) => b.unlockAt === stars).map((b) => b.model.name);
}

/* ---------------------------------------------------------------------------
 * Words.
 * ------------------------------------------------------------------------- */

/** Where a piece belongs on the picture, from the centre of its slot (0 … 1 each way): "lên trên", "sang bên phải"… */
export function positionWord(cx: number, cy: number): string {
  const top = cy < 0.34;
  const bottom = cy > 0.66;
  const left = cx < 0.34;
  const right = cx > 0.66;
  if (top && left) return 'ở góc trên bên trái';
  if (top && right) return 'ở góc trên bên phải';
  if (bottom && left) return 'ở góc dưới bên trái';
  if (bottom && right) return 'ở góc dưới bên phải';
  if (top) return 'lên trên';
  if (bottom) return 'xuống dưới';
  if (left) return 'sang bên trái';
  if (right) return 'sang bên phải';
  return 'vào giữa';
}

/** The hint for a puzzle piece: short words with pauses, so a three-year-old can follow. */
export function pieceHint(cx: number, cy: number): string {
  return `Mảnh này, ${positionWord(cx, cy)} nhé`;
}

const VEHICLE_VOICE: Readonly<Record<string, FxKind>> = {
  '🚗': 'honk',
  '🚌': 'horn',
  '🚒': 'siren',
  '🚂': 'train',
  '🚜': 'tractor',
  '✈️': 'whistle',
};

/** Sound effect name for a vehicle picture, if it has one. */
export function vehicleVoice(emoji: string): FxKind | null {
  return VEHICLE_VOICE[emoji] ?? null;
}
