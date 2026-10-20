/**
 * What a child has earned in the workshop, worked out from one number: how many
 * pictures they have finished (`made`). Pure — no DOM, no storage.
 *
 * Nothing is ever taken away and nothing is required: every unlock only adds a
 * choice (a colour, a pen, a sticker theme, more pictures to draw).
 */
import { PAINT_COLORS } from '../paint/logic';

export type ModeId = 'practice' | 'colour' | 'free' | 'copy';
export const MODE_IDS: readonly ModeId[] = ['practice', 'colour', 'free', 'copy'];

export interface ModeInfo {
  id: ModeId;
  /** Vietnamese name: aria-label and what is read aloud. */
  name: string;
  /** Emoji for the small HUD button and the album caption. */
  icon: string;
  /** Pastel tile colour on the workshop door. */
  color: string;
  say: string;
}

export const MODES: readonly ModeInfo[] = [
  { id: 'practice', name: 'Tập vẽ', icon: '✏️', color: '#d9f99d', say: 'Tập vẽ.' },
  { id: 'colour', name: 'Tô tranh', icon: '🖍️', color: '#fed7aa', say: 'Tô tranh.' },
  { id: 'free', name: 'Vẽ tự do', icon: '🖌️', color: '#bae6fd', say: 'Vẽ tự do.' },
  { id: 'copy', name: 'Vẽ theo mẫu', icon: '👻', color: '#e9d5ff', say: 'Vẽ theo mẫu.' },
];

export function modeInfo(id: ModeId): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

/** "màu đỏ" → "Màu… đỏ." : a pause after the first word so the voice goes slowly. */
export function slow(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const cap = t[0]!.toUpperCase() + t.slice(1);
  const i = cap.indexOf(' ');
  return i < 0 ? `${cap}.` : `${cap.slice(0, i)}… ${cap.slice(i + 1)}.`;
}

/* ------------------------------------------------------------------ colours */

export interface ColorStep {
  hex: string;
  name: string;
  /** Finished pictures needed. */
  at: number;
}

const base = (hex: string): { hex: string; name: string } => ({ hex, name: PAINT_COLORS.find((c) => c.hex === hex)?.name ?? 'màu' });

/** Twelve colours in unlock order; the first six are there from the start. */
export const COLOR_STEPS: readonly ColorStep[] = [
  { ...base('#ef4444'), at: 0 },
  { ...base('#facc15'), at: 0 },
  { ...base('#3b82f6'), at: 0 },
  { ...base('#22c55e'), at: 0 },
  { ...base('#f97316'), at: 0 },
  { ...base('#ec4899'), at: 0 },
  { ...base('#a855f7'), at: 2 },
  { ...base('#78350f'), at: 3 },
  { hex: '#38bdf8', name: 'màu xanh da trời', at: 4 },
  { hex: '#a3e635', name: 'màu xanh non', at: 6 },
  { hex: '#14b8a6', name: 'màu xanh ngọc', at: 8 },
  { hex: '#1f2937', name: 'màu đen', at: 10 },
];

export function unlockedColors(made: number): ColorStep[] {
  return COLOR_STEPS.filter((c) => c.at <= made);
}

/* ------------------------------------------------------------------- brushes */

export type BrushKind = 'pen' | 'crayon' | 'rainbow' | 'sparkle';

export interface BrushStep {
  kind: BrushKind;
  icon: string;
  name: string;
  at: number;
}

export const BRUSH_STEPS: readonly BrushStep[] = [
  { kind: 'pen', icon: '✏️', name: 'bút màu', at: 0 },
  { kind: 'crayon', icon: '🖍️', name: 'bút sáp', at: 0 },
  { kind: 'rainbow', icon: '🌈', name: 'bút cầu vồng', at: 3 },
  { kind: 'sparkle', icon: '✨', name: 'bút lấp lánh', at: 6 },
];

export function unlockedBrushes(made: number): BrushStep[] {
  return BRUSH_STEPS.filter((b) => b.at <= made);
}

/* ---------------------------------------------------------------- stamp sets */

export interface StampItem {
  emoji: string;
  name: string;
}

export interface Theme {
  id: string;
  icon: string;
  name: string;
  at: number;
  items: readonly StampItem[];
}

const it = (emoji: string, name: string): StampItem => ({ emoji, name });

/** Seven themed sets of six stamps. Using a stamp for the first time collects it. */
export const THEMES: readonly Theme[] = [
  { id: 'pets', icon: '🐶', name: 'bạn thú', at: 0, items: [it('🐶', 'con chó'), it('🐱', 'con mèo'), it('🐰', 'con thỏ'), it('🐻', 'con gấu'), it('🐼', 'gấu trúc'), it('🐸', 'con ếch')] },
  { id: 'nature', icon: '🌸', name: 'thiên nhiên', at: 0, items: [it('🌸', 'bông hoa'), it('🌻', 'hoa hướng dương'), it('🌳', 'cái cây'), it('🍄', 'cây nấm'), it('🦋', 'con bướm'), it('🐞', 'con bọ rùa')] },
  { id: 'food', icon: '🍎', name: 'món ngon', at: 2, items: [it('🍎', 'quả táo'), it('🍌', 'quả chuối'), it('🍓', 'quả dâu'), it('🍦', 'cây kem'), it('🍪', 'bánh quy'), it('🍕', 'bánh pizza')] },
  { id: 'vehicles', icon: '🚗', name: 'xe cộ', at: 4, items: [it('🚗', 'xe hơi'), it('🚌', 'xe buýt'), it('🚒', 'xe cứu hoả'), it('🚂', 'tàu hoả'), it('✈️', 'máy bay'), it('🚀', 'tên lửa')] },
  { id: 'sea', icon: '🐠', name: 'biển xanh', at: 6, items: [it('🐠', 'con cá'), it('🐙', 'bạch tuộc'), it('🐳', 'cá voi'), it('🐬', 'cá heo'), it('🦀', 'con cua'), it('🐚', 'vỏ sò')] },
  { id: 'fun', icon: '🎈', name: 'vui nhộn', at: 8, items: [it('🎈', 'bóng bay'), it('🎁', 'hộp quà'), it('🎂', 'bánh sinh nhật'), it('🎵', 'nốt nhạc'), it('⭐', 'ngôi sao'), it('❤️', 'trái tim')] },
  { id: 'sky', icon: '🌈', name: 'bầu trời', at: 10, items: [it('🌈', 'cầu vồng'), it('☀️', 'mặt trời'), it('🌙', 'mặt trăng'), it('☁️', 'đám mây'), it('🪁', 'con diều'), it('🚁', 'trực thăng')] },
];

export function unlockedThemes(made: number): Theme[] {
  return THEMES.filter((t) => t.at <= made);
}

/** Name of a stamp for the voice; unknown emoji (the child's own stickers) have none. */
export function stampName(emoji: string): string {
  for (const t of THEMES) {
    const found = t.items.find((i) => i.emoji === emoji);
    if (found) return found.name;
  }
  return '';
}

export function themeOf(emoji: string): Theme | undefined {
  return THEMES.find((t) => t.items.some((i) => i.emoji === emoji));
}

/** How many of a theme's stamps are in `collected`. */
export function themeProgress(theme: Theme, collected: readonly string[]): number {
  return theme.items.filter((i) => collected.includes(i.emoji)).length;
}

export function themeComplete(theme: Theme, collected: readonly string[]): boolean {
  return themeProgress(theme, collected) === theme.items.length;
}

export const TOTAL_STAMPS: number = THEMES.reduce((n, t) => n + t.items.length, 0);

/* ------------------------------------------------------------------ pictures */

/** Pictures drawn from the start, and how many more each finished picture opens. */
export const PICTURE_START = 8;
export const PICTURES_PER_WORK = 2;

export function pictureCount(made: number, total: number): number {
  return Math.min(total, PICTURE_START + PICTURES_PER_WORK * Math.max(0, Math.floor(made)));
}

/**
 * The next picture to offer: the first unlocked one not yet seen this visit (newest
 * unlocks come last in the library, so older ones come first); once all are seen, any
 * unlocked one except the picture just drawn.
 */
export function pickNextPicture(unlocked: readonly string[], seen: ReadonlySet<string>, current: string | null, rng: () => number = Math.random): string | null {
  if (unlocked.length === 0) return null;
  const fresh = unlocked.find((id) => !seen.has(id));
  if (fresh) return fresh;
  const others = unlocked.filter((id) => id !== current);
  const pool = others.length ? others : unlocked;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

/* ------------------------------------------------------------------- unlocks */

export interface Unlock {
  kind: 'picture' | 'color' | 'brush' | 'theme';
  /** Emoji to show (none for a colour). */
  icon?: string;
  hex?: string;
  name: string;
}

interface PicInfo {
  icon: string;
  name: string;
}

/** Everything that opened between having finished `before` and `after` pictures. */
export function unlocksBetween(before: number, after: number, pics: readonly PicInfo[]): Unlock[] {
  const out: Unlock[] = [];
  if (after <= before) return out;
  for (const c of COLOR_STEPS) if (c.at > before && c.at <= after) out.push({ kind: 'color', hex: c.hex, name: c.name });
  for (const b of BRUSH_STEPS) if (b.at > before && b.at <= after) out.push({ kind: 'brush', icon: b.icon, name: b.name });
  for (const t of THEMES) if (t.at > before && t.at <= after) out.push({ kind: 'theme', icon: t.icon, name: `bộ hình dán ${t.name}` });
  const from = pictureCount(before, pics.length);
  const to = pictureCount(after, pics.length);
  for (let i = from; i < to; i++) {
    const p = pics[i];
    if (p) out.push({ kind: 'picture', icon: p.icon, name: `tranh ${p.name}` });
  }
  return out;
}

export interface Milestone {
  /** Finished pictures at which it opens. */
  at: number;
  /** The previous milestone (for a progress bar). */
  from: number;
  remaining: number;
  preview: Unlock;
}

/** The next thing that will open, or null once everything has. */
export function nextMilestone(made: number, pics: readonly PicInfo[]): Milestone | null {
  const marks = new Set<number>();
  for (const c of COLOR_STEPS) marks.add(c.at);
  for (const b of BRUSH_STEPS) marks.add(b.at);
  for (const t of THEMES) marks.add(t.at);
  for (let n = 1; pictureCount(n - 1, pics.length) < pics.length; n++) marks.add(n);
  const sorted = [...marks].sort((a, b) => a - b);
  const at = sorted.find((m) => m > made);
  if (at === undefined) return null;
  const from = [...sorted].reverse().find((m) => m <= made) ?? 0;
  const all = unlocksBetween(at - 1, at, pics);
  const preview = all.find((u) => u.kind !== 'picture') ?? all[0];
  if (!preview) return null;
  return { at, from, remaining: at - made, preview };
}
