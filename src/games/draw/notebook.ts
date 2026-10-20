/**
 * "Quyển vở của bé": every finished picture as a page. The child flips through them,
 * watches an "exhibition" (each picture in turn, with applause), and can pin one as the
 * workshop's wallpaper. Deleting a page asks a grown-up: it needs a long press, and
 * a touch that ends early only brings the page back.
 */
import { h } from '../../core/dom';
import { onHold } from '../../core/hold';
import type { GameContext } from '../../core/types';
import type { Artwork, Gallery } from './gallery';
import { modeInfo, slow } from './progress';
import { createScope, makeButton, onTapRelease, type Scope } from './ui';

export interface BookEnv {
  ctx: GameContext;
  gallery: Gallery;
  root: HTMLElement;
  say(text: string): void;
}

/** How long each picture stays in the exhibition. */
export const EXPO_MS = 3200;
/** How long the delete button has to be held. */
export const DELETE_HOLD_MS = 1500;
/** A swipe shorter than this is a tap. */
const SWIPE = 48;

/** Newest first: the page the child just finished is the first one they see. */
export function pagesOf(gallery: Gallery): Artwork[] {
  return [...gallery.list()].reverse();
}

export function openNotebook(env: BookEnv, onClose: () => void, startAt?: string): () => void {
  const { ctx, gallery } = env;
  const scope = createScope();
  let closed = false;
  let sub: Scope | null = null;

  const view = h('div', { class: 'dr-book-view' });
  const book = h('div', { class: 'dr-book' }, view);
  env.root.append(book);

  function close(): void {
    if (closed) return;
    closed = true;
    sub?.dispose();
    scope.dispose();
    book.remove();
    onClose();
  }

  /** Each screen of the book has its own scope, undone when it is replaced. */
  function screen(build: (s: Scope) => HTMLElement[]): void {
    sub?.dispose();
    sub = createScope();
    view.replaceChildren(...build(sub));
  }

  const closeBtn = (s: Scope, label: string, fn: () => void, content = '✕'): HTMLElement => makeButton(s, { label, content, cls: 'dr-book-close', onTap: fn });

  /* -------------------------------------------------------------- the shelf */

  function showShelf(): void {
    const pages = pagesOf(gallery);
    screen((s) => {
      const items: HTMLElement[] = [];
      if (pages.length === 0) {
        items.push(h('div', { class: 'dr-book-empty', 'aria-hidden': 'true' }, h('span', {}, '📒'), h('span', { class: 'dr-book-empty-pen' }, '🖍️')));
        env.say('Quyển vở còn trống. Mình vẽ nhé!');
      } else {
        const grid = h('div', { class: 'dr-shelf' });
        const wall = gallery.wallpaper()?.id;
        pages.forEach((art, i) => {
          const t = h(
            'button',
            { class: 'dr-thumb', type: 'button', 'aria-label': art.title || 'tranh của bé', style: `background-image:url("${art.thumb}")` },
            h('span', { class: 'dr-badge', 'aria-hidden': 'true' }, wall === art.id ? '📌' : modeInfo(art.mode).icon),
          );
          onTapRelease(t, () => showPage(i));
          grid.append(t);
        });
        items.push(grid);
        items.push(makeButton(s, { label: 'triển lãm', content: '🎭', cls: 'dr-expo-btn', onTap: () => startExpo(0) }));
      }
      items.push(closeBtn(s, 'đóng quyển vở', close));
      return items;
    });
    ctx.hint.touch();
  }

  /* ------------------------------------------------------------- one page */

  function showPage(index: number): void {
    const pages = pagesOf(gallery);
    if (pages.length === 0) return showShelf();
    const i = ((index % pages.length) + pages.length) % pages.length;
    const art = pages[i]!;
    screen((s) => {
      const img = h('img', { class: 'dr-book-img', alt: art.title || 'tranh của bé', src: art.thumb, draggable: false });
      const stage = h('div', { class: 'dr-book-page' }, img);
      let from: { x: number; y: number } | null = null;
      stage.addEventListener('pointerdown', (e) => {
        from = { x: e.clientX, y: e.clientY };
      });
      stage.addEventListener('pointerup', (e) => {
        if (!from) return;
        const dx = e.clientX - from.x;
        from = null;
        if (Math.abs(dx) >= SWIPE) {
          ctx.audio.tick();
          showPage(i + (dx < 0 ? 1 : -1));
        }
      });
      const flip = (by: number, icon: string, label: string): HTMLElement =>
        makeButton(s, {
          label,
          content: icon,
          cls: `dr-flip ${by < 0 ? 'prev' : 'next'}`,
          onTap: () => {
            ctx.audio.tick();
            showPage(i + by);
          },
        });
      const isWall = gallery.wallpaper()?.id === art.id;
      const wall = makeButton(s, {
        label: 'làm phông nền',
        content: '🖼️',
        cls: `dr-wall${isWall ? ' selected' : ''}`,
        onTap: () => {
          gallery.setWallpaper(art.id);
          ctx.audio.pop();
          env.say(gallery.wallpaper()?.id === art.id ? 'Tranh này làm phông nền nhé!' : 'Bỏ phông nền.');
          showPage(i);
        },
      });
      const expo = makeButton(s, { label: 'triển lãm', content: '🎭', cls: 'dr-expo-btn', onTap: () => startExpo(pages.length - 1 - i) });
      const del = makeButton(s, { label: 'xoá tranh (dành cho ba mẹ)', content: '🗑️', cls: 'dr-del', onTap: () => confirmDelete(art, i) });
      const row = h('div', { class: 'dr-book-actions' }, wall, expo, del);
      const counter = h('div', { class: 'dr-book-count', 'aria-hidden': 'true' }, `${modeInfo(art.mode).icon} ${i + 1}/${pages.length}`);
      return [stage, flip(-1, '◀', 'trang trước'), flip(1, '▶', 'trang sau'), row, counter, closeBtn(s, 'về các trang', showShelf, '▦')];
    });
    if (art.title) env.say(slow(art.title));
  }

  /* ---------------------------------------------------------- delete (adults) */

  function confirmDelete(art: Artwork, index: number): void {
    ctx.audio.tick();
    const s = createScope();
    const keep = makeButton(s, { label: 'giữ lại', content: '💚', cls: 'dr-keep', onTap: () => back() });
    const del = h('button', { class: 'dr-btn dr-del-hold', type: 'button', 'aria-label': 'giữ lâu để xoá' }, '🗑️');
    s.add(
      onHold(del, DELETE_HOLD_MS, () => {
        gallery.remove(art.id);
        ctx.audio.boing();
        back(true);
      }),
    );
    const card = h('div', { class: 'dr-confirm-card' }, h('div', { class: 'dr-confirm-who', 'aria-hidden': 'true' }, '👪'), h('div', { class: 'dr-confirm-row' }, keep, del));
    const wrap = h('div', { class: 'dr-confirm' }, card);
    book.append(wrap);
    function back(deleted = false): void {
      s.dispose();
      wrap.remove();
      if (deleted) {
        const left = pagesOf(gallery).length;
        if (left === 0) showShelf();
        else showPage(Math.min(index, left - 1));
      }
    }
    scope.add(() => {
      s.dispose();
      wrap.remove();
    });
  }

  /* ------------------------------------------------------------ exhibition */

  function startExpo(from: number): void {
    // Oldest to newest, from the page the child was looking at.
    const seq = [...gallery.list()];
    if (seq.length === 0) return;
    const s = createScope();
    let n = Math.min(Math.max(0, from), seq.length - 1);
    const img = h('img', { class: 'dr-expo-img', alt: '' });
    const frame = h('div', { class: 'dr-expo-frame' }, img);
    const sparks = h('div', { class: 'dr-expo-sparks', 'aria-hidden': 'true' }, ...['✨', '⭐', '✨', '🎉', '⭐', '✨'].map((e) => h('span', {}, e)));
    const stop = h('button', { class: 'dr-btn dr-book-close', type: 'button', 'aria-label': 'dừng triển lãm' }, '✕');
    const wrap = h('div', { class: 'dr-expo' }, sparks, frame, stop);
    book.append(wrap);
    sub?.dispose();
    sub = null;

    const finish = (): void => {
      s.dispose();
      wrap.remove();
      if (!closed) showShelf();
    };
    onTapRelease(stop, finish);
    scope.add(() => {
      s.dispose();
      wrap.remove();
    });

    const step = (): void => {
      const art = seq[n];
      if (!art) {
        ctx.audio.jingle();
        env.say('Hết triển lãm rồi. Bé vẽ đẹp quá!');
        s.timeout(finish, 2200);
        return;
      }
      img.src = art.thumb;
      frame.classList.remove('shown');
      void frame.offsetWidth;
      frame.classList.add('shown');
      ctx.audio.drum('clap');
      s.timeout(() => ctx.audio.drum('clap'), 160);
      s.timeout(() => ctx.audio.drum('clap'), 340);
      if (art.title) env.say(slow(art.title));
      n++;
      s.timeout(step, EXPO_MS);
    };
    env.say('Triển lãm tranh của bé!');
    s.timeout(step, 900);
  }

  if (startAt && gallery.get(startAt)) {
    const idx = pagesOf(gallery).findIndex((a) => a.id === startAt);
    showPage(Math.max(0, idx));
  } else {
    showShelf();
  }
  return close;
}
