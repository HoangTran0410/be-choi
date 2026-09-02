import type { HintScheduler } from './types';

const DEFAULT_MS = 6000;

/** Idle-hint timer: nudges the child when nothing has happened for a while. */
export function createHint(): HintScheduler {
  let fn: (() => void) | null = null;
  let ms = DEFAULT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    stop();
    if (!fn) return;
    timer = setTimeout(() => {
      timer = null;
      fn?.();
      schedule();
    }, ms);
  };

  return {
    arm(next, nextMs = DEFAULT_MS) {
      fn = next;
      ms = nextMs;
      schedule();
    },
    touch() {
      if (fn) schedule();
    },
    clear() {
      fn = null;
      stop();
    },
  };
}
