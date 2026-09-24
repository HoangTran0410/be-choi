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
  PLAYER_SANDBOX,
  clampTime,
  formatTime,
  posterUrl,
  seekMessage,
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
/** Sideways, the controls fade after this long without a touch while a video plays. */
const IDLE_MS = 3000;
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
    emoji: string;
    /** Names this player in the listening handshake. */
    id: string;
    playBtn: HTMLElement;
    soundBtn: HTMLElement;
    /** Our poster over a paused player, and the plug that closes the shield's hole. */
    poster: HTMLElement;
    plug: HTMLElement;
    isPlaying: boolean;
    muted: boolean;
    /** The player has spoken at least once, so the handshake can stop. */
    heard: boolean;
    /** The player has said it is playing at least once: from then on it can be resumed from here. */
    played: boolean;
    /** The poster is up, and stays up until the player says it is playing again. */
    posterUp: boolean;
    /** Seconds, as last reported (or last sought to). 0 duration: not known yet. */
    currentTime: number;
    duration: number;
    live: boolean;
    /** A finger is on the seek bar: the bar follows it, not the player. */
    dragging: boolean;
    seek: HTMLElement;
    fill: HTMLElement;
    knob: HTMLElement;
    time: HTMLElement;
    jumps: HTMLElement[];
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
      openPlayer(ref, emoji);
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
  /** What ⏪ and ⏩ skip, in seconds. */
  const JUMP_S = 10;

  /**
   * Sideways, the controls lie over the bottom of the picture (style.css); while a
   * video plays untouched they fade away after a moment so the picture has the whole
   * screen, and any touch on the player brings them back. Paused, or mid-drag on the
   * seek bar, they stay.
   */
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  function wake(): void {
    player?.classList.remove('vd-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (playing?.isPlaying && !playing.posterUp && !playing.dragging) player?.classList.add('vd-idle');
    }, IDLE_MS);
  }

  function closePlayer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
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
    playing.poster.hidden = !playing.posterUp;
    playing.plug.hidden = !playing.played;
    // Nothing to seek along until the length is known, nor ever on a live stream.
    const seekable = canSeek();
    playing.seek.hidden = !seekable;
    for (const b of playing.jumps) b.hidden = !seekable;
    if (seekable && !playing.dragging) showTime(playing.currentTime);
    // Stopped: nothing should hide. Playing again: start counting down to hiding.
    if (!playing.isPlaying || playing.posterUp) {
      player?.classList.remove('vd-idle');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    } else if (!idleTimer && !player?.classList.contains('vd-idle')) {
      wake();
    }
  }

  function canSeek(): boolean {
    return !!playing && !playing.live && playing.duration > 0 && !!playing.frame.querySelector('iframe');
  }

  /** Put the bar's fill and knob at `t` seconds, and say it in numbers. */
  function showTime(t: number): void {
    if (!playing) return;
    const pct = playing.duration > 0 ? (clampTime(t, playing.duration) / playing.duration) * 100 : 0;
    playing.fill.style.width = `${pct}%`;
    playing.knob.style.left = `${pct}%`;
    const total = formatTime(playing.duration);
    playing.time.textContent = `${formatTime(t)} / ${total}`;
    // As wide as it will ever get, so the bar beside it does not twitch as the seconds tick.
    playing.time.style.minWidth = `${total.length * 2 + 3}ch`;
  }

  function seekTo(t: number): void {
    if (!playing || !canSeek()) return;
    const to = clampTime(t, playing.duration);
    playing.frame.querySelector('iframe')?.contentWindow?.postMessage(seekMessage(to), PLAYER_ORIGIN);
    // Move at once; the player's next report confirms it.
    playing.currentTime = to;
    syncButtons();
  }

  /**
   * The seek bar: tap anywhere to jump there, or drag the knob and let go. The
   * pointer is captured, so a finger sliding off the bar keeps scrubbing, and
   * the jump happens once, on release, instead of dozens of seeks mid-drag.
   */
  function seekBar(): { seek: HTMLElement; fill: HTMLElement; knob: HTMLElement; time: HTMLElement } {
    const fill = h('span', { class: 'vd-fill' });
    const knob = h('span', { class: 'vd-knob' });
    const track = h('div', { class: 'vd-track', role: 'slider', 'aria-label': 'Tua video' }, h('span', { class: 'vd-rail' }, fill), knob);
    const time = h('span', { class: 'vd-time' });
    const seek = h('div', { class: 'vd-seek', hidden: true }, track, time);
    /** Measured once per touch: the time label may change width mid-drag and move the bar under the finger. */
    let rect: DOMRect | null = null;
    const at = (e: PointerEvent) => {
      const r = rect ?? track.getBoundingClientRect();
      const f = r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0;
      return f * (playing?.duration ?? 0);
    };
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!playing || !canSeek()) return;
      playing.dragging = true;
      rect = track.getBoundingClientRect();
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer (tests, old browsers): dragging still works while it stays on the bar */
      }
      showTime(at(e));
    });
    track.addEventListener('pointermove', (e) => {
      if (playing?.dragging) showTime(at(e));
    });
    track.addEventListener('pointerup', (e) => {
      if (!playing?.dragging) return;
      playing.dragging = false;
      const t = at(e);
      rect = null;
      seekTo(t);
    });
    track.addEventListener('pointercancel', () => {
      if (!playing?.dragging) return;
      playing.dragging = false;
      rect = null;
      syncButtons();
    });
    return { seek, fill, knob, time };
  }

  function send(func: PlayerCommand): void {
    playing?.frame.querySelector('iframe')?.contentWindow?.postMessage(commandMessage(func), PLAYER_ORIGIN);
  }

  /**
   * See-through strips over the player's edges that take every touch. Even with
   * YouTube's controls off, the embed still carries its title, channel, logo and
   * "Watch on YouTube" links, and one tap on any of them leaves the game for
   * the YouTube app and its endless next video. Under the strips none of that
   * can be reached. The middle stays open (`SHIELD_HOLE`) until the video has
   * played once: a real tap there is what iOS needs to start it with sound, and
   * there is nothing else there. After that the plug closes the hole, since the
   * game's own buttons can resume it from then on.
   *
   * The iframe's sandbox is the second lock: should anything still be pressed,
   * the browser will not open a new tab or take the app away to YouTube.
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

  function plug(): HTMLElement {
    const el = h('div', { class: 'vd-shield vd-plug', 'aria-hidden': 'true', 'data-side': 'centre', hidden: true });
    swallow(el);
    return el;
  }

  /**
   * A paused YouTube player fills with "more videos" — a strip of other
   * thumbnails the child did not choose. Once the video has played, a pause
   * brings up our own cover instead: the video's picture and one big ▶.
   */
  function poster(ref: YouTubeRef, emoji: string): HTMLElement {
    const el = h(
      'button',
      { class: 'vd-poster', type: 'button', 'aria-label': 'Phát', hidden: true },
      h('span', { class: 'vd-emoji' }, emoji),
    );
    if (ref.video) {
      const img = h('img', { src: posterUrl(ref.video), alt: '', decoding: 'async', draggable: 'false' });
      img.addEventListener('error', () => img.remove());
      el.append(img);
    }
    el.append(h('span', { class: 'vd-poster-play' }, '▶'));
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!playing) return;
      // The poster stays until the player says it is playing, so the strip under it never shows.
      send('playVideo');
      playing.isPlaying = true;
      syncButtons();
    });
    return el;
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
      sandbox: PLAYER_SANDBOX,
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
    const session = playing;
    if (session) {
      session.plug = plug();
      session.poster = poster(ref, session.emoji);
    }
    frame.replaceChildren(iframe, ...shield(), ...(session ? [session.plug, session.poster] : []));
    if (session) {
      session.isPlaying = true;
      session.played = false;
      session.posterUp = false;
      session.currentTime = 0;
      session.duration = 0;
      session.live = false;
      // Only the player knows whether the browser let it keep its sound; 🔊 waits for it to say it did not.
      session.muted = false;
    }
    syncButtons();
  }

  function openPlayer(ref: YouTubeRef, emoji: string): void {
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
      if (!playing.isPlaying && playing.played) playing.posterUp = true;
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
    const jump = (by: number, label: string, face: string) => {
      const b = h('button', { class: 'btn-round vd-jump', type: 'button', 'aria-label': label, hidden: true }, face);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (playing) seekTo(playing.currentTime + by);
      });
      return b;
    };
    const back = jump(-JUMP_S, 'Lùi 10 giây', '⏪');
    const fwd = jump(JUMP_S, 'Tới 10 giây', '⏩');
    const bar = seekBar();
    player = h(
      'div',
      { class: 'vd-player' },
      h('div', { class: 'vd-screen' }, frame),
      close,
      h('div', { class: 'vd-controls' }, bar.seek, h('div', { class: 'vd-buttons' }, back, playBtn, fwd, soundBtn)),
    );
    playing = {
      frame,
      ref,
      emoji,
      id: `vd-${++sessions}`,
      playBtn,
      soundBtn,
      poster: h('div'),
      plug: h('div'),
      isPlaying: true,
      muted: false,
      heard: false,
      played: false,
      posterUp: false,
      currentTime: 0,
      duration: 0,
      live: false,
      dragging: false,
      ...bar,
      jumps: [back, fwd],
      hello: null,
    };
    // Capture: the shield swallows its touches, but this sees them first.
    player.addEventListener('pointerdown', wake, { capture: true });
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
    if (news.playing !== undefined) {
      playing.isPlaying = news.playing;
      if (news.playing) {
        playing.played = true;
        playing.posterUp = false;
      } else if (playing.played) {
        playing.posterUp = true;
      }
    }
    if (news.muted !== undefined) playing.muted = news.muted;
    if (news.currentTime !== undefined) playing.currentTime = news.currentTime;
    if (news.duration !== undefined) playing.duration = news.duration;
    if (news.live !== undefined) playing.live = news.live;
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
