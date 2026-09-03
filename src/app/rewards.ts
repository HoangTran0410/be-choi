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

/** Call right after a star is added. Unlocks a random locked sticker every STARS_PER_STICKER stars. */
export function maybeUnlockSticker(store: Store, rng: () => number = Math.random): Sticker | null {
  const total = store.totalStars();
  if (total === 0 || total % STARS_PER_STICKER !== 0) return null;
  const owned = new Set(store.stickers());
  const locked = STICKERS.filter((s) => !owned.has(s.emoji));
  const pick = locked[Math.floor(rng() * locked.length)];
  if (!pick) return null;
  store.addSticker(pick.emoji);
  return pick;
}

/** Full-screen "new sticker!" moment: big bouncing emoji, confetti, a spoken name. Closes on tap or after 3 s. */
export function showStickerReveal(sticker: Sticker, deps: AppDeps): void {
  const card = h(
    'div',
    { class: 'sticker-reveal' },
    h('div', { class: 'sticker-reveal-title' }, '🎁 Sticker mới!'),
    h('div', { class: 'sticker-reveal-emoji anim-bounce' }, sticker.emoji),
    h('div', { class: 'sticker-reveal-name' }, sticker.name),
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
  deps.speech.speak(`Bé được sticker mới: ${sticker.name}!`);
  void celebrate(overlay, deps.audio, () => undefined);
  setTimeout(close, 3200);
}
