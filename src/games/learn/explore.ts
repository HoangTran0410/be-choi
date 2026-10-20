import type { FxKind } from '../../core/audio';
import { ANIMALS, COLORS, VOICED_ANIMALS, voiceOf } from '../../core/content';
import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import { LETTERS } from '../letters/logic';
import { SHAPES } from '../shapes/logic';
import type { App } from './app';
import {
  COLOR_THINGS,
  COUNT_THINGS,
  LETTER_IDS,
  LETTER_WORDS,
  ONOMATOPOEIA,
  SHAPE_THINGS,
  SHAPE_ORDER,
  glyphOf,
  keyOf,
  numberWord,
} from './curriculum';
import type { Part } from './say';
import type { Scope } from './scope';
import type { Env, Visual } from './types';
import { renderVisual } from './visual';

export interface Tile {
  id: string;
  /** The picture on the tile and, larger, on the card. */
  face: Visual;
  /** Spoken in order; a phrase with `reveal` shows that gallery picture as it is said. */
  parts: { say: Part; reveal?: number }[];
  /** The pictures that appear one by one while the voice goes on. */
  gallery: { visual: Visual; label: string }[];
  /** Animal voice played before the words. */
  sound?: FxKind;
}

export interface Tab {
  id: string;
  icon: string;
  title: string;
  tiles: Tile[];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Everything the child can touch and learn about, by tab. Pure data: no DOM, no speech. */
export function exploreTabs(env: Env): Tab[] {
  const letters: Tile[] = LETTER_IDS.map((id) => {
    const label = keyOf(id);
    const g = glyphOf(label);
    const words = LETTER_WORDS[label]!;
    return {
      id,
      face: { k: 'text', v: `${label}${label.toLowerCase()}` },
      parts: [{ say: `Chữ ${g.name}` }, ...words.map((w, i) => ({ say: w.name, reveal: i }))],
      gallery: words.map((w) => ({ visual: { k: 'emoji', v: w.emoji } as Visual, label: w.name })),
    };
  });
  // Alphabet order on screen (the learning order is for the questions).
  letters.sort((a, b) => LETTERS.findIndex((l) => l.label === keyOf(a.id)) - LETTERS.findIndex((l) => l.label === keyOf(b.id)));

  const numbers: Tile[] = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const thing = COUNT_THINGS[i % COUNT_THINGS.length]!;
    return {
      id: `N:${n}`,
      face: { k: 'text', v: String(n) },
      parts: [
        { say: `Số ${numberWord(n)}` },
        ...Array.from({ length: n }, (_, j) => ({ say: { text: numberWord(j + 1), gap: 120 }, reveal: j })),
        { say: `${cap(numberWord(n))} ${thing.name}` },
      ],
      gallery: Array.from({ length: n }, (_, j) => ({ visual: { k: 'emoji', v: thing.emoji } as Visual, label: numberWord(j + 1) })),
    };
  });

  const animals: Tab['tiles'] = VOICED_ANIMALS.map((a) => ({
    id: `A:${a.emoji}`,
    face: { k: 'emoji', v: a.emoji },
    parts: [{ say: cap(a.name) }, { say: ONOMATOPOEIA[a.emoji] ?? '', reveal: 0 }],
    gallery: [{ visual: { k: 'chip', v: ONOMATOPOEIA[a.emoji] ?? '' }, label: '' }],
    sound: voiceOf(a),
  }));
  // The few animals without a recorded voice still get a card, just no sound.
  for (const a of ANIMALS) {
    if (animals.some((t) => t.id === `A:${a.emoji}`)) continue;
    animals.push({ id: `A:${a.emoji}`, face: { k: 'emoji', v: a.emoji }, parts: [{ say: cap(a.name) }], gallery: [] });
  }

  const colors: Tile[] = COLORS.map((c) => {
    const things = COLOR_THINGS[c.id]!;
    return {
      id: `C:${c.id}`,
      face: { k: 'ball', hex: c.hex },
      parts: [{ say: cap(c.name) }, ...things.map((t, i) => ({ say: t.name, reveal: i }))],
      gallery: things.map((t) => ({ visual: { k: 'emoji', v: t.emoji } as Visual, label: t.name })),
    };
  });

  const shapes: Tile[] = SHAPE_ORDER.map((id) => {
    const s = SHAPES.find((x) => x.id === id)!;
    const things = SHAPE_THINGS[id]!;
    return {
      id: `S:${id}`,
      face: { k: 'shape', path: s.path, hex: '#60a5fa' },
      parts: [{ say: cap(s.name) }, ...things.map((t, i) => ({ say: t.name, reveal: i }))],
      gallery: things.map((t) => ({ visual: { k: 'emoji', v: t.emoji } as Visual, label: t.name })),
    };
  });

  const tabs: Tab[] = [
    { id: 'letters', icon: '🔤', title: 'Chữ cái', tiles: letters },
    { id: 'numbers', icon: '🔢', title: 'Số', tiles: numbers },
    { id: 'animals', icon: '🐾', title: 'Con vật', tiles: animals },
    { id: 'colors', icon: '🎨', title: 'Màu sắc', tiles: colors },
    { id: 'shapes', icon: '🔷', title: 'Hình', tiles: shapes },
  ];
  if (env.people.length > 0) {
    tabs.push({
      id: 'family',
      icon: '👪',
      title: 'Người thân',
      tiles: env.people.map((q) => ({
        id: `F:${q.key}`,
        face: { k: 'photo', url: q.urls[0]! },
        parts: [{ say: q.name ?? 'Người thân của bé', reveal: q.urls.length > 1 ? 0 : undefined }],
        gallery: q.urls.slice(1).map((u) => ({ visual: { k: 'photo', url: u } as Visual, label: q.name ?? '' })),
      })),
    });
  }
  return tabs;
}

/** Touching this many different things in one visit earns a star. */
export const STAR_AFTER = 8;

/**
 * Khám phá: nothing is asked. Touch a letter, number, animal, colour or shape and the
 * teacher says it slowly while its pictures appear one by one. A new touch stops the old
 * sentence at once.
 */
export function showExplore(app: App, root: HTMLElement, scope: Scope): void {
  const { ctx } = app;
  const tabs = exploreTabs(app.env);
  let tileOff: Array<() => void> = [];
  const touched = new Set<string>();
  let starred = false;

  const back = h('button', { class: 'le-back', type: 'button', 'aria-label': 'Về bản đồ' }, '🗺️');
  const tabBar = h('nav', { class: 'le-tabs', 'data-n': tabs.length + 1 }, back);
  const card = h('div', { class: 'le-card' });
  const grid = h('div', { class: 'le-grid' });
  const screen = h('div', { class: `le${app.low() ? ' low' : ''}` }, tabBar, h('div', { class: 'le-main' }, card, grid));
  root.replaceChildren(screen);

  scope.onDispose(
    makeTappable(
      back,
      () => {
        app.sayer.stop();
        app.goMap();
      },
      { cooldownMs: 300, feedback: false },
    ),
  );

  const tabBtns = tabs.map((t) => {
    const b = h('button', { class: 'le-tab', type: 'button', 'aria-label': t.title }, t.icon);
    scope.onDispose(
      makeTappable(
        b,
        () => {
          ctx.hint.touch();
          app.sayer.stop();
          ctx.audio.pop(1);
          select(t);
        },
        { cooldownMs: 150, feedback: false },
      ),
    );
    tabBar.append(b);
    return b;
  });

  function drawCard(tile: Tile | null, shown: number[]): void {
    if (!tile) {
      card.replaceChildren(h('p', { class: 'le-hint' }, 'Chạm vào một hình nhé!'));
      return;
    }
    const slots = tile.gallery.map((g, i) => {
      const on = shown.includes(i);
      return h(
        'div',
        { class: `le-pic${on ? ' on' : ''}`, 'data-i': i },
        on ? renderVisual(g.visual) : h('span', { class: 'le-pic-dot' }),
        on && g.label ? h('span', { class: 'le-pic-label' }, g.label) : null,
      );
    });
    card.replaceChildren(
      h('div', { class: 'le-face' }, renderVisual(tile.face)),
      h('div', { class: `le-gallery lv-n${Math.min(10, slots.length)}` }, ...slots),
    );
  }

  function play(tile: Tile): void {
    ctx.hint.touch();
    grid.querySelectorAll('.le-tile').forEach((el) => el.classList.toggle('sel', (el as HTMLElement).dataset.id === tile.id));
    const shown: number[] = [];
    drawCard(tile, shown);
    replay(card, 'lq-pop');
    ctx.audio.pop(1.05);
    if (tile.sound) ctx.audio.fx(tile.sound);
    app.sayer.say(
      tile.parts.map((p) => p.say),
      {
        delay: tile.sound ? 1100 : 150,
        onPart(i) {
          const r = tile.parts[i]?.reveal;
          if (r === undefined || shown.includes(r)) return;
          shown.push(r);
          const slot = card.querySelector(`.le-pic[data-i="${r}"]`);
          if (slot) {
            const g = tile.gallery[r]!;
            slot.classList.add('on');
            slot.replaceChildren(renderVisual(g.visual), ...(g.label ? [h('span', { class: 'le-pic-label' }, g.label)] : []));
            replay(slot, 'lq-pop');
          }
        },
      },
    );
    touched.add(tile.id);
    if (!starred && touched.size >= STAR_AFTER) {
      starred = true;
      scope.later(() => {
        ctx.addStar();
        void ctx.celebrate();
      }, 600);
    }
  }

  function select(t: Tab): void {
    for (const off of tileOff) off();
    tileOff = [];
    tabBtns.forEach((b, i) => b.classList.toggle('on', tabs[i] === t));
    grid.className = `le-grid le-grid-${t.id}`;
    const tiles = t.tiles.map((tile) => {
      const el = h('button', { class: 'le-tile', type: 'button', 'data-id': tile.id, 'aria-label': tile.id }, renderVisual(tile.face));
      tileOff.push(makeTappable(el, () => play(tile), { cooldownMs: 0, feedback: false }));
      return el;
    });
    grid.replaceChildren(...tiles);
    grid.scrollTop = 0;
    drawCard(null, []);
  }

  scope.onDispose(() => {
    for (const off of tileOff) off();
  });
  select(tabs[0]!);
}
