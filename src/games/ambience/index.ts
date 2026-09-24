import { h, replay } from '../../core/dom';
import type { Loop } from '../../core/audio';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { BACKDROPS, MAX_ON, SHELVES, backdropThumb, backdropUrl, findAmbient, mixLevel, toggle, type Ambient, type Shelf } from './logic';
import { LOOP_IDS, loopUrl } from './files';
import { createScene } from './scene';
import './style.css';

const SAVE_KEY = 'be-choi:ambience';
/** Mixing this many at once for the first time earns a star. */
const STAR_AT = 3;

interface Saved {
  on: string[];
  shelf: string;
  /** A photograph from BACKDROPS, or '' for the drawn landscape. */
  backdrop: string;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as Partial<Saved>;
    return {
      on: Array.isArray(raw.on) ? raw.on.filter((id) => typeof id === 'string' && findAmbient(id)) : [],
      shelf: typeof raw.shelf === 'string' ? raw.shelf : (SHELVES[0]?.id ?? ''),
      backdrop: BACKDROPS.some((b) => b.id === raw.backdrop) ? (raw.backdrop as string) : '',
    };
  } catch {
    return { on: [], shelf: SHELVES[0]?.id ?? '', backdrop: '' };
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: the scene starts empty next time */
  }
}

/**
 * Bé tạo cảnh: switch backgrounds on and off — rain, the sea, birds, a train, a
 * campfire — and they play together, each painting itself into the picture:
 * rain falls, the sea rolls in along the bottom, the sky goes dark for the
 * crickets. Like the mixer in iFocus, for someone who cannot read.
 *
 * Loops are downloaded only when first switched on (a tile spins while it
 * loads), so opening the game costs nothing. What was on is remembered, and
 * comes back on next time. The 🖼️ button swaps the drawn landscape for a
 * photograph; the effects carry on over it.
 */
function start(ctx: GameContext): void {
  let alive = true;
  const saved = load();
  let shelf: Shelf = SHELVES.find((s) => s.id === saved.shelf) ?? SHELVES[0]!;
  let on: string[] = [];
  let starred = false;
  const playing = new Map<string, Loop>();
  /** Loops on their way down: their tiles spin until they start. */
  const loading = new Set<string>();

  const canvas = h('canvas', { class: 'amb-canvas' });
  const hush = h('button', { class: 'amb-hush', type: 'button', 'aria-label': 'tắt hết' }, '🤫');
  const pictures = h(
    'button',
    { class: 'amb-pictures', type: 'button', 'aria-label': 'đổi phông nền' },
    '🖼️',
    h('span', { class: 'amb-spin', 'aria-hidden': 'true' }),
  );
  const picker = h('div', { class: 'amb-picker', hidden: true });
  let backdrop = saved.backdrop;
  const tabs = h('nav', { class: 'amb-tabs' });
  const tiles = h('div', { class: 'amb-tiles' });
  const root = h(
    'div',
    { class: 'amb' },
    h('div', { class: 'amb-view' }, canvas, hush, pictures, picker),
    h('div', { class: 'amb-tray' }, tabs, tiles),
  );
  ctx.stage.append(root);
  const scene = createScene(canvas);

  function tileOf(id: string): HTMLElement | null {
    return tiles.querySelector<HTMLElement>(`[data-id="${id}"]`);
  }

  function paint(): void {
    for (const el of tiles.querySelectorAll<HTMLElement>('.amb-tile')) {
      const id = el.dataset.id ?? '';
      el.classList.toggle('amb-on', on.includes(id));
      el.classList.toggle('amb-loading', loading.has(id));
      el.setAttribute('aria-pressed', String(on.includes(id)));
    }
    for (const el of tabs.querySelectorAll<HTMLElement>('.amb-tab')) {
      const s = SHELVES.find((x) => x.id === el.dataset.shelf);
      el.classList.toggle('amb-tab-lit', !!s?.items.some((a) => on.includes(a.id)));
    }
    hush.classList.toggle('amb-hush-shown', on.length > 0);
    scene.setOn(on);
    save({ on, shelf: shelf.id, backdrop });
  }

  /** Every loop at its share of the mix. */
  function level(): void {
    for (const [id, loop] of playing) {
      const amb = findAmbient(id);
      if (amb) loop.setVolume(mixLevel(amb, on.length));
    }
  }

  async function startLoop(amb: Ambient): Promise<void> {
    if (!LOOP_IDS.has(amb.id) || playing.has(amb.id) || loading.has(amb.id)) return;
    loading.add(amb.id);
    paint();
    const loop = await ctx.audio.loop(loopUrl(amb.id), mixLevel(amb, on.length));
    loading.delete(amb.id);
    if (!alive || !on.includes(amb.id)) {
      // Switched off (or left) while it was on its way.
      loop?.stop();
    } else if (loop) {
      playing.set(amb.id, loop);
      level();
    }
    if (alive) paint();
  }

  function stopLoop(id: string): void {
    playing.get(id)?.stop();
    playing.delete(id);
  }

  function flip(amb: Ambient): void {
    ctx.hint.touch();
    const wasOn = on.includes(amb.id);
    const next = toggle(on, amb.id);
    on = next.on;
    for (const id of next.dropped) stopLoop(id);
    if (wasOn) {
      stopLoop(amb.id);
      ctx.audio.tick();
    } else {
      scene.announce(amb.emoji);
      ctx.speak(amb.name);
      void startLoop(amb);
      if (!starred && on.length >= STAR_AT) {
        starred = true;
        ctx.audio.ding();
        ctx.addStar();
      }
    }
    const el = tileOf(amb.id);
    if (el) replay(el, 'anim-bounce');
    level();
    paint();
  }

  function showShelf(s: Shelf): void {
    shelf = s;
    tabs.replaceChildren(
      ...SHELVES.map((x) => {
        const b = h(
          'button',
          { class: `amb-tab${x === s ? ' amb-tab-on' : ''}`, type: 'button', 'aria-label': x.name, 'data-shelf': x.id },
          x.icon,
        );
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ctx.hint.touch();
          if (x !== shelf) {
            ctx.audio.tick();
            showShelf(x);
          }
        });
        return b;
      }),
    );
    tiles.replaceChildren(
      ...s.items.map((amb) => {
        const b = h(
          'button',
          { class: 'amb-tile', type: 'button', 'aria-label': amb.name, 'data-id': amb.id },
          h('span', { class: 'amb-face' }, amb.emoji),
          h('span', { class: 'amb-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          h('span', { class: 'amb-spin', 'aria-hidden': 'true' }),
        );
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          flip(amb);
        });
        return b;
      }),
    );
    paint();
  }

  /** Show a photograph (or the drawing, for ''), once it has arrived. */
  function useBackdrop(id: string): void {
    backdrop = id;
    save({ on, shelf: shelf.id, backdrop });
    if (!id) {
      scene.setBackdrop(null);
      pictures.classList.remove('amb-loading');
      return;
    }
    const img = new Image();
    pictures.classList.add('amb-loading');
    img.onload = () => {
      if (!alive || backdrop !== id) return;
      pictures.classList.remove('amb-loading');
      scene.setBackdrop(img);
    };
    img.onerror = () => {
      // Offline and never seen before: stay on the drawing rather than a blank.
      if (backdrop === id) pictures.classList.remove('amb-loading');
    };
    img.src = `${import.meta.env.BASE_URL}${backdropUrl(id)}`;
  }

  function openPicker(): void {
    const card = (id: string, face: HTMLElement, label: string) => {
      const b = h(
        'button',
        { class: `amb-pick${id === backdrop ? ' amb-pick-on' : ''}`, type: 'button', 'aria-label': label, 'data-backdrop': id },
        face,
      );
      // `click`, not pointerdown: a finger that lands on a picture to scroll the list
      // must not choose it. The browser sends no click when the touch became a scroll.
      b.addEventListener('click', () => {
        ctx.audio.tick();
        useBackdrop(id);
        picker.hidden = true;
      });
      return b;
    };
    const list = h('div', { class: 'amb-picks' });
    // The shell cancels every touch on the stage so nothing pans or zooms mid-game;
    // this list has to scroll, so its touches stop here, before they reach it.
    for (const type of ['touchstart', 'touchmove']) list.addEventListener(type, (e) => e.stopPropagation());
    list.append(
      card('', h('span', { class: 'amb-pick-draw' }, '🎨'), 'tranh vẽ'),
      ...BACKDROPS.map((b) =>
        card(
          b.id,
          h('img', { src: `${import.meta.env.BASE_URL}${backdropThumb(b.id)}`, alt: '', loading: 'lazy', draggable: 'false' }),
          b.name,
        ),
      ),
    );
    picker.replaceChildren(list);
    picker.hidden = false;
  }

  pictures.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    ctx.audio.tick();
    if (picker.hidden) openPicker();
    else picker.hidden = true;
  });
  // A tap on the dimmed space around the pictures closes the picker.
  picker.addEventListener('pointerdown', (e) => {
    if (e.target === picker) {
      e.preventDefault();
      picker.hidden = true;
    }
  });

  hush.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    for (const id of on) stopLoop(id);
    on = [];
    ctx.audio.puff();
    paint();
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    const r = canvas.getBoundingClientRect();
    scene.sparkle(e.clientX - r.left, e.clientY - r.top);
    ctx.audio.pop(1 + Math.random() * 0.5);
  });

  showShelf(shelf);
  if (backdrop) useBackdrop(backdrop);
  // Whatever was playing last time starts again.
  on = saved.on.slice(-MAX_ON);
  for (const id of on) {
    const amb = findAmbient(id);
    if (amb) void startLoop(amb);
  }
  paint();

  ctx.hint.arm(() => {
    const quiet = [...tiles.querySelectorAll<HTMLElement>('.amb-tile:not(.amb-on)')];
    const el = quiet[Math.floor(Math.random() * quiet.length)];
    if (el) replay(el, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    alive = false;
    for (const id of [...playing.keys()]) stopLoop(id);
    scene.destroy();
  });
}

const game: GameModule = { ...meta, start };
export default game;
