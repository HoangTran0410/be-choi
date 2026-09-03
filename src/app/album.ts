import { h, replay } from '../core/dom';
import type { AppDeps } from './deps';
import { starsToNext, STICKERS, stickerFor } from './rewards';
import { hrefFor } from './router';
import '../styles/album.css';

/** "Bộ sưu tập": every sticker the child has earned, big and tappable, plus progress to the next one. */
export function mountAlbum(root: HTMLElement, deps: AppDeps): () => void {
  const { store, speech, audio } = deps;
  const owned = store.stickers();
  const total = store.totalStars();
  const need = starsToNext(total);

  const homeBtn = h(
    'button',
    {
      class: 'btn-round home',
      'aria-label': 'Về trang chính',
      onClick: () => {
        audio.tick();
        location.hash = hrefFor({ name: 'home' });
      },
    },
    '🏠',
  );

  const progress = h(
    'div',
    { class: 'album-progress' },
    h('span', null, `⭐ ${total}`),
    h('span', { class: 'album-next' }, `${'⭐'.repeat(3 - need)}${'☆'.repeat(need)} → 🎁`),
  );

  const grid = h('div', { class: 'album-grid' });
  for (const emoji of owned) {
    const sticker = stickerFor(emoji);
    const tile = h('button', { class: 'album-sticker', 'aria-label': sticker?.name ?? emoji }, emoji);
    tile.addEventListener('pointerdown', () => {
      replay(tile, 'anim-bounce');
      audio.pop();
      if (sticker) speech.speak(sticker.name);
    });
    grid.append(tile);
  }
  const lockedCount = STICKERS.length - owned.length;
  for (let i = 0; i < Math.min(lockedCount, 6); i++) grid.append(h('div', { class: 'album-sticker album-locked' }, '❔'));

  /**
   * What the stickers are for. They have always been usable — Tô màu turns them
   * into stamps — but nothing anywhere said so, so a full album looked like a
   * shelf of trophies with nothing to do.
   */
  const toPaint = h(
    'button',
    {
      class: 'album-use',
      onClick: () => {
        audio.tick();
        location.hash = hrefFor({ name: 'game', id: 'paint' });
      },
    },
    h('span', null, 'Sticker của bé dùng làm hình dán trong'),
    h('strong', null, ' 🖍️ Tô màu'),
  );

  const page = h(
    'div',
    { class: 'album' },
    h('header', { class: 'topbar' }, homeBtn, h('span', { class: 'topbar-title' }, '🏆 Bộ sưu tập'), h('span', { class: 'topbar-spacer' })),
    progress,
    owned.length ? toPaint : null,
    owned.length ? grid : h('p', { class: 'album-empty' }, 'Chơi và nhận ⭐ để mở sticker nhé!'),
  );
  root.replaceChildren(page);
  speech.speak(owned.length ? `Bé có ${owned.length} sticker rồi!` : 'Chơi để nhận sticker nhé!');
  return () => root.replaceChildren();
}
