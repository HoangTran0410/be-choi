import { h } from '../../core/dom';
import { bandVoices, ENTRIES } from './catalog';
import { sound } from './instruments/voices';
import { hasStamp } from './logic';
import { button, dragScroll, tile, type Deps, type View } from './ui';

/**
 * The stamp album: one slot per instrument, coloured when the stamp is earned and a
 * grey ghost when not. Touch a stamp to hear the instrument and go and play it.
 */
export function mountAlbum(host: HTMLElement, { ctx, album, go }: Deps): View {
  const back = button('mu-back', 'Về phòng bảo tàng', '←', () => go.room());
  const total = ENTRIES.length;
  const bar = h(
    'div',
    { class: 'mu-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': album.stamps.length },
    h('i', { style: `width:${(album.stamps.length / total) * 100}%` }),
  );
  const grid = h('div', { class: 'mu-album-grid' });
  for (const en of ENTRIES) {
    const has = hasStamp(album, en.id);
    grid.append(
      tile(
        en,
        has,
        () => {
          const v = bandVoices(en.kind)[2];
          if (v) sound(ctx.audio, v, 0.8);
          go.table(en.id);
        },
        has ? 'got' : 'ghost',
      ),
    );
  }
  dragScroll(grid);
  const root = h(
    'div',
    { class: 'mu-album' },
    h('div', { class: 'mu-album-bar' }, back, bar, h('span', { class: 'mu-album-ico', 'aria-hidden': 'true' }, '📒')),
    grid,
  );
  host.append(root);
  return {
    destroy() {
      root.remove();
    },
  };
}
