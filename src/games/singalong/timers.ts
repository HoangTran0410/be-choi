/** A bag of timeouts that can all be dropped at once: when a mode is left, or the game is. */
export interface Timers {
  /** Run `fn` after `ms`. Returns a function that cancels it. */
  after(ms: number, fn: () => void): () => void;
  /** Cancel everything still waiting. */
  clear(): void;
}

export function createTimers(): Timers {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  return {
    after(ms, fn) {
      const t = setTimeout(() => {
        pending.delete(t);
        fn();
      }, ms);
      pending.add(t);
      return () => {
        clearTimeout(t);
        pending.delete(t);
      };
    },
    clear() {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    },
  };
}
