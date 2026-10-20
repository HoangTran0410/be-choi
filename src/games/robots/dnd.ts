/**
 * Picking robots up. One small pointer-event controller for both the shelf and the stage:
 *  - a touch that barely moves is a *tap*;
 *  - a touch that stays still on a stage robot for a moment is a *hold*;
 *  - a touch that moves picks the robot up (a copy follows the finger) and lets go somewhere.
 * A child's finger wobbles, so "barely" is generous. The controller decides nothing about the music:
 * it tells the game what happened and the game decides what that means.
 */
import { hitTest, type Pt, type RectLike, type Target } from '../../core/drag';

export type Source = { kind: 'shelf'; robot: string } | { kind: 'stage'; slot: number };

export type Drop = { kind: 'slot'; slot: number } | { kind: 'shelf' } | { kind: 'nowhere' };

export interface DndOptions {
  /** Layer the picked-up copy floats in. It must be `position: relative/absolute` and cover the game. */
  layer: HTMLElement;
  targets(): Target[];
  stageRect(): RectLike;
  shelfRect(): RectLike;
  onTap(src: Source, el: HTMLElement): void;
  onHold?(src: Source, el: HTMLElement): void;
  onPickUp?(src: Source, el: HTMLElement): void;
  onDrop(src: Source, drop: Drop, el: HTMLElement): void;
  /** A copy of what is being carried. */
  ghost(src: Source, el: HTMLElement): HTMLElement;
  /** Called when a hold is building (true) or has ended (false), for the "squeeze" look. */
  onHolding?(src: Source, on: boolean): void;
  ctx: { onCleanup(fn: () => void): void };
}

/** How far a finger may wander and still be tapping (px). */
export const TAP_SLOP = 12;
/** How long a still finger on a stage robot takes to count as a hold (ms). */
export const HOLD_MS = 700;

const inside = (p: Pt, r: RectLike, pad = 0): boolean => p.x >= r.left - pad && p.x <= r.left + r.width + pad && p.y >= r.top - pad && p.y <= r.top + r.height + pad;

/** Where a release at `p` lands. Anywhere over the stage means the nearest seat — a forgiving drop. */
export function dropAt(p: Pt, targets: readonly Target[], stage: RectLike, shelf: RectLike): Drop {
  const exact = hitTest(p, targets, 6);
  if (exact !== null) return { kind: 'slot', slot: Number(exact) };
  if (inside(p, shelf)) return { kind: 'shelf' };
  if (inside(p, stage, 24)) {
    let best = -1;
    let bestD = Infinity;
    for (const t of targets) {
      const cx = t.rect.left + t.rect.width / 2;
      const cy = t.rect.top + t.rect.height / 2;
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = Number(t.id);
      }
    }
    if (best >= 0) return { kind: 'slot', slot: best };
  }
  return { kind: 'nowhere' };
}

export interface Dnd {
  attach(el: HTMLElement, src: () => Source | null): () => void;
}

export function createDnd(opts: DndOptions): Dnd {
  let active: {
    el: HTMLElement;
    src: Source;
    id: number | undefined;
    start: Pt;
    dragging: boolean;
    held: boolean;
    ghost: HTMLElement | null;
    hold: ReturnType<typeof setTimeout> | null;
    /** Centre of the copy relative to the layer's corner, so the finger holds it by the middle. */
    half: Pt;
    corner: Pt;
  } | null = null;

  const cleanups: Array<() => void> = [];
  opts.ctx.onCleanup(() => {
    end();
    cleanups.forEach((f) => f());
    cleanups.length = 0;
  });

  function end(): void {
    const a = active;
    if (!a) return;
    active = null;
    if (a.hold) clearTimeout(a.hold);
    a.ghost?.remove();
    a.el.classList.remove('is-carried');
    if (!a.dragging && a.src.kind === 'stage') opts.onHolding?.(a.src, false);
  }

  function place(a: NonNullable<typeof active>, p: Pt): void {
    if (!a.ghost) return;
    a.ghost.style.transform = `translate(${(p.x - a.corner.x - a.half.x).toFixed(1)}px, ${(p.y - a.corner.y - a.half.y).toFixed(1)}px) scale(1.12)`;
  }

  function attach(el: HTMLElement, getSrc: () => Source | null): () => void {
    const down = (e: PointerEvent): void => {
      if (active) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.isPrimary === false) return;
      const src = getSrc();
      if (!src) return;
      active = { el, src, id: e.pointerId, start: { x: e.clientX, y: e.clientY }, dragging: false, held: false, ghost: null, hold: null, half: { x: 0, y: 0 }, corner: { x: 0, y: 0 } };
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* the pointer is already gone, or this is a test */
      }
      if (src.kind === 'stage') {
        const a = active;
        opts.onHolding?.(src, true);
        a.hold = setTimeout(() => {
          if (active !== a || a.dragging) return;
          a.hold = null;
          a.held = true;
          const s = a.src;
          end();
          opts.onHold?.(s, a.el);
        }, HOLD_MS);
      }
    };

    const move = (e: PointerEvent): void => {
      const a = active;
      if (!a || a.el !== el || e.pointerId !== a.id) return;
      const p = { x: e.clientX, y: e.clientY };
      if (!a.dragging) {
        if (Math.hypot(p.x - a.start.x, p.y - a.start.y) < TAP_SLOP) return;
        a.dragging = true;
        if (a.hold) clearTimeout(a.hold);
        a.hold = null;
        if (a.src.kind === 'stage') opts.onHolding?.(a.src, false);
        const g = opts.ghost(a.src, el);
        const box = el.getBoundingClientRect();
        const layerBox = opts.layer.getBoundingClientRect();
        g.classList.add('rb-ghost');
        Object.assign(g.style, { position: 'absolute', left: '0', top: '0', width: `${box.width.toFixed(1)}px`, height: `${box.height.toFixed(1)}px`, pointerEvents: 'none', zIndex: '40' });
        opts.layer.append(g);
        a.half = { x: box.width / 2, y: box.height / 2 };
        a.corner = { x: layerBox.left, y: layerBox.top };
        a.ghost = g;
        el.classList.add('is-carried');
        opts.onPickUp?.(a.src, el);
      }
      place(a, p);
    };

    const up = (e: PointerEvent): void => {
      const a = active;
      if (!a || a.el !== el || e.pointerId !== a.id) return;
      const p = { x: e.clientX, y: e.clientY };
      const { src, dragging } = a;
      end();
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!dragging) {
        opts.onTap(src, el);
        return;
      }
      opts.onDrop(src, dropAt(p, opts.targets(), opts.stageRect(), opts.shelfRect()), el);
    };

    const cancel = (e: PointerEvent): void => {
      const a = active;
      if (!a || a.el !== el || e.pointerId !== a.id) return;
      end();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    const dispose = (): void => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      if (active?.el === el) end();
    };
    cleanups.push(dispose);
    return dispose;
  }

  return { attach };
}
