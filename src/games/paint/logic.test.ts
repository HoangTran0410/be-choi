import { describe, it, expect } from 'vitest';
import {
  BRUSHES,
  DEFAULT_TOOL,
  ERASER_SCALE,
  MAX_STICKER_STAMPS,
  PALETTE,
  STAMPS,
  STAR_AFTER_STROKES,
  colorName,
  nextPhotoIndex,
  nextTool,
  stampFontPx,
  stampList,
  strokeWidth,
  type Tool,
} from './logic';

describe('paint constants', () => {
  it('has 8 distinct hex colours, each with a Vietnamese name', () => {
    expect(PALETTE.length).toBe(8);
    expect(new Set(PALETTE).size).toBe(8);
    for (const hex of PALETTE) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colorName(hex)).toMatch(/^màu /);
    }
    expect(colorName('#ef4444')).toBe('màu đỏ');
    expect(colorName('#000000')).toBe('');
  });
  it('has 3 ascending brush sizes and 4 stamps', () => {
    expect(BRUSHES.length).toBe(3);
    for (let i = 1; i < BRUSHES.length; i++) expect(BRUSHES[i]).toBeGreaterThan(BRUSHES[i - 1] ?? Infinity);
    expect(STAMPS.length).toBe(4);
    expect(STAR_AFTER_STROKES).toBe(20);
  });
  it('defaults to a medium brush in the first colour', () => {
    expect(DEFAULT_TOOL).toEqual({ kind: 'brush', color: PALETTE[0], size: BRUSHES[1] });
  });
});

describe('nextTool', () => {
  const brush: Tool = { kind: 'brush', color: '#22c55e', size: 44 };
  const stamp: Tool = { kind: 'stamp', emoji: '🐣', size: 12 };
  const eraser: Tool = { kind: 'eraser', size: 24 };

  it('a colour always yields a brush in that colour and keeps the size', () => {
    expect(nextTool(brush, { color: '#3b82f6' })).toEqual({ kind: 'brush', color: '#3b82f6', size: 44 });
    expect(nextTool(stamp, { color: '#3b82f6' })).toEqual({ kind: 'brush', color: '#3b82f6', size: 12 });
    expect(nextTool(eraser, { color: '#3b82f6' })).toEqual({ kind: 'brush', color: '#3b82f6', size: 24 });
  });
  it('a size keeps kind, colour and emoji', () => {
    expect(nextTool(brush, { size: 12 })).toEqual({ kind: 'brush', color: '#22c55e', size: 12 });
    expect(nextTool(stamp, { size: 44 })).toEqual({ kind: 'stamp', emoji: '🐣', size: 44 });
    expect(nextTool(eraser, { size: 44 })).toEqual({ kind: 'eraser', size: 44 });
  });
  it('an emoji yields a stamp and keeps the size', () => {
    expect(nextTool(brush, { emoji: '⭐' })).toEqual({ kind: 'stamp', emoji: '⭐', size: 44 });
    expect(nextTool(stamp, { emoji: '❤️' })).toEqual({ kind: 'stamp', emoji: '❤️', size: 12 });
    expect(nextTool(eraser, { emoji: '🌸' })).toEqual({ kind: 'stamp', emoji: '🌸', size: 24 });
  });
  it('eraser toggles: on keeps size, off returns to a brush in PALETTE[0]', () => {
    expect(nextTool(brush, { eraser: true })).toEqual({ kind: 'eraser', size: 44 });
    expect(nextTool(stamp, { eraser: true })).toEqual({ kind: 'eraser', size: 12 });
    expect(nextTool(eraser, { eraser: false })).toEqual({ kind: 'brush', color: PALETTE[0], size: 24 });
    expect(nextTool(brush, { eraser: false })).toEqual(brush);
    expect(nextTool(stamp, { eraser: false })).toEqual(stamp);
  });
  it('an empty patch changes nothing and never mutates the input', () => {
    const before = { ...brush };
    expect(nextTool(brush, {})).toEqual(brush);
    nextTool(brush, { color: '#ef4444', size: 12, emoji: '⭐', eraser: true });
    expect(brush).toEqual(before);
  });
});

describe('stampList', () => {
  it('is the default stamps when the child has no stickers', () => {
    expect(stampList([])).toEqual(STAMPS);
  });
  it('appends stickers after the defaults, skipping duplicates, at most MAX_STICKER_STAMPS', () => {
    expect(stampList(['🐻', '⭐', '🦊', '🐻'])).toEqual([...STAMPS, '🐻', '🦊']);
    const many = ['🐻', '🦊', '🐸', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐵'];
    const out = stampList(many);
    expect(MAX_STICKER_STAMPS).toBe(8);
    expect(out.length).toBe(STAMPS.length + MAX_STICKER_STAMPS);
    expect(out.slice(STAMPS.length)).toEqual(many.slice(0, MAX_STICKER_STAMPS));
  });
});

describe('nextPhotoIndex', () => {
  it('cycles none → each photo → none', () => {
    expect(nextPhotoIndex(-1, 0)).toBe(-1);
    expect(nextPhotoIndex(-1, 2)).toBe(0);
    expect(nextPhotoIndex(0, 2)).toBe(1);
    expect(nextPhotoIndex(1, 2)).toBe(-1);
    expect(nextPhotoIndex(5, 2)).toBe(-1);
  });
});

describe('stroke geometry', () => {
  it('eraser is wider than a brush of the same size', () => {
    expect(strokeWidth({ kind: 'brush', color: '#ef4444', size: 24 })).toBe(24);
    expect(strokeWidth({ kind: 'stamp', emoji: '⭐', size: 24 })).toBe(24);
    expect(strokeWidth({ kind: 'eraser', size: 24 })).toBe(24 * ERASER_SCALE);
    expect(ERASER_SCALE).toBeGreaterThan(1);
  });
  it('stamp font is three times the size', () => {
    expect(stampFontPx(24)).toBe(72);
  });
});
