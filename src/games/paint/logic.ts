/**
 * Finger painting: pure tool state. No DOM, no canvas.
 */

export interface PaintColor {
  hex: string;
  /** Vietnamese name, spoken when the colour is picked. */
  name: string;
}

const RED: PaintColor = { hex: '#ef4444', name: 'màu đỏ' };

export const PAINT_COLORS: readonly PaintColor[] = [
  RED,
  { hex: '#f97316', name: 'màu cam' },
  { hex: '#facc15', name: 'màu vàng' },
  { hex: '#22c55e', name: 'màu xanh lá' },
  { hex: '#3b82f6', name: 'màu xanh dương' },
  { hex: '#a855f7', name: 'màu tím' },
  { hex: '#ec4899', name: 'màu hồng' },
  { hex: '#78350f', name: 'màu nâu' },
];

/** 8 hex colours: red, orange, yellow, green, blue, purple, pink, brown. */
export const PALETTE: readonly string[] = PAINT_COLORS.map((c) => c.hex);

/** Vietnamese name for a palette colour, `''` for unknown hex. */
export function colorName(hex: string): string {
  return PAINT_COLORS.find((c) => c.hex === hex)?.name ?? '';
}

const BRUSH_SIZES = [12, 24, 44] as const;
/** Brush diameters in CSS px, ascending. */
export const BRUSHES: readonly number[] = BRUSH_SIZES;
export const DEFAULT_SIZE: number = BRUSH_SIZES[1];

export const STAMPS: readonly string[] = ['⭐', '❤️', '🌸', '🐣'];

/**
 * `STAMPS` followed by every sticker the child has unlocked, skipping duplicates.
 * All of them: the toolbar used to take the first eight and stop, so past the
 * eighth an unlocked sticker went to the album and nowhere else — which made
 * collecting the rest of them pointless. The strip scrolls instead.
 */
export function stampList(stickers: readonly string[]): string[] {
  const out = [...STAMPS];
  for (const emoji of stickers) if (!out.includes(emoji)) out.push(emoji);
  return out;
}

/** Background photo cycle: none (-1) → 0 → … → `count - 1` → none. */
export function nextPhotoIndex(current: number, count: number): number {
  const next = current + 1;
  return next >= count ? -1 : next;
}

export type Tool =
  | { kind: 'brush'; color: string; size: number }
  | { kind: 'stamp'; emoji: string; size: number }
  | { kind: 'eraser'; size: number };

export const DEFAULT_TOOL: Tool = { kind: 'brush', color: RED.hex, size: DEFAULT_SIZE };

export interface ToolPatch {
  color?: string;
  size?: number;
  emoji?: string;
  eraser?: boolean;
}

/**
 * Apply a toolbar pick to the current tool.
 * - a colour always yields a brush in that colour (size kept);
 * - a size keeps the current kind, colour and emoji;
 * - an emoji yields a stamp (size kept);
 * - `eraser: true` yields the eraser (size kept);
 * - `eraser: false` while erasing goes back to a brush in `PALETTE[0]`.
 * Never mutates `current`.
 */
export function nextTool(current: Tool, patch: ToolPatch): Tool {
  let tool: Tool = current;
  if (patch.size !== undefined) tool = { ...tool, size: patch.size };
  if (patch.color !== undefined) tool = { kind: 'brush', color: patch.color, size: tool.size };
  if (patch.emoji !== undefined) tool = { kind: 'stamp', emoji: patch.emoji, size: tool.size };
  if (patch.eraser === true) tool = { kind: 'eraser', size: tool.size };
  if (patch.eraser === false && tool.kind === 'eraser') tool = { kind: 'brush', color: RED.hex, size: tool.size };
  return tool;
}

/** The eraser rubs out a wider trail than the brush of the same size. */
export const ERASER_SCALE = 1.8;

/** Line width in CSS px for a brush or eraser stroke. */
export function strokeWidth(tool: Tool): number {
  return tool.kind === 'eraser' ? tool.size * ERASER_SCALE : tool.size;
}

/** Font size in CSS px used to draw a stamp emoji. */
export function stampFontPx(size: number): number {
  return size * 3;
}

/** One star per session after this many finished strokes or stamps. */
export const STAR_AFTER_STROKES = 20;

/** Everything a half-finished drawing needs to come back the way it was left. */
export interface SavedPainting {
  /** PNG data URL of the strokes; transparent wherever the child has not drawn. */
  image: string;
  /** Size of the drawing area in CSS px when it was saved, so it can be re-centred. */
  w: number;
  h: number;
  /** Id of the background photo, or `null` for plain white. */
  photo: string | null;
  /** The background was showing as a line drawing to colour in. */
  lineArt: boolean;
}

/** Longest side of the stored snapshot: keeps a busy drawing inside the localStorage quota. */
export const SAVE_MAX_PX = 1024;
/** Quiet time after a stroke before the drawing is written out. */
export const SAVE_MS = 800;

export function serializePainting(p: SavedPainting): string {
  return JSON.stringify(p);
}

/** `null` for anything that is not a painting this version wrote. */
export function deserializePainting(raw: string): SavedPainting | null {
  try {
    const v = JSON.parse(raw) as Partial<SavedPainting>;
    if (typeof v.image !== 'string' || !v.image.startsWith('data:image/')) return null;
    if (typeof v.w !== 'number' || typeof v.h !== 'number' || !(v.w > 0) || !(v.h > 0)) return null;
    return {
      image: v.image,
      w: v.w,
      h: v.h,
      photo: typeof v.photo === 'string' ? v.photo : null,
      lineArt: v.lineArt === true,
    };
  } catch {
    return null;
  }
}
