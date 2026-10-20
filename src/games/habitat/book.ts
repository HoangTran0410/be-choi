/**
 * The collection book: every animal there is, in colour once the child has met
 * it and as a dark shape until then. Opened from the toolbar it also chooses who
 * to let into the world (only this world's animals are shown then).
 */
import { h, replay } from '../../core/dom';
import type { AudioEngine } from '../../core/audio';
import { BOOK, inRealm, type Kind } from './catalog';
import { openPanel, onTile, type Panel } from './panel';
import { portrait } from './portrait';
import type { HabitatSave } from './save';
import { WORLDS, type Realm } from './worlds';

export interface BookDeps {
  host: HTMLElement;
  save: HabitatSave;
  audio: AudioEngine;
  speak(text: string, opts?: { rate?: number }): void;
}

export interface BookOptions {
  /** Show only these homes. Default: all of them. */
  realms?: readonly Realm[];
  /** Choosing mode: a tap on a friend lets it in and closes the book. */
  onPick?: (kind: Kind) => void;
}

export function owned(save: HabitatSave): number {
  return BOOK.filter((k) => save.owned.includes(k.key)).length;
}

export function openBook(deps: BookDeps, opts: BookOptions = {}): Panel {
  const { save, audio, speak } = deps;
  const opened = Date.now();
  const realms = opts.realms ?? (['fresh', 'sea', 'forest'] as const);
  let panel: Panel | null = null;

  const body = h('div', { class: 'hb-book' });
  for (const realm of realms) {
    const world = WORLDS.find((w) => w.id === realm)!;
    const kinds = inRealm(realm);
    const have = kinds.filter((k) => save.owned.includes(k.key)).length;
    const head = h(
      'div',
      { class: 'hb-book-head', 'aria-label': `${world.name}: ${have} trên ${kinds.length}` },
      h('span', { class: 'hb-book-icon' }, world.icon),
      h(
        'span',
        { class: 'hb-pips', 'aria-hidden': 'true' },
        ...kinds.map((k) => h('i', { class: save.owned.includes(k.key) ? 'on' : '' })),
      ),
    );
    const grid = h('div', { class: 'hb-book-grid' });
    for (const kind of kinds) {
      const mine = save.owned.includes(kind.key);
      const tile = h(
        'button',
        { class: `hb-tile${mine ? '' : ' hb-locked'}`, type: 'button', 'aria-label': mine ? kind.name : 'Chưa gặp', 'data-key': kind.key },
        portrait(kind.key),
        mine ? null : h('span', { class: 'hb-q', 'aria-hidden': 'true' }, '?'),
      );
      onTile(tile, opened, () => {
        if (!mine) {
          audio.boing();
          replay(tile, 'anim-wiggle');
          speak('Bạn này chưa đến. Mình cùng đi tìm nhé!');
          return;
        }
        audio.pop(1.2);
        replay(tile, 'anim-pop');
        speak(kind.name);
        if (opts.onPick) {
          panel?.close();
          opts.onPick(kind);
        }
      });
      grid.append(tile);
    }
    body.append(h('section', { class: 'hb-book-sec' }, head, grid));
  }
  panel = openPanel(deps.host, 'hb-book-overlay', body);
  audio.tick();
  return panel;
}
