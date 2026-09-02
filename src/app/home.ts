import { h } from '../core/dom';
import { onHold } from '../core/hold';
import type { AppDeps } from './deps';
import type { Skill } from '../core/types';
import { GAMES, type GameEntry } from './registry';
import { hrefFor } from './router';
import { openParentPanel, STARS_CHANGED } from './parentPanel';
import '../styles/home.css';

const PARENT_HOLD_MS = 1500;
const SCROLL_KEY = 'be-choi:home-scroll';

/** Last scroll offset of the home list, so coming back from a game lands where the child left off. */
let savedScroll = 0;
try {
  savedScroll = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0) || 0;
} catch {
  /* private mode */
}

/** Home sections, in display order. A game belongs to the first section listing its skill. */
const SECTIONS: readonly { title: string; skills: readonly Skill[] }[] = [
  { title: '🎵 Âm nhạc', skills: ['music'] },
  { title: '🧩 Xếp hình & suy nghĩ', skills: ['puzzle', 'logic', 'matching', 'sorting', 'memory', 'counting'] },
  { title: '🎈 Chơi vui', skills: ['cause-effect', 'creative', 'care'] },
];

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

  const grid = h('main', { class: 'sections' });
  const albumTile = () => {
    const n = deps.store.stickers().length;
    const el = h(
      'button',
      {
        class: 'tile tile-album',
        'aria-label': 'Bộ sưu tập',
        onClick: () => {
          deps.audio.pop();
          location.hash = hrefFor({ name: 'album' });
        },
      },
      h('span', { class: 'tile-icon' }, '🏆'),
      h('span', { class: 'tile-title' }, 'Bộ sưu tập'),
      h('span', { class: 'tile-stars' }, n ? `🎁×${n}` : `⭐ ${deps.store.totalStars()}`),
    );
    return el;
  };
  const render = () => {
    const placed = new Set<string>();
    const blocks: Array<HTMLElement | null> = [
      h('section', { class: 'section section-album' }, h('div', { class: 'grid' }, albumTile())),
    ];
    blocks.push(...SECTIONS.map((section) => {
      const games = GAMES.filter((g) => !placed.has(g.id) && section.skills.includes(g.skill));
      games.forEach((g) => placed.add(g.id));
      if (games.length === 0) return null;
      return h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, section.title),
        h('div', { class: 'grid' }, ...games.map((g) => tile(g, deps))),
      );
    }));
    const rest = GAMES.filter((g) => !placed.has(g.id));
    if (rest.length) blocks.push(h('section', { class: 'section' }, h('div', { class: 'grid' }, ...rest.map((g) => tile(g, deps)))));
    grid.replaceChildren(...blocks.filter((b): b is HTMLElement => b !== null));
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
  grid.scrollTop = savedScroll;
  const remember = () => {
    savedScroll = grid.scrollTop;
    try {
      sessionStorage.setItem(SCROLL_KEY, String(savedScroll));
    } catch {
      /* ignore */
    }
  };
  grid.addEventListener('scroll', remember, { passive: true });

  return () => {
    remember();
    grid.removeEventListener('scroll', remember);
    disposeHold();
    window.removeEventListener(STARS_CHANGED, render);
    root.replaceChildren();
  };
}
