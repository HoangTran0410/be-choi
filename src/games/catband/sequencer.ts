/**
 * A tiny clock for music: run things at moments counted from one origin, off a
 * single timer. Each event is due at `origin + ms` however late the one before it
 * ran, so a song does not drift the way a chain of `setTimeout(step, 500)` does,
 * and the band and the melody stay together.
 */
export interface Sequencer {
  /** Milliseconds since the origin. */
  now(): number;
  /** Run `fn` at `ms` after the origin (at once if that has passed). `tag` lets a group be cancelled. */
  at(ms: number, fn: () => void, tag?: string): void;
  /** Forget everything not yet run, or just what carries `tag`. */
  clear(tag?: string): void;
  /** Forget everything and stop the timer. */
  stop(): void;
}

interface Item {
  ms: number;
  fn: () => void;
  tag: string;
}

/** Anything due within this many ms runs now: one timer wake-up plays a whole chord. */
const SLACK_MS = 2;

export function createSequencer(clock: () => number = () => Date.now()): Sequencer {
  const origin = clock();
  let queue: Item[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const now = () => clock() - origin;

  function arm(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const next = queue[0];
    if (stopped || !next) return;
    timer = setTimeout(run, Math.max(0, next.ms - now()));
  }

  function run(): void {
    timer = null;
    while (!stopped && queue.length > 0 && (queue[0] as Item).ms <= now() + SLACK_MS) {
      const item = queue.shift() as Item;
      try {
        item.fn();
      } catch (err) {
        // One bad note must not silence the band.
        console.error(err);
      }
    }
    arm();
  }

  return {
    now,
    at(ms, fn, tag = '') {
      if (stopped) return;
      const item: Item = { ms, fn, tag };
      let i = queue.length;
      while (i > 0 && (queue[i - 1] as Item).ms > ms) i--;
      queue.splice(i, 0, item);
      if (i === 0) arm();
    },
    clear(tag) {
      queue = tag === undefined ? [] : queue.filter((q) => q.tag !== tag);
      arm();
    },
    stop() {
      stopped = true;
      queue = [];
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
