import { createDragDrop, pickTarget, type DragDrop } from '../../core/dragdrop';
import { makeTappable } from '../../core/tap';

/**
 * Everything one scene (the whole game, or one job inside it) starts — timers, listeners,
 * drags — so that closing the scene stops all of it in one call.
 */
export interface Scope {
  alive(): boolean;
  later(fn: () => void, ms: number): void;
  /** Run `fn` when the scope closes. */
  own(fn: () => void): void;
  tap(el: HTMLElement, fn: () => void, cooldownMs?: number): void;
  /**
   * A piece that can be dropped on `target` or simply tapped. A drop elsewhere springs
   * back; nothing is ever wrong, so `act` decides what happens.
   */
  piece(el: HTMLElement, target: () => Element | null, act: () => void): void;
  dispose(): void;
}

/** How far outside the target a drop still counts. */
const SLACK = 28;

/** `layer` is where a picked-up piece's copy floats: the play area (default: the page). */
export function createScope(layer?: HTMLElement): Scope {
  let open = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const disposers: Array<() => void> = [];
  let dd: DragDrop<() => void> | null = null;
  let lastGesture = -Infinity;
  /** Where the piece being picked up may land; set by the piece's `getSrc` just before a pick-up. */
  let aim: (() => Element | null) | null = null;

  /** One shared drag-and-drop for every piece of the scene: a light copy follows the finger on its own layer. */
  function dnd(): DragDrop<() => void> {
    if (dd) return dd;
    const made = createDragDrop<() => void>({
      layer: layer ?? document.body,
      // Measured once at pick-up, never while the finger moves.
      targets: () => {
        const t = aim?.();
        if (!t) return [];
        const r = t.getBoundingClientRect();
        return [{ id: 't', rect: { left: r.left - SLACK, top: r.top - SLACK, width: r.width + SLACK * 2, height: r.height + SLACK * 2 } }];
      },
      resolve: (p, t) => pickTarget(p, t),
      ghost: (_act, el) => {
        const g = el.cloneNode(true) as HTMLElement;
        g.setAttribute('aria-hidden', 'true');
        g.removeAttribute('aria-label');
        g.classList.remove('anim-wiggle', 'anim-bounce', 'anim-pulse', 'anim-pop', 'anim-shake');
        return g;
      },
      onTap: (act) => act(),
      // However a pointer gesture ends (tap, drop, missed drop, cancel), the click that follows is part of it.
      onEnd: () => {
        lastGesture = Date.now();
      },
      // Nothing is wrong here: a piece let go anywhere else simply glides back.
      onDrop: (act, hit) => {
        if (hit === null) return false;
        act();
        return true;
      },
    });
    dd = made;
    disposers.push(() => made.dispose());
    return made;
  }

  const scope: Scope = {
    alive: () => open,
    later(fn, ms) {
      if (!open) return;
      const id = setTimeout(() => {
        timers.delete(id);
        if (open) fn();
      }, ms);
      timers.add(id);
    },
    own(fn) {
      if (open) disposers.push(fn);
      else fn();
    },
    tap(el, fn, cooldownMs) {
      if (!open) return;
      disposers.push(makeTappable(el, () => open && fn(), cooldownMs === undefined ? {} : { cooldownMs }));
    },
    piece(el, target, act) {
      if (!open) return;
      /** What a finger's tap or drop does. */
      const run = (): void => {
        if (open) act();
      };
      const click = (): void => {
        // Keyboard and assistive taps arrive as a bare click; right after a pointer gesture it is the same gesture.
        if (open && Date.now() - lastGesture > 500) act();
      };
      el.addEventListener('click', click);
      const stop = dnd().attach(el, () => {
        aim = target;
        return run;
      });
      disposers.push(() => {
        el.removeEventListener('click', click);
        stop();
      });
    },
    dispose() {
      if (!open) return;
      open = false;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      for (const fn of disposers.splice(0).reverse()) fn();
    },
  };
  return scope;
}
