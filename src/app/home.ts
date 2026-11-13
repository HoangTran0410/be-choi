import { h } from '../core/dom';
import { onHold } from '../core/hold';
import type { AppDeps } from './deps';
import type { Skill } from '../core/types';
import { GAMES, isLegacy, type GameEntry } from './registry';
import { hrefFor } from './router';
import { suitsAge } from './ages';
import { buzz } from './haptics';
import { tileStyle } from './tileColor';
import { dateKeyOf, pickToday } from './today';
import { openParentPanel, SETTINGS_CHANGED, STARS_CHANGED } from './parentPanel';
import { createMascot } from './mascot';
import '../styles/home.css';

const PARENT_HOLD_MS = 1500;
const SCROLL_KEY = 'be-choi:home-scroll';
const GROUP_KEY = 'be-choi:home-group';

/** Last scroll offset of the home list, so coming back from a game lands where the child left off. */
let savedScroll = 0;
/** Selected group of the top bar: 'all' or a section key. */
let savedGroup = 'all';
try {
  savedScroll = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0) || 0;
  savedGroup = sessionStorage.getItem(GROUP_KEY) ?? 'all';
} catch {
  /* private mode */
}

/** Home sections, in display order. A game belongs to the first section listing its skill. */
const SECTIONS: readonly { key: string; icon: string; title: string; skills: readonly Skill[] }[] = [
  { key: 'world', icon: '🌊', title: 'Thế giới nhỏ', skills: ['nature'] },
  { key: 'music', icon: '🎵', title: 'Âm nhạc', skills: ['music'] },
  { key: 'think', icon: '🧩', title: 'Xếp hình & suy nghĩ', skills: ['puzzle', 'logic', 'matching', 'listening', 'sorting', 'memory', 'counting'] },
  { key: 'fun', icon: '🎈', title: 'Chơi vui', skills: ['cause-effect', 'creative', 'care'] },
];

const SHORT: Record<string, string> = { all: 'Tất cả', world: 'Thế giới', music: 'Nhạc', think: 'Xếp hình', fun: 'Chơi vui' };

/**
 * Inside a section, little single games (the ones the all-in-one games grew out of) come first for
 * the youngest children, the big combo games first for older ones. Stable: registry order otherwise.
 */
export function orderForAge<T extends { id: string }>(games: readonly T[], age: number): T[] {
  const singlesFirst = age === 0 || age <= 3;
  const rank = (g: T) => (isLegacy(g.id) === singlesFirst ? 0 : 1);
  return games.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map((x) => x.g);
}

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
  const picks = pickToday(
    GAMES.filter((g) => !isLegacy(g.id)),
    {
      dateKey: key,
      recent: deps.store.recentPlays(),
      allow: (g) => suitsAge(g, deps.store.settings().age),
    },
  );
  deps.store.setTodayPicks(
    key,
    picks.map((g) => g.id),
  );
  return picks;
}

function todayTile(entry: GameEntry, deps: AppDeps): HTMLElement {
  const el = h(
    'button',
    { class: 'today-tile', style: tileStyle(entry.color), 'aria-label': entry.title, onClick: () => openGame(el, entry, deps) },
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
      style: tileStyle(entry.color),
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
  const scroller = h('div', { class: 'home-scroll' });
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
        style: tileStyle(entry.color),
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
  let render = () => {
    const group = savedGroup;
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
    const all = group === 'all';
    const resume = all ? resumeTile() : null;
    const blocks: Array<HTMLElement | null> = [
      resume ? h('section', { class: 'section section-resume' }, h('div', { class: 'grid' }, resume)) : null,
      all ? h('section', { class: 'section section-album' }, h('div', { class: 'grid' }, albumTile())) : null,
    ];
    if (all && deps.store.settings().todayPick) {
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
    if (all && favorites.length)
      blocks.push(
        h(
          'section',
          { class: 'section section-favorites' },
          heading('❤️', 'Bé thích'),
          h('div', { class: 'grid' }, ...favorites.map(tileOf)),
        ),
      );
    // Single games sit in their section like any other tile: nothing is banished to the bottom.
    blocks.push(
      ...SECTIONS.map((section) => {
        if (!all && section.key !== group) return null;
        const games = orderForAge(
          GAMES.filter((g) => suitsAge(g, age) && !placed.has(g.id) && section.skills.includes(g.skill)),
          age,
        );
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
    const rest = all ? orderForAge(GAMES.filter((g) => suitsAge(g, age) && !placed.has(g.id)), age) : [];
    if (rest.length) blocks.push(h('section', { class: 'section' }, h('div', { class: 'grid' }, ...rest.map(tileOf))));
    // The favourites row growing or shrinking above pushes everything below it: move
    // the scroll by the same amount, so the tile under the child's finger stays put.
    const anchor = grid.querySelector('.section-regular');
    const before = anchor?.getBoundingClientRect().top;
    grid.replaceChildren(...blocks.filter((b): b is HTMLElement => b !== null));
    const after = grid.querySelector('.section-regular')?.getBoundingClientRect().top;
    if (before !== undefined && after !== undefined && after !== before) scroller.scrollTop += after - before;
  };
  /** Top bar of big picture buttons: one tap filters the grid to that group. */
  const groups = [{ key: 'all', icon: '🏠', title: 'Tất cả', say: 'Tất cả trò chơi' }, ...SECTIONS.map((s) => ({ key: s.key, icon: s.icon, title: s.title, say: s.title }))];
  if (!groups.some((g) => g.key === savedGroup)) savedGroup = 'all';
  const groupBtns = groups.map((g) =>
    h(
      'button',
      {
        class: 'group-btn',
        'aria-label': g.title,
        onClick: () => {
          if (savedGroup === g.key) return;
          deps.audio.pop();
          buzz();
          deps.speech.speak(g.say);
          savedGroup = g.key;
          try {
            sessionStorage.setItem(GROUP_KEY, g.key);
          } catch {
            /* ignore */
          }
          render();
          scroller.scrollTop = 0;
        },
      },
      h('span', { class: 'group-icon', 'aria-hidden': 'true' }, g.icon),
      h('span', { class: 'group-name' }, SHORT[g.key]!),
    ),
  );
  const syncGroups = () => groupBtns.forEach((b, i) => b.classList.toggle('group-on', groups[i]!.key === savedGroup));
  const baseRender = render;
  render = () => {
    baseRender();
    syncGroups();
  };
  render();
  window.addEventListener(STARS_CHANGED, render);
  window.addEventListener(SETTINGS_CHANGED, render);

  const mascot = createMascot(
    deps,
    () => todaysGames(deps),
    (id) => {
      const title = GAMES.find((g) => g.id === id)?.title;
      const t = [...grid.querySelectorAll<HTMLElement>('.today-tile')].find((el) => el.getAttribute('aria-label') === title);
      if (!t) return;
      t.classList.remove('anim-wiggle');
      void t.offsetWidth;
      t.classList.add('anim-wiggle');
    },
  );
  // Header and group bar scroll away with the games: a fixed top bar left phones in landscape
  // only a sliver of list to scroll.
  scroller.append(
    h('header', { class: 'home-header' }, mascot.el, h('h1', null, 'Bé Chơi'), parentBtn),
    h('nav', { class: 'group-bar', 'aria-label': 'Nhóm trò chơi' }, ...groupBtns),
    grid,
  );
  const home = h('div', { class: 'home' }, scroller);
  root.replaceChildren(home);
  scroller.scrollTop = savedScroll;
  const remember = () => {
    savedScroll = scroller.scrollTop;
    try {
      sessionStorage.setItem(SCROLL_KEY, String(savedScroll));
    } catch {
      /* ignore */
    }
  };
  scroller.addEventListener('scroll', remember, { passive: true });

  return () => {
    remember();
    scroller.removeEventListener('scroll', remember);
    disposeHold();
    mascot.dispose();
    window.removeEventListener(STARS_CHANGED, render);
    window.removeEventListener(SETTINGS_CHANGED, render);
    root.replaceChildren();
  };
}
