import { h } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { mountAlbum } from './album';
import { mountBand } from './band';
import { loadAlbum, saveAlbum } from './logic';
import { meta } from './meta';
import { mountRoom } from './room';
import { mountTable } from './table';
import type { Deps, View } from './ui';
import './style.css';

/**
 * Bảo tàng nhạc cụ: a room of glass cabinets, each instrument a playable table of
 * its own (see ./instruments), a stamp album, and an orchestra room for layering
 * the instruments that have been collected. This file only moves between screens.
 */
function start(ctx: GameContext): void {
  const album = loadAlbum();
  const root = h('div', { class: 'mu' });
  ctx.stage.append(root);
  let view: View | null = null;

  const deps: Deps = {
    ctx,
    album,
    save: () => void saveAlbum(album),
    go: {
      room: () => show((host) => mountRoom(host, deps)),
      table: (id) => show((host) => mountTable(host, id, deps)),
      album: () => show((host) => mountAlbum(host, deps)),
      band: () => show((host) => mountBand(host, deps)),
    },
  };

  function show(make: (host: HTMLElement) => View): void {
    view?.destroy();
    view = null;
    root.replaceChildren();
    view = make(root);
  }

  deps.go.room();
  ctx.onCleanup(() => {
    view?.destroy();
    view = null;
    root.remove();
  });
}

const game: GameModule = { ...meta, start };
export default game;
