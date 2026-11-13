import { h } from '../core/dom';
import type { AppDeps } from './deps';
import '../styles/parent.css';

/** After this long away from every game the count of play time starts over. */
const AWAY_RESET_MS = 5 * 60_000;
const CHECK_MS = 5000;
const BANNER_MS = 20_000;

/** Parent presets, in minutes (0 = off, the default). */
export const BREAK_PRESETS: readonly number[] = [0, 15, 20, 30, 45];

/** Soft falling lullaby (G4 E4 G4 E4 C4 … ), played quietly on a flute. */
export const LULLABY: readonly [number, number][] = [
  [392, 0],
  [330, 0.6],
  [392, 1.2],
  [330, 1.8],
  [294, 2.4],
  [262, 3.2],
];

export interface BreakTracker {
  /** A game opened. */
  enter(): void;
  /** The game closed (home, album). */
  leave(): void;
  /** True once, when the play time passes the limit; the count then starts over. `limitMin` 0 = never. */
  due(limitMin: number): boolean;
}

/**
 * Counts time spent inside games, not time on the home screen. Pure apart from
 * the clock so it can be tested without waiting.
 */
export function createBreakTracker(now: () => number = Date.now): BreakTracker {
  let played = 0;
  let since: number | null = null;
  let left: number | null = null;

  const flush = () => {
    if (since !== null) {
      played += Math.max(0, now() - since);
      since = now();
    }
  };

  return {
    enter() {
      if (since !== null) return;
      if (left !== null && now() - left > AWAY_RESET_MS) played = 0;
      since = now();
      left = null;
    },
    leave() {
      flush();
      since = null;
      left = now();
    },
    due(limitMin) {
      if (limitMin <= 0) {
        // Off: forget what was counted, so turning it on later starts fresh.
        played = 0;
        if (since !== null) since = now();
        return false;
      }
      flush();
      if (played >= limitMin * 60_000) {
        played = 0;
        return true;
      }
      return false;
    },
  };
}

const tracker = createBreakTracker();

export const BREAK_LINE = 'Bé nghỉ mắt chút nhé!';

/**
 * Optional rest reminder (a parent switches it on in the panel). It never stops the
 * game or takes anything away: a soft voice, a friendly banner, and a big button
 * that just says "play on". Returns a function that stops watching.
 */
export function watchBreaks(deps: AppDeps, host: HTMLElement): () => void {
  tracker.enter();
  let banner: HTMLElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const hide = () => {
    clearTimeout(hideTimer);
    banner?.remove();
    banner = null;
  };

  const show = () => {
    if (banner) return;
    // The little friend yawns and drifts off, a lullaby plays, and that is all:
    // the game under it is untouched and one tap on ▶️ carries on.
    deps.speech.speak(BREAK_LINE);
    LULLABY.forEach(([f, d]) => deps.audio.note(f, 0.9, 'flute', d, 0.35));
    const face = h('span', { class: 'break-emoji' }, '🥱');
    const sleepTimer = setTimeout(() => {
      face.textContent = '😴';
      banner?.classList.add('asleep');
    }, 2500);
    banner = h(
      'div',
      { class: 'break-banner', role: 'status' },
      h('span', { class: 'break-friend' }, '🧸', face),
      h('span', { class: 'break-zzz', 'aria-hidden': 'true' }, '💤'),
      h('button', { class: 'break-ok', type: 'button', 'aria-label': 'Chơi tiếp', onClick: hide }, '▶️'),
    );
    banner.addEventListener('pointerdown', () => clearTimeout(sleepTimer), { once: true });
    host.append(banner);
    hideTimer = setTimeout(hide, BANNER_MS);
  };

  const id = setInterval(() => {
    deps.store.tickPlay();
    if (tracker.due(deps.store.settings().breakMinutes)) show();
  }, CHECK_MS);

  return () => {
    clearInterval(id);
    hide();
    deps.store.endPlay();
    tracker.leave();
  };
}
