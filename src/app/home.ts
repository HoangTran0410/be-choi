import { h } from '../core/dom';
import { onHold } from '../core/hold';
import type { AppDeps } from './deps';
import type { Skill } from '../core/types';
import { GAMES, type GameEntry } from './registry';
import { hrefFor } from './router';
import { suitsAge } from './ages';
import { buzz } from './haptics';
import { dateKeyOf, pickToday } from './today';
import { openParentPanel, SETTINGS_CHANGED, STARS_CHANGED } from './parentPanel';
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
const SECTIONS: readonly { icon: string; title: string; skills: readonly Skill[] }[] = [
  { icon: '🌊', title: 'Thế giới nhỏ', skills: ['nature'] },
  { icon: '🎵', title: 'Âm nhạc', skills: ['music'] },
  { icon: '🧩', title: 'Xếp hình & suy nghĩ', skills: ['puzzle', 'logic', 'matching', 'listening', 'sorting', 'memory', 'counting'] },
  { icon: '🎈', title: 'Chơi vui', skills: ['cause-effect', 'creative', 'care'] },
];

/**
 * A section heading a child can read without letters: a big picture first, the
 * words (for the grown-up) small beside it.
 */
function heading(icon: string, title: string, extra = ''): HTMLElement {
  return h(
    'h2',
    { class: `section-title${extra}` },
    h('span', { class: 'section-icon', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'section-name' }, title),
  );
}

function starsText(n: number): string {
  if (n === 0) return '';
  if (n <= 5) return '⭐'.repeat(n);
  return `⭐×${n}`;
}

function openGame(el: HTMLElement, entry: GameEntry, deps: AppDeps): void {
  deps.audio.pop();
  buzz();
  deps.speech.speak(entry.title);
  el.classList.add('anim-bounce');
  setTimeout(() => {
    location.hash = hrefFor({ name: 'game', id: entry.id });
  }, 150);
}

/**
 * Today's three suggestions, fixed for the day: picked once, then remembered, so they do not
 * shuffle under the child as plays pile up.
 */
export function todaysGames(deps: AppDeps, now: Date = new Date()): GameEntry[] {
  const key = dateKeyOf(now);
  const saved = deps.store.todayPicks();
  if (saved && saved.key === key) {
    const games = saved.ids.map((id) => GAMES.find((g) => g.id === id));
    if (games.length > 0 && games.every((g): g is GameEntry => g !== undefined)) return games;
  }
  const picks = pickToday(GAMES, {
    dateKey: key,
    recent: deps.store.recentPlays(),
    allow: (g) => suitsAge(g, deps.store.settings().age),
  });
  deps.store.setTodayPicks(
    key,
    picks.map((g) => g.id),
  );
  return picks;
}

function todayTile(entry: GameEntry, deps: AppDeps): HTMLElement {
  const el = h(
    'button',
    { class: 'today-tile', style: `background:${entry.color}`, 'aria-label': entry.title, onClick: () => openGame(el, entry, deps) },
    entry.icon,
  );
  return el;
}

function tile(entry: GameEntry, deps: AppDeps, onFavorite: () => void): HTMLElement {
  const stars = h('span', { class: 'tile-stars' }, starsText(deps.store.stars(entry.id)));
  const liked = deps.store.favorites().includes(entry.id);
  // A heart rather than a star: stars on a tile already count what the child has earned.
  // A span, not a button, because the tile itself is one.
  const heart = h(
    'span',
    {
      class: `tile-heart${liked ? ' tile-heart-on' : ''}`,
      role: 'button',
      'aria-label': liked ? `Bỏ thích ${entry.title}` : `Thích ${entry.title}`,
      'aria-pressed': String(liked),
    },
    liked ? '❤️' : '🤍',
  );
  heart.addEventListener('click', (e) => {
    // The heart is inside the tile: without this the game would open too.
    e.stopPropagation();
    const on = deps.store.toggleFavorite(entry.id);
    deps.audio.pop(on ? 1.4 : 0.8);
    onFavorite();
  });
  const el = h(
    'button',
    {
      class: 'tile',
      style: `background:${entry.color}`,
      'aria-label': entry.title,
      onClick: () => openGame(el, entry, deps),
    },
    h('span', { class: 'tile-icon' }, entry.icon),
    h('span', { class: 'tile-title' }, entry.title),
    stars,
    heart,
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
  /** Big "carry on" tile: the game opened last, one tap away from the top of the screen. */
  const resumeTile = (): HTMLElement | null => {
    const id = deps.store.lastPlayed();
    const entry = id ? GAMES.find((g) => g.id === id) : undefined;
    if (!entry) return null;
    return h(
      'button',
      {
        class: 'tile tile-resume',
        style: `background:${entry.color}`,
        'aria-label': `Chơi tiếp ${entry.title}`,
        onClick: () => {
          deps.audio.pop();
          buzz();
          deps.speech.speak(entry.title);
          location.hash = hrefFor({ name: 'game', id: entry.id });
        },
      },
      h('span', { class: 'tile-icon' }, entry.icon),
      h('span', { class: 'resume-text' }, h('span', { class: 'resume-play' }, '▶️'), h('span', { class: 'tile-title' }, entry.title)),
    );
  };
  const render = () => {
    const tileOf = (g: GameEntry) => tile(g, deps, render);
    // Favourites come first, in the order they were picked — and stay in their usual
    // section too. Taking a game out of its place would shuffle every tile after it,
    // and the one the child was looking at would jump away: to a two-year-old the
    // game has simply vanished.
    const favorites = deps.store
      .favorites()
      .map((id) => GAMES.find((g) => g.id === id))
      .filter((g): g is GameEntry => g !== undefined);
    const placed = new Set<string>();
    const age = deps.store.settings().age;
    const resume = resumeTile();
    const blocks: Array<HTMLElement | null> = [
      resume ? h('section', { class: 'section section-resume' }, h('div', { class: 'grid' }, resume)) : null,
      h('section', { class: 'section section-album' }, h('div', { class: 'grid' }, albumTile())),
    ];
    if (deps.store.settings().todayPick) {
      const today = todaysGames(deps);
      if (today.length)
        blocks.push(
          h(
            'section',
            { class: 'section section-today', 'aria-label': 'Hôm nay chơi gì' },
            h('span', { class: 'today-badge', 'aria-hidden': 'true' }, '✨'),
            ...today.map((g) => todayTile(g, deps)),
          ),
        );
    }
    if (favorites.length)
      blocks.push(
        h(
          'section',
          { class: 'section section-favorites' },
          heading('❤️', 'Bé thích'),
          h('div', { class: 'grid' }, ...favorites.map(tileOf)),
        ),
      );
    blocks.push(
      ...SECTIONS.map((section) => {
        const games = GAMES.filter((g) => suitsAge(g, age) && !placed.has(g.id) && section.skills.includes(g.skill));
        games.forEach((g) => placed.add(g.id));
        if (games.length === 0) return null;
        return h(
          'section',
          { class: 'section section-regular' },
          heading(section.icon, section.title),
          h('div', { class: 'grid' }, ...games.map(tileOf)),
        );
      }),
    );
    const rest = GAMES.filter((g) => suitsAge(g, age) && !placed.has(g.id));
    if (rest.length) blocks.push(h('section', { class: 'section' }, h('div', { class: 'grid' }, ...rest.map(tileOf))));
    // The favourites row growing or shrinking above pushes everything below it: move
    // the scroll by the same amount, so the tile under the child's finger stays put.
    const anchor = grid.querySelector('.section-regular');
    const before = anchor?.getBoundingClientRect().top;
    grid.replaceChildren(...blocks.filter((b): b is HTMLElement => b !== null));
    const after = grid.querySelector('.section-regular')?.getBoundingClientRect().top;
    if (before !== undefined && after !== undefined && after !== before) grid.scrollTop += after - before;
  };
  render();
  window.addEventListener(STARS_CHANGED, render);
  window.addEventListener(SETTINGS_CHANGED, render);

  const home = h(
    'div',
    { class: 'home' },
    h('header', { class: 'home-header' }, h('span', { class: 'mascot' }, '🐣'), h('h1', null, 'Bé Chơi'), parentBtn),
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
    window.removeEventListener(SETTINGS_CHANGED, render);
    root.replaceChildren();
  };
}
