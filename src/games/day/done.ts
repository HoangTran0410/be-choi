import { h, replay } from '../../core/dom';
import type { Env } from './env';

/** After the last bit of play, wait this long with no touch before moving on by itself. */
export const AUTO_MS = 6000;
/** Pause between pressing ✓ (or the timer) and handing back to the day, so it can wave goodbye. */
export const LEAVE_MS = 700;

export interface Finisher {
  /**
   * The job has everything it needs. Shows the big ✓ and starts the slow countdown; play goes on
   * as normal. Calling it again is harmless.
   */
  ready(): void;
  /** The child touched something: push the countdown back. */
  touch(): void;
  /** The job is not complete any more (e.g. a garment was taken off): hide ✓, stop the countdown. */
  unready(): void;
}

/**
 * One way for every job to end: a big ✓ the child can press whenever they like, or — slowly,
 * and only if they stop playing — by itself. Nothing is locked while it waits.
 */
export function createFinisher(env: Env): Finisher {
  const { scope, ctx } = env;
  const ok = h('button', { class: 'day-ok', type: 'button', 'aria-label': 'Xong rồi', hidden: true }, '✓');
  env.host.append(ok);
  let isReady = false;
  let leaving = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  scope.own(stopTimer);

  function leave(): void {
    if (leaving || !isReady) return;
    leaving = true;
    stopTimer();
    ctx.hint.clear();
    ctx.audio.fx('sparkle');
    ok.classList.add('pressed');
    env.host.classList.add('leaving');
    scope.later(() => env.finish(), LEAVE_MS);
  }
  function arm(): void {
    stopTimer();
    if (!isReady || leaving) return;
    timer = setTimeout(leave, AUTO_MS);
  }
  scope.tap(ok, leave, 0);

  return {
    ready() {
      if (leaving) return;
      if (!isReady) {
        isReady = true;
        ok.hidden = false;
        replay(ok, 'anim-bounce');
        ctx.hint.clear();
      }
      arm();
    },
    touch() {
      if (isReady && !leaving) arm();
    },
    unready() {
      if (leaving) return;
      isReady = false;
      ok.hidden = true;
      stopTimer();
    },
  };
}
