import { h, replay } from '../../core/dom';
import type { Clip } from '../../core/audio';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { PAGES, pageDone, scatter, type Page, type Thing } from './logic';
import { SOUND_IDS, soundUrl } from './sounds';
import './style.css';

const SAVE_KEY = 'be-choi:soundbook-page';
/** The name is said this long after the sound ends, so the two never talk over each other. */
const NAME_AFTER_MS = 150;
/** Without a recording (sound off, file missing) the picture still moves for this long. */
const SILENT_MS = 900;

function loadPage(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function savePage(id: string): void {
  try {
    localStorage.setItem(SAVE_KEY, id);
  } catch {
    /* private mode: the book opens on the first page next time */
  }
}

/**
 * Bấm nghe tiếng: a picture book of sounds. Tabs along the top pick a page —
 * farm, jungle, vehicles, things at home, people, weather — and every picture
 * on the page makes its own real sound when pressed: the fire engine wails, the
 * cow moos, the baby giggles. Then its name is said.
 *
 * Free play, no order and no wrong answers. One sound at a time, so a child
 * drumming on the screen hears each thing clearly instead of a farmyard riot:
 * a new tap cuts the last sound short. Hearing everything on a page earns a star.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let page: Page = PAGES.find((p) => p.id === loadPage()) ?? PAGES[0]!;
  let playing: Clip | null = null;
  /** Bumped on every tap; a sound that finishes after a newer tap says nothing. */
  let turn = 0;
  const heard = new Map<string, Set<string>>();
  /** Pages whose star has been given this visit. */
  const starred = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const tabs = h('nav', { class: 'sb-tabs' });
  const scene = h('div', { class: 'sb-scene' });
  const root = h('div', { class: 'sb' }, tabs, scene);
  ctx.stage.append(root);

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  function stopPlaying(): void {
    playing?.stop();
    playing = null;
    for (const el of scene.querySelectorAll('.sb-on')) el.classList.remove('sb-on');
  }

  /** Little notes float up from the picture while it makes its sound. */
  function notes(el: HTMLElement): void {
    for (let i = 0; i < 3; i++) {
      const n = h('span', { class: 'sb-note', style: `--i:${i}` }, i % 2 ? '♪' : '♫');
      el.append(n);
      later(() => n.remove(), 1400);
    }
  }

  async function press(el: HTMLElement, thing: Thing): Promise<void> {
    ctx.hint.touch();
    const mine = ++turn;
    stopPlaying();
    el.classList.add('sb-on');
    replay(el, 'sb-press');
    notes(el);

    const set = heard.get(page.id) ?? new Set<string>();
    heard.set(page.id, set);
    set.add(thing.id);
    el.classList.add('sb-heard');

    const clip = SOUND_IDS.has(thing.id) ? await ctx.audio.clip(soundUrl(thing.id)) : null;
    if (!alive || mine !== turn) {
      clip?.stop();
      return;
    }
    playing = clip;
    const ms = clip ? clip.duration * 1000 : SILENT_MS;
    later(() => {
      if (mine !== turn) return;
      el.classList.remove('sb-on');
      playing = null;
      ctx.speak(thing.name);
      if (!starred.has(page.id) && pageDone(page, set)) {
        starred.add(page.id);
        // A bell, not confetti: this page is for pressing things over and over.
        ctx.audio.ding();
        replay(tabs.querySelector<HTMLElement>('.sb-tab-on') ?? tabs, 'anim-bounce');
        ctx.addStar();
      }
    }, ms + NAME_AFTER_MS);
  }

  function renderTabs(): void {
    tabs.replaceChildren(
      ...PAGES.map((p) => {
        const b = h(
          'button',
          { class: `sb-tab${p === page ? ' sb-tab-on' : ''}`, type: 'button', 'aria-label': p.name, 'data-page': p.id },
          p.icon,
        );
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ctx.hint.touch();
          if (p === page) return;
          show(p);
          ctx.audio.tick();
        });
        return b;
      }),
    );
  }

  function show(p: Page): void {
    turn++;
    stopPlaying();
    page = p;
    savePage(p.id);
    renderTabs();
    root.dataset.page = p.id;
    root.dataset.motion = p.motion;
    const set = heard.get(p.id);
    scene.replaceChildren(
      ...p.things.map((thing, i) => {
        const s = scatter(i);
        const el = h(
          'button',
          {
            class: `sb-thing${set?.has(thing.id) ? ' sb-heard' : ''}`,
            type: 'button',
            'aria-label': thing.name,
            'data-id': thing.id,
            style: `--dx:${s.dx.toFixed(1)}%;--dy:${s.dy.toFixed(1)}%;--tilt:${s.tilt.toFixed(1)}deg;--delay:${s.delay.toFixed(2)}s`,
          },
          h('span', { class: 'sb-face' }, thing.emoji),
        );
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          void press(el, thing);
        });
        return el;
      }),
    );
    scene.dataset.count = String(p.things.length);
    ctx.audio.preload(p.things.filter((t) => SOUND_IDS.has(t.id)).map((t) => soundUrl(t.id)));
  }

  show(page);
  ctx.hint.arm(() => {
    const quiet = [...scene.querySelectorAll<HTMLElement>('.sb-thing:not(.sb-heard)')];
    const el = quiet[Math.floor(Math.random() * quiet.length)] ?? scene.querySelector<HTMLElement>('.sb-thing');
    if (el) replay(el, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    alive = false;
    stopPlaying();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
