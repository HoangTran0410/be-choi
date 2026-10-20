import { h } from '../../core/dom';
import { ENTRIES, entriesOf, GROUPS } from './catalog';
import { BAND_NEEDS, bandOpen, hasStamp, roomLayout, stampsLeft } from './logic';
import { button, dragScroll, tile, timers, watchSize, wiggle, type Deps, type View } from './ui';

/**
 * The main room: four glass cabinets, one per family of instruments, each with its
 * instruments on the shelf. Touch one to go to its table. By the door: the
 * orchestra room (locked until five stamps) and the stamp album.
 */
export function mountRoom(host: HTMLElement, { ctx, album, go }: Deps): View {
  const t = timers();
  const room = h('div', { class: 'mu-room' });
  const tiles: HTMLElement[] = [];
  const cabinets: HTMLElement[] = [];

  for (const g of GROUPS) {
    const shelf = h('div', { class: 'mu-shelf' });
    for (const en of entriesOf(g.id)) {
      const el = tile(en, hasStamp(album, en.id), () => go.table(en.id));
      tiles.push(el);
      shelf.append(el);
    }
    cabinets.push(
      h(
        'section',
        { class: 'mu-cab', 'data-g': g.id, style: `--cab:${g.color}`, 'aria-label': g.name },
        h('span', { class: 'mu-cab-label', 'aria-hidden': 'true' }, g.emoji),
        shelf,
      ),
    );
  }

  // by the door
  const open = bandOpen(album);
  const dots = h('span', { class: 'mu-dots', 'aria-hidden': 'true' });
  for (let i = 0; i < BAND_NEEDS; i++) dots.append(h('i', { class: i < album.stamps.length ? 'on' : '' }));
  const door = button(
    `mu-door${open ? ' open' : ' locked'}`,
    'Phòng hoà tấu của bé',
    h('span', { class: 'mu-door-ico', 'aria-hidden': 'true' }, open ? '🎼' : '🔒'),
    () => {
      if (bandOpen(album)) go.band();
      else {
        wiggle(door);
        ctx.audio.boing();
        ctx.speak(`Sưu tầm thêm ${stampsLeft(album)} tem nữa, bé sẽ mở được phòng hoà tấu nhé.`);
      }
    },
  );
  door.append(dots);
  const albumBtn = button('mu-albumbtn', 'Album tem', h('span', { class: 'mu-door-ico', 'aria-hidden': 'true' }, '📒'), () => go.album());
  albumBtn.append(h('span', { class: 'mu-count', 'aria-hidden': 'true' }, `${album.stamps.length}/${ENTRIES.length}`));
  const foyer = h('div', { class: 'mu-foyer' }, door, albumBtn);

  room.append(foyer, ...cabinets);
  dragScroll(room);
  host.append(room);

  const stop = watchSize(room, (w, hh) => {
    if (w < 10 || hh < 10) return;
    const lay = roomLayout(
      w,
      hh,
      GROUPS.map((g) => entriesOf(g.id).length),
    );
    room.style.setProperty('--tile', `${lay.tile}px`);
    room.classList.toggle('scroll', lay.scroll);
    room.classList.toggle('wide', lay.columns === 2);
  });

  // an idle nudge: a tile with no stamp yet wiggles
  ctx.hint.arm(() => {
    const fresh = tiles.filter((el) => !el.classList.contains('stamped'));
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
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
