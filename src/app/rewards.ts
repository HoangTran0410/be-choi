import { celebrate } from '../core/celebrate';
import { h } from '../core/dom';
import type { AppDeps } from './deps';
import type { Store } from './storage';

export interface Sticker {
  emoji: string;
  name: string;
}

/** Unlockable stickers, in a fixed order so the album fills up predictably-ish (picked at random from the locked ones). */
export const STICKERS: readonly Sticker[] = [
  { emoji: '🐻', name: 'gấu nâu' },
  { emoji: '🦊', name: 'cáo' },
  { emoji: '🐼', name: 'gấu trúc' },
  { emoji: '🦁', name: 'sư tử' },
  { emoji: '🐯', name: 'hổ' },
  { emoji: '🐨', name: 'koala' },
  { emoji: '🐸', name: 'ếch' },
  { emoji: '🐙', name: 'bạch tuộc' },
  { emoji: '🦄', name: 'kỳ lân' },
  { emoji: '🐬', name: 'cá heo' },
  { emoji: '🦋', name: 'bướm' },
  { emoji: '🐞', name: 'bọ rùa' },
  { emoji: '🦖', name: 'khủng long' },
  { emoji: '🐳', name: 'cá voi' },
  { emoji: '🦜', name: 'vẹt' },
  { emoji: '🦩', name: 'hồng hạc' },
  { emoji: '🌈', name: 'cầu vồng' },
  { emoji: '⭐', name: 'ngôi sao' },
  { emoji: '🌙', name: 'mặt trăng' },
  { emoji: '☀️', name: 'mặt trời' },
  { emoji: '🌸', name: 'hoa anh đào' },
  { emoji: '🌻', name: 'hoa hướng dương' },
  { emoji: '🍄', name: 'nấm' },
  { emoji: '🌵', name: 'xương rồng' },
  { emoji: '🚀', name: 'tên lửa' },
  { emoji: '🚂', name: 'tàu hoả' },
  { emoji: '🚁', name: 'trực thăng' },
  { emoji: '⛵', name: 'thuyền buồm' },
  { emoji: '🎈', name: 'bóng bay' },
  { emoji: '🎁', name: 'hộp quà' },
  { emoji: '🎪', name: 'rạp xiếc' },
  { emoji: '🎠', name: 'ngựa gỗ' },
  { emoji: '🍦', name: 'kem' },
  { emoji: '🍩', name: 'bánh vòng' },
  { emoji: '🍭', name: 'kẹo mút' },
  { emoji: '🎂', name: 'bánh sinh nhật' },
  { emoji: '🏰', name: 'lâu đài' },
  { emoji: '🎸', name: 'đàn ghi-ta' },
  { emoji: '🥁', name: 'trống' },
  { emoji: '🎨', name: 'bảng màu' },
  { emoji: '🐥', name: 'gà con' },
  { emoji: '🐰', name: 'thỏ' },
  { emoji: '🐧', name: 'chim cánh cụt' },
  { emoji: '🦕', name: 'khủng long cổ dài' },
  { emoji: '👑', name: 'vương miện' },
  { emoji: '🏆', name: 'cúp' },
  { emoji: '🎯', name: 'bia' },
  { emoji: '💎', name: 'kim cương' },
];

export const STARS_PER_STICKER = 3;

export function stickerFor(emoji: string): Sticker | undefined {
  return STICKERS.find((s) => s.emoji === emoji);
}

/** Stars still needed before the next sticker. */
export function starsToNext(total: number): number {
  const r = total % STARS_PER_STICKER;
  return r === 0 ? STARS_PER_STICKER : STARS_PER_STICKER - r;
}

/** A themed set of stickers. Collect them all for a little party. */
export interface StickerSet {
  id: string;
  icon: string;
  name: string;
  emojis: readonly string[];
}

export const STICKER_SETS: readonly StickerSet[] = [
  { id: 'forest', icon: '🌲', name: 'Rừng xanh', emojis: ['🐻', '🦊', '🐼', '🦁', '🐯', '🐨'] },
  { id: 'sea', icon: '🌊', name: 'Biển xanh', emojis: ['🐙', '🐬', '🐳', '🐧'] },
  { id: 'garden', icon: '🌷', name: 'Vườn hoa', emojis: ['🦋', '🐞', '🌸', '🌻', '🍄', '🌵'] },
  { id: 'sky', icon: '🌤️', name: 'Bầu trời', emojis: ['🌈', '⭐', '🌙', '☀️'] },
  { id: 'vehicles', icon: '🚦', name: 'Xe cộ', emojis: ['🚂', '🚁', '🚀', '⛵'] },
  { id: 'friends', icon: '🏡', name: 'Bạn nhỏ', emojis: ['🐥', '🐰', '🐸', '🦜', '🦩'] },
  { id: 'fairy', icon: '✨', name: 'Cổ tích', emojis: ['🦄', '🦖', '🦕', '🏰'] },
  { id: 'party', icon: '🎉', name: 'Vui hội', emojis: ['🎈', '🎁', '🎪', '🎠'] },
  { id: 'food', icon: '🍰', name: 'Đồ ngọt', emojis: ['🍦', '🍩', '🍭', '🎂'] },
  { id: 'music', icon: '🎶', name: 'Nhạc & màu', emojis: ['🎸', '🥁', '🎨'] },
  { id: 'treasure', icon: '💰', name: 'Kho báu', emojis: ['👑', '🏆', '💎', '🎯'] },
];

export function setOf(emoji: string): StickerSet | undefined {
  return STICKER_SETS.find((s) => s.emojis.includes(emoji));
}

export interface SetProgress {
  set: StickerSet;
  have: number;
  total: number;
  complete: boolean;
}

export function setProgress(set: StickerSet, owned: ReadonlySet<string> | readonly string[]): SetProgress {
  const o = owned instanceof Set ? owned : new Set(owned);
  const have = set.emojis.filter((e) => o.has(e)).length;
  return { set, have, total: set.emojis.length, complete: have === set.emojis.length };
}

/** Chance that a new sticker comes from a set the child has already started. */
const FINISH_BIAS = 0.75;

/**
 * Call right after a star is added. Unlocks a locked sticker every STARS_PER_STICKER stars,
 * most often one that brings a started set closer to full; sometimes a surprise from a new set.
 */
export function maybeUnlockSticker(store: Store, rng: () => number = Math.random): Sticker | null {
  const total = store.totalStars();
  if (total === 0 || total % STARS_PER_STICKER !== 0) return null;
  const owned = new Set(store.stickers());
  const locked = STICKERS.filter((s) => !owned.has(s.emoji));
  if (!locked.length) return null;
  let pool = locked;
  if (rng() < FINISH_BIAS) {
    // Closest-to-full started set wins; ties share.
    const started = STICKER_SETS.map((s) => setProgress(s, owned)).filter((p) => p.have > 0 && !p.complete);
    if (started.length) {
      const fewest = Math.min(...started.map((p) => p.total - p.have));
      const near = new Set(started.filter((p) => p.total - p.have === fewest).flatMap((p) => p.set.emojis));
      pool = locked.filter((s) => near.has(s.emoji));
    }
  }
  const pick = pool[Math.floor(rng() * pool.length)] ?? locked[0]!;
  store.addSticker(pick.emoji);
  return pick;
}

/** The set a sticker has just finished, if it was the last one missing. */
export function completedSetBy(sticker: Sticker, owned: readonly string[]): StickerSet | null {
  const set = setOf(sticker.emoji);
  return set && setProgress(set, owned).complete ? set : null;
}

/** Full-screen "new sticker!" moment: big bouncing emoji, confetti, a spoken name. Closes on tap or after 3 s. */
export function showStickerReveal(sticker: Sticker, deps: AppDeps): void {
  const done = completedSetBy(sticker, deps.store.stickers());
  const card = h(
    'div',
    { class: 'sticker-reveal' },
    h('div', { class: 'sticker-reveal-title' }, '🎁 Sticker mới!'),
    h('div', { class: 'sticker-reveal-emoji anim-bounce' }, sticker.emoji),
    h('div', { class: 'sticker-reveal-name' }, sticker.name),
    done ? h('div', { class: 'sticker-reveal-set anim-bounce' }, `${done.icon} Đủ bộ ${done.name}! ${done.emojis.join('')}`) : null,
  );
  const overlay = h('div', { class: 'overlay sticker-overlay' }, card);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
  };
  overlay.addEventListener('pointerdown', close);
  document.body.append(overlay);
  deps.speech.speak(done ? `Bé được ${sticker.name}! Đủ bộ ${done.name} rồi, giỏi quá!` : `Bé được sticker mới: ${sticker.name}!`);
  void celebrate(overlay, deps.audio, () => undefined, { confetti: deps.store.settings().confetti });
  setTimeout(close, done ? 5000 : 3200);
}
