import { h, replay } from '../../core/dom';
import { onHold } from '../../core/hold';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  DEFAULT_TITLE,
  SHELVES,
  addCustom,
  PLAYER_ORIGIN,
  commandMessage,
  embedUrl,
  listeningMessage,
  oembedUrl,
  readPlayerMessage,
  shieldStrips,
  parseSaved,
  parseYouTube,
  refKey,
  removeCustom,
  renameCustom,
  thumbUrl,
  titleFromOembed,
  type CustomVideo,
  type PlayerCommand,
  type YouTubeRef,
} from './logic';
import './style.css';

const TAB_KEY = 'be-choi:videos-tab';
const CUSTOM_KEY = 'be-choi:videos-custom';
/** The shelf of the parent's own videos. Only shown once there is something on it. */
const MINE = 'mine';
/** Long enough that a toddler patting the screen never throws away a parent's link. */
const REMOVE_HOLD_MS = 900;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the list lasts until the game closes */
  }
}

/**
 * The shell cancels every touchstart / touchmove on the stage, so a finger
 * never scrolls or zooms the play area. Here that is wrong twice over: the list
 * of videos is taller than the screen, and a text box whose touches are
 * cancelled never gets the keyboard or the Paste menu. Stopping those events
 * before they reach the document hands them back to the browser. (A cancelled
 * touchstart also means no click, which is why the cards can use `click`: a
 * finger that scrolls the list does not open a video on the way.)
 */
function letBrowserHandle(el: HTMLElement): void {
  for (const type of ['touchstart', 'touchmove', 'contextmenu', 'selectstart']) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
}

/**
 * Xem nhạc: pick a video from a shelf of big pictures and it plays, large,
 * with one big ✕ to come back. The shelves are the calm music and slow scenery
 * iFocus keeps for studying — sunsets, rain, a fish tank, a lofi girl — which
 * suit a toddler winding down just as well. A parent can add their own links
 * behind the small + (a child can't type, and shouldn't need to); those get a
 * ⭐ shelf of their own and are kept on the device.
 *
 * Everything here needs the internet. Offline the shelves still show, with an
 * emoji where each picture would be, and pressing one says so kindly instead
 * of opening a broken player.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let custom: CustomVideo[] = parseSaved(load(CUSTOM_KEY));
  const saved = load(TAB_KEY);
  let shelf = saved === MINE ? (custom.length ? MINE : SHELVES[0]!.id) : (SHELVES.find((s) => s.id === saved)?.id ?? SHELVES[0]!.id);
  let player: HTMLElement | null = null;
  /** What the open player is showing, so it can start over when the internet comes back. */
  let playing: {
    frame: HTMLElement;
    ref: YouTubeRef;
    /** Names this player in the listening handshake. */
    id: string;
    playBtn: HTMLElement;
    soundBtn: HTMLElement;
    isPlaying: boolean;
    muted: boolean;
    /** The player has spoken at least once, so the handshake can stop. */
    heard: boolean;
    hello: ReturnType<typeof setInterval> | null;
  } | null = null;
  let sessions = 0;
  let adder: HTMLElement | null = null;
  /** The ✕ buttons' hold listeners, dropped whenever the list is redrawn. */
  let holds: Array<() => void> = [];
  const fetches = new Set<AbortController>();
  /**
   * Opening or closing an overlay on a press leaves a click still to come,
   * which lands on whatever is now under the finger: the card behind the ✕,
   * the backdrop behind the new panel. Those clicks are ignored for a moment.
   */
  let settleUntil = 0;
  const settle = () => (settleUntil = Date.now() + 400);
  const settling = () => Date.now() < settleUntil;

  const tabs = h('nav', { class: 'vd-tabs' });
  const list = h('div', { class: 'vd-list' });
  const root = h('div', { class: 'vd' }, tabs, list);
  letBrowserHandle(list);
  ctx.stage.append(root);

  function saveCustom(): void {
    save(CUSTOM_KEY, JSON.stringify(custom));
  }

  // ---- shelves ----

  function renderTabs(): void {
    const faces = SHELVES.map((s) => ({ id: s.id, icon: s.icon, name: s.name }));
    if (custom.length) faces.push({ id: MINE, icon: '⭐', name: 'Của bé' });
    const plus = h('button', { class: 'vd-plus', type: 'button', 'aria-label': 'Thêm video' }, '+');
    plus.addEventListener('pointerup', () => {
      settle();
      openAdder();
    });
    tabs.replaceChildren(
      ...faces.map((f) => {
        const b = h(
          'button',
          { class: `vd-tab${f.id === shelf ? ' vd-tab-on' : ''}`, type: 'button', 'aria-label': f.name, 'data-shelf': f.id },
          f.icon,
        );
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (f.id === shelf) return;
          show(f.id);
          ctx.audio.tick();
        });
        return b;
      }),
      plus,
    );
  }

  function card(ref: YouTubeRef, emoji: string, title: string, removable: boolean): HTMLElement {
    const thumb = h('span', { class: 'vd-thumb' }, h('span', { class: 'vd-emoji' }, emoji));
    if (ref.video) {
      const img = h('img', { src: thumbUrl(ref.video), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
      // Offline, or a video taken down: the emoji underneath is the picture instead.
      img.addEventListener('error', () => img.remove());
      thumb.append(img);
    }
    const btn = h('button', { class: 'vd-card', type: 'button', 'data-key': refKey(ref) }, thumb, h('span', { class: 'vd-name' }, title));
    btn.addEventListener('click', () => {
      if (settling()) return;
      ctx.hint.touch();
      replay(btn, 'vd-press');
      openPlayer(ref);
    });
    const item = h('div', { class: 'vd-item' }, btn);
    if (removable) {
      const del = h('button', { class: 'vd-del', type: 'button', 'aria-label': 'Giữ để xoá' }, '✕');
      holds.push(
        onHold(del, REMOVE_HOLD_MS, () => {
          custom = removeCustom(custom, refKey(ref));
          saveCustom();
          ctx.audio.puff();
          show(custom.length ? MINE : SHELVES[0]!.id);
        }),
      );
      item.append(del);
    }
    return item;
  }

  function show(id: string): void {
    shelf = id;
    save(TAB_KEY, id);
    renderTabs();
    for (const dispose of holds) dispose();
    holds = [];
    root.dataset.shelf = id;
    const items =
      id === MINE
        ? custom.map((v) => card(v, v.video ? '🎬' : '📺', v.title, true))
        : (SHELVES.find((s) => s.id === id) ?? SHELVES[0]!).videos.map((v) => card({ video: v.id }, v.emoji, v.title, false));
    list.replaceChildren(...items);
    list.scrollTop = 0;
  }

  // ---- the player ----

  /** Stop pestering a player that never answers (blocked, or not YouTube's any more) after this many tries. */
  const HELLO_TRIES = 20;
  const HELLO_MS = 500;

  function closePlayer(): void {
    // Taking the iframe out of the page is what stops the sound.
    if (playing?.hello) clearInterval(playing.hello);
    player?.remove();
    player = null;
    playing = null;
  }

  /** Our own buttons show what we last heard from the player (or last asked it for, if it never says). */
  function syncButtons(): void {
    if (!playing) return;
    playing.playBtn.textContent = playing.isPlaying ? '⏸️' : '▶️';
    playing.playBtn.setAttribute('aria-label', playing.isPlaying ? 'Dừng' : 'Phát');
    playing.soundBtn.hidden = !playing.muted || !playing.frame.querySelector('iframe');
    playing.playBtn.hidden = !playing.frame.querySelector('iframe');
  }

  function send(func: PlayerCommand): void {
    playing?.frame.querySelector('iframe')?.contentWindow?.postMessage(commandMessage(func), PLAYER_ORIGIN);
  }

  /**
   * See-through strips over the player's edges that take every touch. Even with
   * YouTube's controls off, the embed still carries its title, channel, logo and
   * "Watch on YouTube" links, and one tap on any of them leaves the game for
   * the YouTube app and its endless next video. Under the strips none of that
   * can be reached. The middle stays open (`SHIELD_HOLE`): a real tap there is
   * what iOS needs to start the video with sound, and there is nothing else there.
   */
  function shield(): HTMLElement[] {
    return shieldStrips().map((s) => {
      const el = h('div', {
        class: 'vd-shield',
        'aria-hidden': 'true',
        'data-side': s.side,
        style: `top:${s.top}%;left:${s.left}%;width:${s.width}%;height:${s.height}%`,
      });
      swallow(el);
      return el;
    });
  }

  function swallow(el: HTMLElement): void {
    for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'touchstart', 'touchend', 'contextmenu', 'wheel']) {
      el.addEventListener(
        type,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        { passive: false },
      );
    }
  }

  function fillPlayer(frame: HTMLElement, ref: YouTubeRef): void {
    if (playing?.hello) clearInterval(playing.hello);
    // An iframe to YouTube offline shows the browser's own error page, and its
    // load/error events say nothing across origins, so ask before building it.
    if (navigator.onLine === false) {
      frame.dataset.offline = '';
      frame.replaceChildren(
        h('p', { class: 'vd-offline' }, h('span', { class: 'vd-offline-icon' }, '📡'), 'Cần có mạng để xem video. Nhờ bố mẹ bật mạng nhé!'),
      );
      syncButtons();
      return;
    }
    delete frame.dataset.offline;
    const iframe = h('iframe', {
      src: embedUrl(ref, location.origin),
      title: 'Video',
      allow: 'autoplay; encrypted-media; picture-in-picture',
      // YouTube refuses to play embeds that arrive with no referrer at all.
      referrerpolicy: 'strict-origin-when-cross-origin',
      tabindex: '-1',
    });
    // The player only reports its state to a page that has said it is listening,
    // and a hello sent before its script runs is lost, so keep saying it until it answers.
    iframe.addEventListener('load', () => {
      const session = playing;
      if (!session || session.frame !== frame) return;
      let tries = 0;
      const hello = () => {
        if (session.heard || ++tries > HELLO_TRIES) {
          if (session.hello) clearInterval(session.hello);
          session.hello = null;
          return;
        }
        iframe.contentWindow?.postMessage(listeningMessage(session.id), PLAYER_ORIGIN);
      };
      if (session.hello) clearInterval(session.hello);
      session.hello = setInterval(hello, HELLO_MS);
      hello();
    });
    frame.replaceChildren(iframe, ...shield());
    if (playing) {
      playing.isPlaying = true;
      // Only the player knows whether the browser let it keep its sound; 🔊 waits for it to say it did not.
      playing.muted = false;
    }
    syncButtons();
  }

  function openPlayer(ref: YouTubeRef): void {
    closePlayer();
    const frame = h('div', { class: 'vd-frame', 'data-key': refKey(ref) });
    const close = h('button', { class: 'btn-round vd-close', type: 'button', 'aria-label': 'Đóng' }, '✕');
    close.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      settle();
      closePlayer();
      ctx.audio.tick();
    });
    const playBtn = h('button', { class: 'btn-round vd-toggle', type: 'button' });
    playBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!playing) return;
      // Change the button at once; the player's own report, when it comes, has the last word.
      playing.isPlaying = !playing.isPlaying;
      send(playing.isPlaying ? 'playVideo' : 'pauseVideo');
      syncButtons();
    });
    const soundBtn = h('button', { class: 'btn-round vd-sound', type: 'button', 'aria-label': 'Bật tiếng' }, '🔊');
    soundBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!playing) return;
      send('unMute');
      send('playVideo');
      playing.muted = false;
      playing.isPlaying = true;
      syncButtons();
    });
    player = h('div', { class: 'vd-player' }, frame, close, h('div', { class: 'vd-controls' }, soundBtn, playBtn));
    playing = { frame, ref, id: `vd-${++sessions}`, playBtn, soundBtn, isPlaying: true, muted: false, heard: false, hello: null };
    root.append(player);
    fillPlayer(frame, ref);
  }

  /** News from the player: only from YouTube's origin and only from our own iframe. */
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== PLAYER_ORIGIN || !playing) return;
    const iframe = playing.frame.querySelector('iframe');
    if (!iframe || e.source !== iframe.contentWindow) return;
    const news = readPlayerMessage(e.data);
    if (!news) return;
    playing.heard = true;
    if (news.playing !== undefined) playing.isPlaying = news.playing;
    if (news.muted !== undefined) playing.muted = news.muted;
    syncButtons();
  };
  window.addEventListener('message', onMessage);

  /** The Wi-Fi came back while the "needs internet" note was up: play after all. */
  const onOnline = () => {
    if (playing && 'offline' in playing.frame.dataset) fillPlayer(playing.frame, playing.ref);
  };
  window.addEventListener('online', onOnline);

  // ---- adding a link (grown-ups) ----

  function closeAdder(): void {
    adder?.remove();
    adder = null;
  }

  function fetchTitle(ref: YouTubeRef): void {
    if (typeof fetch !== 'function' || navigator.onLine === false) return;
    const ac = new AbortController();
    fetches.add(ac);
    fetch(oembedUrl(ref), { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        const title = titleFromOembed(data);
        if (!alive || !title) return;
        custom = renameCustom(custom, refKey(ref), title);
        saveCustom();
        if (shelf === MINE) show(MINE);
      })
      // No title is fine: the card keeps its generic name.
      .catch(() => undefined)
      .finally(() => fetches.delete(ac));
  }

  function openAdder(): void {
    if (adder) return;
    ctx.hint.touch();
    const input = h('input', {
      class: 'vd-input',
      type: 'url',
      inputmode: 'url',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'Dán link YouTube vào đây',
      'aria-label': 'Link YouTube',
    });
    const error = h('p', { class: 'vd-error', role: 'alert' });
    const cancel = h('button', { class: 'vd-btn vd-cancel', type: 'button' }, 'Huỷ');
    const form = h(
      'form',
      { class: 'vd-box' },
      h('p', { class: 'vd-box-title' }, 'Thêm video YouTube'),
      input,
      error,
      h('div', { class: 'vd-actions' }, cancel, h('button', { class: 'vd-btn vd-ok', type: 'submit' }, 'Thêm')),
    );
    cancel.addEventListener('click', closeAdder);
    input.addEventListener('input', () => (error.textContent = ''));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const ref = parseYouTube(input.value);
      if (!ref) {
        error.textContent = input.value.trim() ? 'Link này không phải video YouTube.' : 'Hãy dán link YouTube trước nhé.';
        input.focus();
        return;
      }
      custom = addCustom(custom, { ...ref, title: DEFAULT_TITLE });
      saveCustom();
      closeAdder();
      show(MINE);
      ctx.audio.ding();
      fetchTitle(ref);
    });
    adder = h('div', { class: 'vd-add' }, form);
    // A press on the dimmed backdrop, not the box, closes it.
    adder.addEventListener('click', (e) => {
      if (e.target === adder && !settling()) closeAdder();
    });
    letBrowserHandle(adder);
    root.append(adder);
    input.focus();
  }

  show(shelf);
  ctx.hint.arm(() => {
    if (player || adder) return;
    const cards = [...list.querySelectorAll<HTMLElement>('.vd-card')];
    const el = cards[Math.floor(Math.random() * Math.min(cards.length, 6))];
    if (el) replay(el, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    alive = false;
    closePlayer();
    closeAdder();
    for (const dispose of holds) dispose();
    for (const ac of fetches) ac.abort();
    fetches.clear();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('message', onMessage);
  });
}

const game: GameModule = { ...meta, start };
export default game;
