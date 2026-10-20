import { h } from '../../core/dom';
import { sayLines } from '../../core/say';
import { ENTRIES, entriesOf, GROUPS } from './catalog';
import { BAND_NEEDS, bandOpen, hasStamp, shelfLayout, stampsLeft } from './logic';
import { button, dragScroll, tile, timers, watchSize, wiggle, type Deps, type View } from './ui';

/**
 * The main room. At the door only four big cabinet doors (one per family of instruments), the
 * stamp album and the orchestra room's door in the corners. Touch a cabinet to step in and see its
 * instruments; touch one to go to its table.
 */
export function mountRoom(host: HTMLElement, deps: Deps): View {
  const { ctx, album, go, nav } = deps;
  const t = timers();
  const group = GROUPS.find((g) => g.id === nav.group) ?? null;
  if (!group) nav.group = null;
  const room = h('div', { class: `mu-room ${group ? 'inside' : 'lobby'}` });
  const tiles: HTMLElement[] = [];
  let stop: () => void = () => {};

  if (group) {
    const entries = entriesOf(group.id);
    const shelf = h('div', { class: 'mu-shelf' });
    for (const en of entries) {
      const el = tile(en, hasStamp(album, en.id), () => go.table(en.id));
      tiles.push(el);
      shelf.append(el);
    }
    const back = button('mu-back', 'Về sảnh', '←', () => {
      nav.group = null;
      go.room();
    });
    const head = h('div', { class: 'mu-cab-head' }, back, h('span', { class: 'mu-cab-label', 'aria-hidden': 'true' }, group.emoji));
    const cab = h('section', { class: 'mu-cab', 'data-g': group.id, style: `--cab:${group.color}`, 'aria-label': group.name }, shelf);
    room.append(head, cab);
    stop = watchSize(cab, (w, hh) => {
      if (w < 10 || hh < 10) return;
      const lay = shelfLayout(w - 20, hh - 28, entries.length);
      room.style.setProperty('--tile', `${lay.tile}px`);
      room.classList.toggle('scroll', lay.scroll);
    });
  } else {
    const doors = h('div', { class: 'mu-doors' });
    for (const g of GROUPS) {
      const door = button('mu-roomdoor', g.name, h('span', { class: 'mu-roomdoor-ico', 'aria-hidden': 'true' }, g.emoji), () => {
        nav.group = g.id;
        go.room();
      });
      door.dataset.g = g.id;
      door.style.setProperty('--cab', g.color);
      doors.append(door);
    }

    // by the door: small, in the corners
    const open = bandOpen(album);
    const dots = h('span', { class: 'mu-dots', 'aria-hidden': 'true' });
    for (let i = 0; i < BAND_NEEDS; i++) dots.append(h('i', { class: i < album.stamps.length ? 'on' : '' }));
    const band = button(
      `mu-door${open ? ' open' : ' locked'}`,
      'Phòng hoà tấu của bé',
      h('span', { class: 'mu-door-ico', 'aria-hidden': 'true' }, open ? '🎼' : '🔒'),
      () => {
        if (bandOpen(album)) go.band();
        else {
          wiggle(band);
          ctx.audio.boing();
          void sayLines(ctx, [`Sưu tầm thêm ${stampsLeft(album)} tem nữa`, 'bé sẽ mở được phòng hoà tấu nhé']);
        }
      },
    );
    band.append(dots);
    const albumBtn = button('mu-albumbtn', 'Album tem', h('span', { class: 'mu-door-ico', 'aria-hidden': 'true' }, '📒'), () => go.album());
    albumBtn.append(h('span', { class: 'mu-count', 'aria-hidden': 'true' }, `${album.stamps.length}/${ENTRIES.length}`));
    room.append(doors, h('div', { class: 'mu-foyer' }, albumBtn, band));
  }

  host.append(room);
  if (group) dragScroll(room);

  // an idle nudge: a cabinet door in the lobby, inside a tile with no stamp yet, wiggles
  ctx.hint.arm(() => {
    const pool = group ? tiles.filter((el) => !el.classList.contains('stamped')) : [...room.querySelectorAll<HTMLElement>('.mu-roomdoor')];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) wiggle(pick);
  }, 9000);

  return {
    destroy() {
      ctx.hint.clear();
      stop();
      t.clear();
      room.remove();
    },
  };
}
