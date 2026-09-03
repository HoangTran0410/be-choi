import { pick, shuffle } from '../../core/dom';

export type BlockShape = 'square' | 'rect' | 'triangle' | 'circle' | 'semicircle' | 'diamond' | 'trapezoid';

export const BLOCK_SHAPES: readonly BlockShape[] = ['square', 'rect', 'triangle', 'circle', 'semicircle', 'diamond', 'trapezoid'];

/** An axis-aligned box in the 100×100 picture; the shape fills the box. */
export interface Block {
  shape: BlockShape;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Degrees rotated about the box centre: 0, 90, 180 or 270. Quarter turns are only used on square boxes so the box stays true. */
  rot?: number;
}

export interface Picture {
  id: string;
  /** Vietnamese name, spoken when the picture is complete. */
  name: string;
  blocks: Block[];
}

const RED = '#ef4444';
const ORANGE = '#f97316';
const AMBER = '#f59e0b';
const BROWN = '#d97706';
const YELLOW = '#facc15';
const LIME = '#84cc16';
const GREEN = '#22c55e';
const SKY = '#38bdf8';
const BLUE = '#3b82f6';
const PURPLE = '#a855f7';
const PINK = '#ec4899';
const SNOW = '#f8fafc';

/**
 * The pictures; boxes never overlap (they may touch), so every block has its own outline on the board.
 * Pieces of the same shape and size (two wheels, two ears) are interchangeable, so twins are only used
 * where swapping them leaves the picture unchanged.
 */
export const PICTURES: readonly Picture[] = [
  {
    id: 'house',
    name: 'ngôi nhà',
    blocks: [
      { shape: 'triangle', x: 10, y: 6, w: 80, h: 34, color: RED },
      { shape: 'square', x: 10, y: 40, w: 60, h: 60, color: YELLOW },
      { shape: 'square', x: 70, y: 40, w: 20, h: 20, color: SKY },
      { shape: 'rect', x: 70, y: 60, w: 20, h: 40, color: ORANGE },
    ],
  },
  {
    id: 'rocket',
    name: 'tên lửa',
    blocks: [
      { shape: 'triangle', x: 35, y: 2, w: 30, h: 26, color: RED },
      { shape: 'circle', x: 35, y: 28, w: 30, h: 30, color: SKY },
      { shape: 'rect', x: 35, y: 58, w: 30, h: 34, color: YELLOW },
      { shape: 'triangle', x: 15, y: 64, w: 20, h: 32, color: GREEN },
      { shape: 'triangle', x: 65, y: 64, w: 20, h: 32, color: GREEN },
    ],
  },
  {
    id: 'boat',
    name: 'chiếc thuyền',
    blocks: [
      { shape: 'rect', x: 30, y: 6, w: 8, h: 58, color: ORANGE },
      { shape: 'triangle', x: 38, y: 14, w: 52, h: 50, color: YELLOW },
      { shape: 'trapezoid', x: 5, y: 64, w: 90, h: 30, color: BLUE, rot: 180 },
    ],
  },
  {
    id: 'tree',
    name: 'cái cây',
    blocks: [
      { shape: 'triangle', x: 25, y: 4, w: 50, h: 36, color: LIME },
      { shape: 'triangle', x: 10, y: 40, w: 80, h: 36, color: GREEN },
      { shape: 'rect', x: 40, y: 76, w: 20, h: 22, color: BROWN },
    ],
  },
  {
    id: 'car',
    name: 'ô tô',
    blocks: [
      { shape: 'trapezoid', x: 25, y: 12, w: 50, h: 30, color: SKY },
      { shape: 'rect', x: 5, y: 42, w: 90, h: 30, color: RED },
      { shape: 'circle', x: 15, y: 72, w: 20, h: 20, color: PURPLE },
      { shape: 'circle', x: 65, y: 72, w: 20, h: 20, color: PURPLE },
    ],
  },
  {
    id: 'fish',
    name: 'con cá',
    blocks: [
      { shape: 'triangle', x: 2, y: 38, w: 24, h: 24, color: PINK, rot: 90 },
      { shape: 'circle', x: 26, y: 20, w: 60, h: 60, color: ORANGE },
      { shape: 'circle', x: 86, y: 12, w: 14, h: 14, color: SKY },
    ],
  },
  {
    id: 'icecream',
    name: 'cây kem',
    blocks: [
      { shape: 'semicircle', x: 32, y: 6, w: 36, h: 18, color: GREEN },
      { shape: 'circle', x: 32, y: 24, w: 36, h: 36, color: PINK },
      { shape: 'triangle', x: 32, y: 60, w: 36, h: 40, color: AMBER, rot: 180 },
    ],
  },
  {
    id: 'robot',
    name: 'rô-bốt',
    blocks: [
      { shape: 'circle', x: 31, y: 6, w: 14, h: 14, color: YELLOW },
      { shape: 'circle', x: 55, y: 6, w: 14, h: 14, color: YELLOW },
      { shape: 'square', x: 30, y: 20, w: 40, h: 40, color: SKY },
      { shape: 'rect', x: 25, y: 60, w: 50, h: 36, color: PURPLE },
      { shape: 'rect', x: 5, y: 62, w: 20, h: 14, color: ORANGE },
      { shape: 'rect', x: 75, y: 62, w: 20, h: 14, color: ORANGE },
    ],
  },

  /* ---- three blocks ---- */
  {
    id: 'apple',
    name: 'quả táo',
    blocks: [
      { shape: 'rect', x: 47, y: 6, w: 6, h: 20, color: BROWN },
      { shape: 'semicircle', x: 53, y: 6, w: 20, h: 20, color: GREEN, rot: 90 },
      { shape: 'circle', x: 15, y: 26, w: 70, h: 70, color: RED },
    ],
  },
  {
    id: 'balloon',
    name: 'quả bóng bay',
    blocks: [
      { shape: 'circle', x: 20, y: 2, w: 60, h: 60, color: PINK },
      { shape: 'triangle', x: 44, y: 62, w: 12, h: 10, color: PINK },
      { shape: 'rect', x: 47, y: 72, w: 6, h: 26, color: BROWN },
    ],
  },
  {
    id: 'mushroom',
    name: 'cây nấm',
    blocks: [
      { shape: 'semicircle', x: 5, y: 8, w: 90, h: 45, color: RED },
      { shape: 'rect', x: 35, y: 53, w: 30, h: 37, color: SNOW },
      { shape: 'rect', x: 6, y: 90, w: 88, h: 8, color: GREEN },
    ],
  },
  {
    id: 'cup',
    name: 'cái cốc',
    blocks: [
      { shape: 'rect', x: 54, y: 2, w: 6, h: 20, color: RED },
      { shape: 'rect', x: 12, y: 22, w: 58, h: 68, color: SKY },
      { shape: 'semicircle', x: 70, y: 36, w: 26, h: 26, color: SKY, rot: 90 },
    ],
  },

  /* ---- four blocks ---- */
  {
    id: 'truck',
    name: 'xe tải',
    blocks: [
      { shape: 'rect', x: 2, y: 18, w: 58, h: 52, color: BLUE },
      { shape: 'square', x: 60, y: 34, w: 36, h: 36, color: RED },
      { shape: 'circle', x: 10, y: 70, w: 24, h: 24, color: PURPLE },
      { shape: 'circle', x: 62, y: 70, w: 24, h: 24, color: PURPLE },
    ],
  },
  {
    id: 'cat',
    name: 'con mèo',
    blocks: [
      { shape: 'triangle', x: 30, y: 6, w: 18, h: 18, color: PINK },
      { shape: 'triangle', x: 52, y: 6, w: 18, h: 18, color: PINK },
      { shape: 'circle', x: 24, y: 24, w: 52, h: 52, color: ORANGE },
      { shape: 'rect', x: 22, y: 76, w: 56, h: 22, color: BROWN },
    ],
  },
  {
    id: 'bear',
    name: 'con gấu',
    blocks: [
      { shape: 'circle', x: 27, y: 8, w: 16, h: 16, color: AMBER },
      { shape: 'circle', x: 57, y: 8, w: 16, h: 16, color: AMBER },
      { shape: 'circle', x: 25, y: 24, w: 50, h: 50, color: BROWN },
      { shape: 'rect', x: 30, y: 74, w: 40, h: 24, color: RED },
    ],
  },
  {
    id: 'rabbit',
    name: 'con thỏ',
    blocks: [
      { shape: 'rect', x: 30, y: 2, w: 12, h: 30, color: PINK },
      { shape: 'rect', x: 58, y: 2, w: 12, h: 30, color: PINK },
      { shape: 'circle', x: 28, y: 32, w: 44, h: 44, color: SNOW },
      { shape: 'semicircle', x: 18, y: 76, w: 64, h: 24, color: SNOW },
    ],
  },
  {
    id: 'duck',
    name: 'con vịt',
    blocks: [
      { shape: 'triangle', x: 4, y: 24, w: 18, h: 18, color: ORANGE, rot: 270 },
      { shape: 'circle', x: 22, y: 14, w: 38, h: 38, color: YELLOW },
      { shape: 'semicircle', x: 8, y: 52, w: 88, h: 40, color: AMBER },
      { shape: 'rect', x: 0, y: 92, w: 100, h: 8, color: SKY },
    ],
  },
  {
    id: 'whale',
    name: 'cá voi',
    blocks: [
      { shape: 'triangle', x: 26, y: 14, w: 20, h: 22, color: SKY, rot: 180 },
      { shape: 'semicircle', x: 6, y: 36, w: 70, h: 42, color: BLUE },
      { shape: 'triangle', x: 76, y: 54, w: 24, h: 24, color: BLUE, rot: 270 },
      { shape: 'rect', x: 0, y: 78, w: 100, h: 14, color: SKY },
    ],
  },
  {
    id: 'umbrella',
    name: 'cái ô',
    blocks: [
      { shape: 'triangle', x: 44, y: 0, w: 12, h: 12, color: YELLOW },
      { shape: 'semicircle', x: 2, y: 12, w: 96, h: 48, color: RED },
      { shape: 'rect', x: 47, y: 60, w: 6, h: 30, color: BROWN },
      { shape: 'semicircle', x: 35, y: 90, w: 18, h: 9, color: BROWN, rot: 180 },
    ],
  },
  {
    id: 'kite',
    name: 'con diều',
    blocks: [
      { shape: 'diamond', x: 20, y: 2, w: 60, h: 68, color: SKY },
      { shape: 'rect', x: 47, y: 70, w: 6, h: 28, color: BROWN },
      { shape: 'diamond', x: 33, y: 76, w: 14, h: 10, color: RED },
      { shape: 'diamond', x: 53, y: 86, w: 14, h: 10, color: YELLOW },
    ],
  },
  {
    id: 'cake',
    name: 'bánh sinh nhật',
    blocks: [
      { shape: 'triangle', x: 45, y: 4, w: 10, h: 12, color: ORANGE },
      { shape: 'rect', x: 46, y: 16, w: 8, h: 18, color: SKY },
      { shape: 'rect', x: 24, y: 34, w: 52, h: 26, color: YELLOW },
      { shape: 'rect', x: 8, y: 60, w: 84, h: 36, color: PINK },
    ],
  },
  {
    id: 'carrot',
    name: 'củ cà rốt',
    blocks: [
      { shape: 'triangle', x: 29, y: 6, w: 14, h: 22, color: GREEN },
      { shape: 'triangle', x: 43, y: 2, w: 14, h: 26, color: LIME },
      { shape: 'triangle', x: 57, y: 6, w: 14, h: 22, color: GREEN },
      { shape: 'triangle', x: 29, y: 28, w: 42, h: 68, color: ORANGE, rot: 180 },
    ],
  },

  /* ---- five blocks ---- */
  {
    id: 'butterfly',
    name: 'con bướm',
    blocks: [
      { shape: 'triangle', x: 4, y: 6, w: 40, h: 40, color: PINK, rot: 90 },
      { shape: 'rect', x: 44, y: 6, w: 12, h: 88, color: PURPLE },
      { shape: 'triangle', x: 56, y: 6, w: 40, h: 40, color: PINK, rot: 270 },
      { shape: 'triangle', x: 14, y: 48, w: 30, h: 30, color: ORANGE, rot: 90 },
      { shape: 'triangle', x: 56, y: 48, w: 30, h: 30, color: ORANGE, rot: 270 },
    ],
  },
  {
    id: 'sun',
    name: 'ông mặt trời',
    blocks: [
      { shape: 'triangle', x: 38, y: 1, w: 24, h: 24, color: ORANGE },
      { shape: 'triangle', x: 1, y: 38, w: 24, h: 24, color: ORANGE, rot: 270 },
      { shape: 'circle', x: 25, y: 25, w: 50, h: 50, color: YELLOW },
      { shape: 'triangle', x: 75, y: 38, w: 24, h: 24, color: ORANGE, rot: 90 },
      { shape: 'triangle', x: 38, y: 75, w: 24, h: 24, color: ORANGE, rot: 180 },
    ],
  },
  {
    id: 'star',
    name: 'ngôi sao',
    blocks: [
      { shape: 'triangle', x: 36, y: 8, w: 28, h: 28, color: AMBER },
      { shape: 'triangle', x: 8, y: 36, w: 28, h: 28, color: AMBER, rot: 270 },
      { shape: 'square', x: 36, y: 36, w: 28, h: 28, color: YELLOW },
      { shape: 'triangle', x: 64, y: 36, w: 28, h: 28, color: AMBER, rot: 90 },
      { shape: 'triangle', x: 36, y: 64, w: 28, h: 28, color: AMBER, rot: 180 },
    ],
  },
  {
    id: 'castle',
    name: 'lâu đài',
    blocks: [
      { shape: 'triangle', x: 4, y: 4, w: 22, h: 24, color: RED },
      { shape: 'triangle', x: 74, y: 4, w: 22, h: 24, color: RED },
      { shape: 'rect', x: 4, y: 28, w: 22, h: 68, color: SKY },
      { shape: 'rect', x: 74, y: 28, w: 22, h: 68, color: SKY },
      { shape: 'rect', x: 26, y: 52, w: 48, h: 44, color: YELLOW },
    ],
  },
  {
    id: 'bicycle',
    name: 'xe đạp',
    blocks: [
      { shape: 'rect', x: 26, y: 24, w: 14, h: 8, color: BROWN },
      { shape: 'rect', x: 60, y: 24, w: 14, h: 8, color: BROWN },
      { shape: 'triangle', x: 26, y: 32, w: 48, h: 24, color: RED, rot: 180 },
      { shape: 'circle', x: 4, y: 56, w: 40, h: 40, color: BLUE },
      { shape: 'circle', x: 56, y: 56, w: 40, h: 40, color: BLUE },
    ],
  },
  {
    id: 'chicken',
    name: 'con gà',
    blocks: [
      { shape: 'semicircle', x: 38, y: 16, w: 24, h: 12, color: RED },
      { shape: 'circle', x: 22, y: 28, w: 56, h: 56, color: YELLOW },
      { shape: 'triangle', x: 78, y: 44, w: 16, h: 16, color: ORANGE, rot: 90 },
      { shape: 'rect', x: 38, y: 84, w: 6, h: 14, color: ORANGE },
      { shape: 'rect', x: 56, y: 84, w: 6, h: 14, color: ORANGE },
    ],
  },

  /* ---- six blocks ---- */
  {
    id: 'flower',
    name: 'bông hoa',
    blocks: [
      { shape: 'semicircle', x: 37, y: 0, w: 26, h: 26, color: PINK },
      { shape: 'semicircle', x: 11, y: 26, w: 26, h: 26, color: PINK, rot: 270 },
      { shape: 'circle', x: 37, y: 26, w: 26, h: 26, color: YELLOW },
      { shape: 'semicircle', x: 63, y: 26, w: 26, h: 26, color: PINK, rot: 90 },
      { shape: 'semicircle', x: 37, y: 52, w: 26, h: 26, color: PINK, rot: 180 },
      { shape: 'rect', x: 47, y: 78, w: 6, h: 22, color: GREEN },
    ],
  },
  {
    id: 'train',
    name: 'tàu hoả',
    blocks: [
      { shape: 'rect', x: 12, y: 16, w: 14, h: 24, color: AMBER },
      { shape: 'rect', x: 62, y: 22, w: 34, h: 48, color: RED },
      { shape: 'rect', x: 2, y: 40, w: 60, h: 30, color: BLUE },
      { shape: 'circle', x: 6, y: 70, w: 22, h: 22, color: PURPLE },
      { shape: 'circle', x: 36, y: 70, w: 22, h: 22, color: PURPLE },
      { shape: 'circle', x: 70, y: 70, w: 22, h: 22, color: PURPLE },
    ],
  },
  {
    id: 'plane',
    name: 'máy bay',
    blocks: [
      { shape: 'triangle', x: 40, y: 2, w: 20, h: 18, color: RED },
      { shape: 'triangle', x: 2, y: 30, w: 38, h: 38, color: BLUE, rot: 270 },
      { shape: 'rect', x: 40, y: 20, w: 20, h: 76, color: SKY },
      { shape: 'triangle', x: 60, y: 30, w: 38, h: 38, color: BLUE, rot: 90 },
      { shape: 'triangle', x: 20, y: 76, w: 20, h: 20, color: RED, rot: 270 },
      { shape: 'triangle', x: 60, y: 76, w: 20, h: 20, color: RED, rot: 90 },
    ],
  },
  {
    id: 'snowman',
    name: 'người tuyết',
    blocks: [
      { shape: 'rect', x: 38, y: 1, w: 24, h: 12, color: PURPLE },
      { shape: 'circle', x: 39, y: 13, w: 22, h: 22, color: SNOW },
      { shape: 'rect', x: 8, y: 44, w: 28, h: 6, color: BROWN },
      { shape: 'circle', x: 36, y: 35, w: 28, h: 28, color: SNOW },
      { shape: 'rect', x: 64, y: 44, w: 28, h: 6, color: BROWN },
      { shape: 'circle', x: 32, y: 63, w: 36, h: 36, color: SNOW },
    ],
  },
];

/** SVG paths in a 0..1 unit box; the game scales them to the block's box with a transform. */
const PATHS: Record<BlockShape, string> = {
  square: 'M0,0 H1 V1 H0 Z',
  rect: 'M0,0 H1 V1 H0 Z',
  triangle: 'M0.5,0 L1,1 H0 Z',
  circle: 'M0.5,0 A0.5,0.5 0 1,0 0.5,1 A0.5,0.5 0 1,0 0.5,0 Z',
  /** Flat side at the bottom, dome on top; a true semicircle when the box is twice as wide as it is tall. */
  semicircle: 'M0,1 A0.5,1 0 0,1 1,1 Z',
  diamond: 'M0.5,0 L1,0.5 L0.5,1 L0,0.5 Z',
  trapezoid: 'M0.25,0 H0.75 L1,1 H0 Z',
};

export function blockPath(shape: BlockShape): string {
  return PATHS[shape];
}

/**
 * SVG transform that maps the unit-box path onto the block's box placed at (`x`, `y`)
 * (its own position by default; `0, 0` for a piece drawn alone), rotated about the box centre.
 */
export function blockTransform(block: Block, x = block.x, y = block.y): string {
  const base = `translate(${x} ${y}) scale(${block.w} ${block.h})`;
  const rot = (block.rot ?? 0) % 360;
  if (rot === 0) return base;
  const cx = x + block.w / 2;
  const cy = y + block.h / 2;
  return `translate(${cx} ${cy}) rotate(${rot}) translate(${-cx} ${-cy}) ${base}`;
}

/** Maximum number of blocks in a round: 4 for rounds 0 and 1, then 6. */
export function difficultyFor(round: number): number {
  return round < 2 ? 4 : 6;
}

/** A random picture within the round's block budget, avoiding `excludeId` when any other fits. */
export function makeBlocksRound(round: number, rng: () => number = Math.random, excludeId?: string): Picture {
  const max = difficultyFor(round);
  const fitting = PICTURES.filter((p) => p.blocks.length <= max);
  const fresh = fitting.filter((p) => p.id !== excludeId);
  const candidates = fresh.length ? fresh : fitting.length ? fitting : PICTURES;
  const picture = pick(candidates, 1, rng)[0];
  if (!picture) throw new Error('blocks: no pictures');
  return picture;
}

/** Block indices in the order the pieces appear in the tray. */
export function pieceOrder(picture: Picture, rng: () => number = Math.random): number[] {
  return shuffle(
    picture.blocks.map((_, i) => i),
    rng,
  );
}

/** Axis-aligned box overlap; boxes that merely touch (within `tolerance`) do not overlap. */
export function overlaps(a: Block, b: Block, tolerance = 0.5): boolean {
  return a.x + a.w > b.x + tolerance && b.x + b.w > a.x + tolerance && a.y + a.h > b.y + tolerance && b.y + b.h > a.y + tolerance;
}

/** Same shape, size and rotation: such pieces look identical, so either may fill the other's outline. */
export function congruent(a: Block, b: Block): boolean {
  const kind = (s: BlockShape) => (s === 'square' ? 'rect' : s);
  return kind(a.shape) === kind(b.shape) && a.w === b.w && a.h === b.h && (a.rot ?? 0) % 360 === (b.rot ?? 0) % 360;
}
