import { hitTest, makeDraggable, type DragOptions } from '../../core/drag';
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
  drag(el: HTMLElement, opts: DragOptions): void;
  /**
   * A piece that can be dropped on `target` or simply tapped. A drop elsewhere springs
   * back; nothing is ever wrong, so `act` decides what happens.
   */
  piece(el: HTMLElement, target: () => Element | null, act: () => void): void;
  dispose(): void;
}

/** A press that moves less than this is a tap, not a drag. */
const TAP_PX = 10;
/** How far outside the target a drop still counts. */
const SLACK = 28;

export function createScope(): Scope {
  let open = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const disposers: Array<() => void> = [];

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
    drag(el, opts) {
      if (open) disposers.push(makeDraggable(el, opts));
    },
    piece(el, target, act) {
      if (!open) return;
      let sx = 0;
      let sy = 0;
      let lastDrop = -Infinity;
      const down = (e: PointerEvent): void => {
        sx = e.clientX;
        sy = e.clientY;
      };
      const click = (): void => {
        // A drag or a tap already acted on pointer-up; the click that follows is the same gesture.
        if (open && Date.now() - lastDrop > 500) act();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('click', click);
      const stop = makeDraggable(el, {
        onDrop(_el, p) {
          lastDrop = Date.now();
          const t = target();
          const tap = Math.hypot(p.x - sx, p.y - sy) < TAP_PX;
          if (open && (tap || (t && hitTest(p, [{ id: 't', rect: t.getBoundingClientRect() }], SLACK) === 't'))) act();
          return false;
        },
      });
      disposers.push(() => {
        el.removeEventListener('pointerdown', down);
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
