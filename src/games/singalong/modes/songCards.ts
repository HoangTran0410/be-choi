import { h } from '../../../core/dom';
import type { Song } from '../../../core/music';
import { makeTappable } from '../../../core/tap';
import { REPERTOIRE, songUnlockAt } from '../catalog';
import type { Env } from './types';

/**
 * The shelf of songs. A song not yet won is dimmed with its ticket price; touching
 * it only says how many tickets are missing — no buzzer, nothing lost.
 */
export function fillSongCards<S extends Song>(env: Env, grid: HTMLElement, songs: readonly S[], onPick: (song: S) => void): void {
  grid.replaceChildren();
  const tickets = env.progress.get().tickets;
  for (const song of songs) {
    const need = songUnlockAt(REPERTOIRE.indexOf(song));
    const locked = need > tickets;
    const card = h(
      'button',
      { class: `sa-song${locked ? ' sa-locked' : ''}`, type: 'button', 'data-song': song.id, 'aria-label': song.title },
      h('span', { class: 'sa-song-icon' }, song.icon),
      h('span', { class: 'sa-song-title' }, song.title),
      locked ? h('span', { class: 'sa-song-lock' }, `🔒 🎟️${need}`) : null,
    );
    // No `ctx`: the card is replaced often, and its listener dies with it.
    makeTappable(card, () => {
      env.touch();
      if (locked) {
        env.ctx.audio.boing();
        env.say(`Hát thêm vài bài nữa là mở bài này nhé. Còn ${need - env.progress.get().tickets} vé.`, { speak: true });
        return;
      }
      env.ctx.audio.pop();
      onPick(song);
    });
    grid.append(card);
  }
}
