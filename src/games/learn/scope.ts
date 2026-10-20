/**
 * Timers that belong to one screen. Leaving the screen (or the game) clears them all, and a
 * timer that fires late checks it is still wanted. Scopes nest: disposing a parent disposes
 * its children.
 */
export interface Scope {
  alive(): boolean;
  /** Run `fn` after `ms` unless the scope was disposed. Returns a function that cancels it. */
  later(fn: () => void, ms: number): () => void;
  /** Register work to run when the scope is disposed. */
  onDispose(fn: () => void): void;
  child(): Scope;
  dispose(): void;
}

export function createScope(): Scope {
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cleanups: Array<() => void> = [];
  const scope: Scope = {
    alive: () => alive,
    later(fn, ms) {
      if (!alive) return () => undefined;
      const t = setTimeout(() => {
        timers.delete(t);
        if (alive) fn();
      }, ms);
      timers.add(t);
      return () => {
        clearTimeout(t);
        timers.delete(t);
      };
    },
    onDispose(fn) {
      if (alive) cleanups.push(fn);
      else fn();
    },
    child() {
      const c = createScope();
      scope.onDispose(() => c.dispose());
      return c;
    },
    dispose() {
      if (!alive) return;
      alive = false;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn();
        } catch (err) {
          console.error(err);
        }
      }
    },
  };
  return scope;
}
