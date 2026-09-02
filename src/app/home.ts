import { h } from '../core/dom';
import { onHold } from '../core/hold';
import type { AppDeps } from './deps';
import { GAMES, type GameEntry } from './registry';
import { hrefFor } from './router';
import { openParentPanel, STARS_CHANGED } from './parentPanel';
import '../styles/home.css';

const PARENT_HOLD_MS = 1500;

function starsText(n: number): string {
  if (n === 0) return '';
  if (n <= 5) return '⭐'.repeat(n);
  return `⭐×${n}`;
}

function tile(entry: GameEntry, deps: AppDeps): HTMLElement {
  const stars = h('span', { class: 'tile-stars' }, starsText(deps.store.stars(entry.id)));
  const el = h(
    'button',
    {
      class: 'tile',
      style: `background:${entry.color}`,
      'aria-label': entry.title,
      onClick: () => {
        deps.audio.pop();
        deps.speech.speak(entry.title);
        el.classList.add('anim-bounce');
        setTimeout(() => {
          location.hash = hrefFor({ name: 'game', id: entry.id });
        }, 150);
      },
    },
    h('span', { class: 'tile-icon' }, entry.icon),
    h('span', { class: 'tile-title' }, entry.title),
    stars,
  );
  return el;
}

/** Home screen: a grid of big game tiles. Returns an unmount function. */
export function mountHome(root: HTMLElement, deps: AppDeps): () => void {
  const parentBtn = h('button', { class: 'btn-round parent', 'aria-label': 'Phụ huynh (giữ)' }, '👪');
  const disposeHold = onHold(parentBtn, PARENT_HOLD_MS, () => {
    deps.audio.tick();
    openParentPanel(deps);
  });

  const grid = h('main', { class: 'grid' });
  const render = () => {
    grid.replaceChildren(...GAMES.map((g) => tile(g, deps)));
  };
  render();
  window.addEventListener(STARS_CHANGED, render);

  const home = h(
    'div',
    { class: 'home' },
    h(
      'header',
      { class: 'home-header' },
      h('span', { class: 'mascot' }, '🐣'),
      h('h1', null, 'Bé Chơi'),
      parentBtn,
    ),
    grid,
  );
  root.replaceChildren(home);

  return () => {
    disposeHold();
    window.removeEventListener(STARS_CHANGED, render);
    root.replaceChildren();
  };
}
