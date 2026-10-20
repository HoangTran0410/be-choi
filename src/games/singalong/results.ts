import { h } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import type { Gift } from './catalog';
import type { ShowResult } from './show';

export interface ResultsInfo extends ShowResult {
  gifts: readonly Gift[];
  total: number;
}

/**
 * The curtain call after a show: stars lighting up one by one, the tickets earned
 * and anything that just opened. One big button carries on. Returns a function that
 * closes it early (leaving the game, or switching mode).
 */
export function showResults(
  ctx: Pick<GameContext, 'onCleanup' | 'audio'>,
  parent: HTMLElement,
  info: ResultsInfo,
  onDone: () => void,
): () => void {
  const stars = h(
    'div',
    { class: 'sa-res-stars' },
    ...[1, 2, 3].map((n) => h('span', { class: `sa-res-star${n <= info.stars ? ' sa-res-lit' : ''}`, style: `--i:${n}` }, '⭐')),
  );
  const gifts = info.gifts.length
    ? h(
        'div',
        { class: 'sa-res-gifts' },
        ...info.gifts.map((g) =>
          h('div', { class: 'sa-res-gift' }, h('span', { class: 'sa-res-gift-e' }, g.emoji), h('span', { class: 'sa-res-gift-n' }, g.name)),
        ),
      )
    : null;
  const go = h('button', { class: 'sa-res-go btn-round', type: 'button', 'aria-label': 'Hát tiếp' }, '▶️');
  const card = h(
    'div',
    { class: 'sa-res', role: 'dialog', 'aria-label': 'Hay quá!' },
    h(
      'div',
      { class: 'sa-res-card' },
      h('div', { class: 'sa-res-main' }, stars, h('div', { class: 'sa-res-tickets' }, `+${info.tickets} 🎟️`)),
      gifts,
      go,
    ),
  );
  parent.append(card);
  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    card.remove();
  };
  makeTappable(
    go,
    () => {
      ctx.audio.tick();
      close();
      onDone();
    },
    { ctx },
  );
  ctx.onCleanup(close);
  return close;
}
