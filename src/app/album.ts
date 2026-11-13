import { h, replay } from '../core/dom';
import type { AppDeps } from './deps';
import { setProgress, starsToNext, STICKER_SETS, stickerFor, type SetProgress } from './rewards';
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

  const ownedSet = new Set(owned);
  const tile = (emoji: string, have: boolean) => {
    const sticker = stickerFor(emoji);
    const el = h(
      'button',
      { class: `album-sticker${have ? '' : ' album-silhouette'}`, 'aria-label': have ? (sticker?.name ?? emoji) : 'Sticker chưa có' },
      // Only the picture goes dark: the tile stays a tile, so a missing sticker reads as "a shape to find".
      have ? emoji : h('span', { class: 'album-shape' }, emoji),
    );
    el.addEventListener('pointerdown', () => {
      replay(el, have ? 'anim-bounce' : 'anim-shake');
      if (have) {
        audio.pop();
        if (sticker) speech.speak(sticker.name);
      } else {
        audio.tick();
      }
    });
    return el;
  };

  // Started-but-unfinished sets first (closest to full on top), then untouched ones, then finished.
  const rank = (p: SetProgress) => (p.complete ? 2 : p.have > 0 ? 0 : 1);
  const progs = STICKER_SETS.map((set) => setProgress(set, ownedSet)).sort(
    (x, y) => rank(x) - rank(y) || (x.total - x.have) - (y.total - y.have),
  );
  const sets = progs.map((p) => {
    const missing = p.total - p.have;
    const near = !p.complete && p.have > 0 && missing <= 2;
    return h(
      'section',
      { class: `album-set${p.complete ? ' complete' : ''}${near ? ' near' : ''}`, 'data-set': p.set.id },
      h(
        'header',
        { class: 'album-set-head' },
        h('span', { class: 'album-set-icon' }, p.set.icon),
        h('span', { class: 'album-set-name' }, p.set.name),
        h(
          'span',
          { class: 'album-dots', 'aria-label': `${p.have} trên ${p.total}` },
          ...p.set.emojis.map((e) => h('i', { class: ownedSet.has(e) ? 'on' : '' })),
        ),
        p.complete ? h('span', { class: 'album-set-badge' }, '🏅') : near ? h('span', { class: 'album-set-badge' }, '🎁 sắp đủ!') : null,
      ),
      h('div', { class: 'album-grid' }, ...p.set.emojis.map((e) => tile(e, ownedSet.has(e)))),
    );
  });
  const known = new Set(STICKER_SETS.flatMap((s) => s.emojis));
  const strays = owned.filter((e) => !known.has(e));
  const grid = h('div', { class: 'album-sets' }, ...sets, strays.length ? h('div', { class: 'album-grid' }, ...strays.map((e) => tile(e, true))) : null);

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
    owned.length ? null : h('p', { class: 'album-empty' }, 'Chơi và nhận ⭐ để mở sticker nhé!'),
    grid,
  );
  root.replaceChildren(page);
  speech.speak(owned.length ? `Bé có ${owned.length} sticker rồi!` : 'Chơi để nhận sticker nhé!');
  return () => root.replaceChildren();
}
