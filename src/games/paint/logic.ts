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
