/**
 * Shared drag-and-drop for small hands, built on Pointer Events only (touch devices get no `click`
 * and `main.ts` cancels `touchstart`/`touchmove` inside `.stage`, so nothing else would arrive).
 *
 * What a game gets for free:
 *  - tap vs drag: a finger that wanders less than `slop` px is a tap (and, if asked, a *hold*);
 *  - a "ghost" copy follows the finger. It is moved with `transform` on its own compositor layer
 *    (`will-change`), once per animation frame, with NO layout read while moving: pointer rects
 *    are measured once at pick-up. This is what keeps a busy stage at 60 fps on a tablet;
 *  - the nearest target wins: a drop that misses every target by a little still lands on the
 *    closest one (`pickTarget`), and the target under the finger is reported live (`onHover`);
 *  - a source inside a scroller (a shelf) tells a sideways swipe (scrolls the shelf by hand) from a
 *    pick-up (anything else), because the page's `touchmove` cancel disables native panning;
 *  - the container scrolls by itself when the ghost nears its edge (`autoScroll`);
 *  - a drop the game refuses, or a `pointercancel`, glides the ghost back to where it came from;
 *  - safe on lost pointers: listeners live on `window` so a removed element cannot strand the drag;
 *    a mouse that was released outside the window ends the drag; `blur` / page hidden cancel it;
 *  - `dispose()` (or `ctx.onCleanup`) removes every listener, timer, frame callback and ghost.
 *
 * `core/drag.ts` (`makeDraggable`, `hitTest`) stays for the older games that move the real element.
 */
import { hitTest, type Pt, type RectLike, type Target } from './drag';
import { onFrame } from './frame';

// ---- pure logic (tested without a DOM) ------------------------------------------------------

/** How far a finger may wander and still be tapping (px). Generous: toddlers wobble. */
export const DEFAULT_SLOP = 12;
/** Edge band (px) in which the ghost makes a container scroll. */
export const DEFAULT_EDGE_ZONE = 56;
/** Fastest edge scroll (px per frame). */
export const DEFAULT_EDGE_SPEED = 14;

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** True once a finger has gone `slop` px or more from where it landed. */
export function pastSlop(start: Pt, p: Pt, slop = DEFAULT_SLOP): boolean {
  return distance(start, p) >= slop;
}

const inRect = (p: Pt, r: RectLike, pad = 0): boolean =>
  p.x >= r.left - pad && p.x <= r.left + r.width + pad && p.y >= r.top - pad && p.y <= r.top + r.height + pad;

export interface PickOptions {
  /** Grow every target by this many px for the exact test. Default 0. */
  tolerance?: number;
  /**
   * When no target is under the point but the point is inside this region (grown by `pad`), take
   * the target whose centre is nearest. This is the forgiving drop.
   */
  nearestWithin?: RectLike;
  pad?: number;
  /** With no region: take the nearest target if its centre is at most this far (px). */
  maxDistance?: number;
}

/**
 * The target a release at `p` lands on. First the targets that really contain `p` (grown by
 * `tolerance`; when several overlap, the one whose centre is nearest), then — if allowed — the
 * nearest one. `null` when nothing is close enough.
 */
export function pickTarget(p: Pt, targets: readonly Target[], opts: PickOptions = {}): string | null {
  const tol = opts.tolerance ?? 0;
  const hits = targets.filter((t) => hitTest(p, [t], tol) !== null);
  if (hits.length === 1) return hits[0]!.id;
  if (hits.length > 1) return nearestId(p, hits);
  if (targets.length === 0) return null;
  if (opts.nearestWithin) {
    return inRect(p, opts.nearestWithin, opts.pad ?? 0) ? nearestId(p, targets) : null;
  }
  if (opts.maxDistance !== undefined) {
    const id = nearestId(p, targets);
    const t = targets.find((x) => x.id === id)!;
    return distance(p, centerOfRect(t.rect)) <= opts.maxDistance ? id : null;
  }
  return null;
}

export function centerOfRect(r: RectLike): Pt {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function nearestId(p: Pt, targets: readonly Target[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const c = centerOfRect(t.rect);
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}

export type Intent = 'pending' | 'scroll' | 'drag';

/**
 * A finger that started on something inside a scroller, `dx`/`dy` px from where it landed: still
 * undecided, a swipe along the scroll `axis` (scroll it), or anything else (pick the thing up).
 * If the scroller has nowhere to go (`canScroll` false) every move is a pick-up.
 */
export function intentOf(dx: number, dy: number, axis: 'x' | 'y', canScroll: boolean, slop = DEFAULT_SLOP): Intent {
  if (Math.hypot(dx, dy) < slop) return 'pending';
  if (!canScroll) return 'drag';
  const along = Math.abs(axis === 'x' ? dx : dy);
  const across = Math.abs(axis === 'x' ? dy : dx);
  return along > across * 1.25 ? 'scroll' : 'drag';
}

/**
 * How fast (px per frame, signed) a container should scroll while the pointer is at `pos` along
 * an axis whose visible span is `min`..`max`. Zero in the middle, growing toward the edges.
 */
export function edgeSpeed(pos: number, min: number, max: number, zone = DEFAULT_EDGE_ZONE, maxSpeed = DEFAULT_EDGE_SPEED): number {
  const span = max - min;
  if (!(span > 0)) return 0;
  const z = Math.min(zone, span / 2);
  if (pos < min + z) return -maxSpeed * Math.min(1, (min + z - pos) / z);
  if (pos > max - z) return maxSpeed * Math.min(1, (pos - (max - z)) / z);
  return 0;
}

/** `scrollLeft`/`scrollTop` after moving by `delta`, kept inside `0..maxScroll`. */
export function clampScroll(current: number, delta: number, maxScroll: number): number {
  return Math.min(Math.max(0, maxScroll), Math.max(0, current + delta));
}

// ---- the controller --------------------------------------------------------------------------

export interface AutoScroll {
  el: HTMLElement;
  axis?: 'x' | 'y' | 'both';
  zone?: number;
  maxSpeed?: number;
}

export interface DragDropOptions<S> {
  /** The ghost floats in this element. It must be `position: relative/absolute/fixed` and cover the play area. */
  layer: HTMLElement;
  /** Where the drop places are on screen. Read once at pick-up (and again after an auto-scroll), never per move. */
  targets(): Target[];
  /** Which target a point means. Default: exact hit with 8 px tolerance, no nearest fallback. */
  resolve?(p: Pt, targets: readonly Target[]): string | null;
  /** A copy of what is being carried. Make it light (a static picture, not a live figure). */
  ghost(src: S, el: HTMLElement): HTMLElement;
  slop?: number;
  /** A still finger for this long counts as a hold (ms). 0 or undefined: no hold for that source. */
  holdMs?(src: S): number;
  onTap?(src: S, el: HTMLElement): void;
  onHold?(src: S, el: HTMLElement): void;
  /** A hold is building (true) or ended (false), for the "squeeze" look. */
  onHolding?(src: S, on: boolean): void;
  onPickUp?(src: S, el: HTMLElement): void;
  /** The target under the finger changed (`null` = none). */
  onHover?(id: string | null, src: S): void;
  /**
   * Released. `hit` is the resolved target. Return `false` to refuse: the ghost glides back to
   * where it came from. Anything else accepts (the ghost just goes away).
   */
  onDrop(src: S, hit: string | null, el: HTMLElement, p: Pt): boolean | void;
  /** The drag was cancelled (the system took the pointer). The ghost glides back. */
  onCancel?(src: S, el: HTMLElement): void;
  /** Called whenever a pick-up ends, however it ends. */
  onEnd?(src: S, el: HTMLElement): void;
  /** Scroll this container when the ghost nears its edge. */
  autoScroll?: AutoScroll;
  /** Unregister when the child leaves the game. */
  ctx?: { onCleanup(fn: () => void): void };
}

export interface AttachOptions {
  /** The element is inside this scroller: a swipe along `axis` scrolls it by hand instead of picking up. */
  scroller?: { el: HTMLElement; axis: 'x' | 'y' };
}

export interface DragDrop<S> {
  attach(el: HTMLElement, src: () => S | null, opts?: AttachOptions): () => void;
  /** Is something being carried right now? */
  readonly active: boolean;
  dispose(): void;
}

const GLIDE_MS = 220;
/** How far past a scroller's edge (across its axis) a swipe turns into a pick-up (px). */
const LEAVE_PAD = 4;

interface Session<S> {
  el: HTMLElement;
  src: S;
  pointerId: number;
  pointerType: string;
  start: Pt;
  last: Pt;
  dirty: boolean;
  mode: Intent;
  hold: ReturnType<typeof setTimeout> | null;
  ghost: HTMLElement | null;
  half: Pt;
  corner: Pt;
  targets: Target[];
  hover: string | null;
  scrollFrom: number;
  scroller: AttachOptions['scroller'];
  /** The scroller's box, read once when the finger lands. */
  scrollBox: RectLike | null;
  stopFrame: (() => void) | null;
  box: RectLike | null;
}

export function createDragDrop<S>(opts: DragDropOptions<S>): DragDrop<S> {
  const slop = opts.slop ?? DEFAULT_SLOP;
  const resolve = opts.resolve ?? ((p: Pt, t: readonly Target[]) => pickTarget(p, t, { tolerance: 8 }));
  const detachers = new Set<() => void>();
  const glides = new Set<{ ghost: HTMLElement; timer: ReturnType<typeof setTimeout> }>();
  let s: Session<S> | null = null;
  let disposed = false;

  const onWinMove = (e: PointerEvent): void => {
    if (!s || e.pointerId !== s.pointerId) return;
    // A mouse released outside the window never sent pointerup: a move with no button is the end.
    if (s.pointerType === 'mouse' && e.buttons === 0) {
      release(e, false);
      return;
    }
    move(e);
  };
  const onWinUp = (e: PointerEvent): void => {
    if (!s || e.pointerId !== s.pointerId) return;
    release(e, false);
  };
  const onWinCancel = (e: PointerEvent): void => {
    if (!s || e.pointerId !== s.pointerId) return;
    release(e, true);
  };
  const onAbort = (): void => {
    if (s) abort();
  };
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') onAbort();
  };

  function listen(on: boolean): void {
    const f = on ? window.addEventListener.bind(window) : window.removeEventListener.bind(window);
    f('pointermove', onWinMove as EventListener);
    f('pointerup', onWinUp as EventListener);
    f('pointercancel', onWinCancel as EventListener);
    f('blur', onAbort);
    f('resize', onResize);
    if (typeof document !== 'undefined')
      (on ? document.addEventListener : document.removeEventListener).call(document, 'visibilitychange', onHide);
  }

  function onResize(): void {
    if (s?.mode === 'drag') measure(s);
  }

  /** Read every rect we need, once: layer, source, scroller, targets. Nothing is read per move. */
  function measure(a: Session<S>): void {
    a.targets = opts.targets();
    if (opts.autoScroll) {
      const r = opts.autoScroll.el.getBoundingClientRect();
      a.box = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }

  function begin(a: Session<S>): void {
    // The finger has gone far enough: pick it up.
    a.mode = 'drag';
    if (a.hold) clearTimeout(a.hold);
    a.hold = null;
    opts.onHolding?.(a.src, false);
    const g = opts.ghost(a.src, a.el);
    const box = a.el.getBoundingClientRect();
    const layerBox = opts.layer.getBoundingClientRect();
    Object.assign(g.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${box.width.toFixed(1)}px`,
      height: `${box.height.toFixed(1)}px`,
      pointerEvents: 'none',
      zIndex: '40',
      // Its own layer: moving it never repaints the stage underneath.
      willChange: 'transform',
      contain: 'layout style',
      transition: 'none',
    });
    g.classList.add('dd-ghost');
    opts.layer.append(g);
    a.half = { x: box.width / 2, y: box.height / 2 };
    a.corner = { x: layerBox.left, y: layerBox.top };
    a.ghost = g;
    a.el.classList.add('is-carried');
    measure(a);
    a.dirty = true;
    a.stopFrame = onFrame(() => tick(a));
    opts.onPickUp?.(a.src, a.el);
    placeGhost(a);
  }

  function placeGhost(a: Session<S>): void {
    if (!a.ghost) return;
    const x = a.last.x - a.corner.x - a.half.x;
    const y = a.last.y - a.corner.y - a.half.y;
    a.ghost.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1.12)`;
  }

  /** One animation frame of a pick-up: follow the finger, auto-scroll, report the target under it. */
  function tick(a: Session<S>): void {
    if (s !== a || a.mode !== 'drag') return;
    const cfg = opts.autoScroll;
    if (cfg && a.box) {
      const axis = cfg.axis ?? 'x';
      let moved = false;
      if (axis !== 'y') {
        const v = edgeSpeed(a.last.x, a.box.left, a.box.left + a.box.width, cfg.zone, cfg.maxSpeed);
        if (v !== 0) {
          const next = clampScroll(cfg.el.scrollLeft, v, cfg.el.scrollWidth - cfg.el.clientWidth);
          if (next !== cfg.el.scrollLeft) {
            cfg.el.scrollLeft = next;
            moved = true;
          }
        }
      }
      if (axis !== 'x') {
        const v = edgeSpeed(a.last.y, a.box.top, a.box.top + a.box.height, cfg.zone, cfg.maxSpeed);
        if (v !== 0) {
          const next = clampScroll(cfg.el.scrollTop, v, cfg.el.scrollHeight - cfg.el.clientHeight);
          if (next !== cfg.el.scrollTop) {
            cfg.el.scrollTop = next;
            moved = true;
          }
        }
      }
      if (moved) {
        a.targets = opts.targets();
        a.dirty = true;
      }
    }
    if (!a.dirty) return;
    a.dirty = false;
    placeGhost(a);
    const id = resolve(a.last, a.targets);
    if (id !== a.hover) {
      a.hover = id;
      opts.onHover?.(id, a.src);
    }
  }

  function move(e: PointerEvent): void {
    const a = s;
    if (!a) return;
    const p = { x: e.clientX, y: e.clientY };
    a.last = p;
    if (a.mode === 'pending') {
      const dx = p.x - a.start.x;
      const dy = p.y - a.start.y;
      if (a.scroller) {
        const sc = a.scroller;
        const canScroll = sc.axis === 'x' ? sc.el.scrollWidth > sc.el.clientWidth + 1 : sc.el.scrollHeight > sc.el.clientHeight + 1;
        const intent = intentOf(dx, dy, sc.axis, canScroll, slop);
        if (intent === 'pending') return;
        if (intent === 'scroll') {
          a.mode = 'scroll';
          if (a.hold) clearTimeout(a.hold);
          a.hold = null;
          opts.onHolding?.(a.src, false);
          a.scrollFrom = sc.axis === 'x' ? sc.el.scrollLeft : sc.el.scrollTop;
        } else {
          begin(a);
          return;
        }
      } else {
        if (!pastSlop(a.start, p, slop)) return;
        begin(a);
        return;
      }
    }
    if (a.mode === 'scroll' && a.scroller) {
      const sc = a.scroller;
      // A swipe that leaves the scroller across its axis is a pick-up after all: pull a robot up out of
      // the shelf at any angle, even a shallow one, and it comes with you.
      const b = a.scrollBox;
      if (b) {
        const out =
          sc.axis === 'x'
            ? p.y < b.top - LEAVE_PAD || p.y > b.top + b.height + LEAVE_PAD
            : p.x < b.left - LEAVE_PAD || p.x > b.left + b.width + LEAVE_PAD;
        if (out) {
          begin(a);
          return;
        }
      }
      if (sc.axis === 'x') sc.el.scrollLeft = clampScroll(a.scrollFrom, -(p.x - a.start.x), sc.el.scrollWidth - sc.el.clientWidth);
      else sc.el.scrollTop = clampScroll(a.scrollFrom, -(p.y - a.start.y), sc.el.scrollHeight - sc.el.clientHeight);
      return;
    }
    a.dirty = true; // the next frame moves the ghost
  }

  /** Tear the session down. Returns it so the caller can finish the story (tap, drop, glide). */
  function close(): Session<S> | null {
    const a = s;
    if (!a) return null;
    s = null;
    listen(false);
    if (a.hold) clearTimeout(a.hold);
    a.hold = null;
    a.stopFrame?.();
    a.stopFrame = null;
    try {
      a.el.releasePointerCapture?.(a.pointerId);
    } catch {
      /* already released, or not a real pointer (tests) */
    }
    a.el.classList.remove('is-carried');
    return a;
  }

  function release(e: PointerEvent, cancelled: boolean): void {
    const a = s;
    if (!a) return;
    const p = { x: e.clientX, y: e.clientY };
    const wasHolding = a.mode === 'pending';
    const mode = a.mode;
    const hit = mode === 'drag' && !cancelled ? resolve(p, a.targets) : null;
    close();
    if (mode === 'drag') {
      if (a.hover !== null) opts.onHover?.(null, a.src);
      if (cancelled) {
        glideBack(a);
        opts.onCancel?.(a.src, a.el);
      } else {
        const keep = opts.onDrop(a.src, hit, a.el, p);
        if (keep === false) glideBack(a);
        else a.ghost?.remove();
      }
    } else {
      if (wasHolding) opts.onHolding?.(a.src, false);
      if (mode === 'pending' && !cancelled) opts.onTap?.(a.src, a.el);
    }
    opts.onEnd?.(a.src, a.el);
  }

  /** Abort without a drop (blur, page hidden): same as a cancel. */
  function abort(): void {
    const a = s;
    if (!a) return;
    release({ clientX: a.last.x, clientY: a.last.y, pointerId: a.pointerId } as PointerEvent, true);
  }

  function glideBack(a: Session<S>): void {
    const g = a.ghost;
    if (!g) return;
    let to: Pt | null = null;
    try {
      const r = a.el.getBoundingClientRect();
      to = { x: r.left - a.corner.x, y: r.top - a.corner.y };
    } catch {
      to = null;
    }
    if (!to || !a.el.isConnected) {
      g.remove();
      return;
    }
    g.style.transition = `transform ${GLIDE_MS}ms ease-out, opacity ${GLIDE_MS}ms`;
    g.style.transform = `translate3d(${to.x.toFixed(1)}px, ${to.y.toFixed(1)}px, 0) scale(1)`;
    const entry = {
      ghost: g,
      timer: setTimeout(() => {
        g.remove();
        glides.delete(entry);
      }, GLIDE_MS + 40),
    };
    glides.add(entry);
  }

  function attach(el: HTMLElement, getSrc: () => S | null, ao: AttachOptions = {}): () => void {
    const down = (e: PointerEvent): void => {
      if (disposed || s) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.isPrimary === false) return;
      const src = getSrc();
      if (src === null || src === undefined) return;
      const start = { x: e.clientX, y: e.clientY };
      s = {
        el,
        src,
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'mouse',
        start,
        last: start,
        dirty: false,
        mode: 'pending',
        hold: null,
        ghost: null,
        half: { x: 0, y: 0 },
        corner: { x: 0, y: 0 },
        targets: [],
        hover: null,
        scrollFrom: 0,
        scroller: ao.scroller,
        scrollBox: null,
        stopFrame: null,
        box: null,
      };
      if (ao.scroller) {
        const b = ao.scroller.el.getBoundingClientRect();
        s.scrollBox = { left: b.left, top: b.top, width: b.width, height: b.height };
      }
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* the pointer is already gone, or this is a test */
      }
      listen(true);
      const ms = opts.holdMs?.(src) ?? 0;
      if (ms > 0) {
        const a = s;
        opts.onHolding?.(src, true);
        a.hold = setTimeout(() => {
          if (s !== a || a.mode !== 'pending') return;
          a.hold = null;
          close();
          opts.onHolding?.(a.src, false);
          opts.onHold?.(a.src, a.el);
          opts.onEnd?.(a.src, a.el);
        }, ms);
      }
    };
    el.addEventListener('pointerdown', down);
    const dispose = (): void => {
      el.removeEventListener('pointerdown', down);
      detachers.delete(dispose);
      if (s?.el === el) {
        const a = close();
        if (a) {
          if (a.mode === 'pending') opts.onHolding?.(a.src, false);
          if (a.mode === 'drag' && a.hover !== null) opts.onHover?.(null, a.src);
          a.ghost?.remove();
          opts.onEnd?.(a.src, a.el);
        }
      }
    };
    detachers.add(dispose);
    return dispose;
  }

  function dispose(): void {
    if (disposed) return;
    for (const d of [...detachers]) d();
    detachers.clear();
    const a = close();
    a?.ghost?.remove();
    for (const g of glides) {
      clearTimeout(g.timer);
      g.ghost.remove();
    }
    glides.clear();
    disposed = true;
  }

  opts.ctx?.onCleanup(dispose);
  return {
    attach,
    get active() {
      return s !== null && s.mode === 'drag';
    },
    dispose,
  };
}
