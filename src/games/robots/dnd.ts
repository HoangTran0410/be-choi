/**
 * Picking robots up: the robots' side of the shared drag-and-drop (`core/dragdrop.ts`).
 *  - a touch that barely moves is a *tap*;
 *  - a touch that stays still on a stage robot for a moment is a *hold*;
 *  - a touch that moves picks the robot up (a light copy follows the finger) and lets go somewhere;
 *  - on the shelf, a sideways swipe scrolls the shelf instead.
 * All the pointer work (capture, slop, ghost, cancel, cleanup) lives in the shared module. This file
 * only says where a robot may land: a seat, the shelf, or nowhere. It decides nothing about the
 * music: it tells the game what happened and the game decides what that means.
 */
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { Pt, RectLike, Target } from '../../core/drag';

export type Source = { kind: 'shelf'; robot: string } | { kind: 'stage'; slot: number };

export type Drop = { kind: 'slot'; slot: number } | { kind: 'shelf' } | { kind: 'nowhere' };

export interface DndOptions {
  /** Layer the picked-up copy floats in. It must be `position: relative/absolute` and cover the game. */
  layer: HTMLElement;
  targets(): Target[];
  stageRect(): RectLike;
  shelfRect(): RectLike;
  /** The shelf, whose sideways swipe scrolls it. */
  shelfEl?: HTMLElement;
  onTap(src: Source, el: HTMLElement): void;
  onHold?(src: Source, el: HTMLElement): void;
  onPickUp?(src: Source, el: HTMLElement): void;
  /** The seat under the finger (null: none). */
  onHover?(slot: number | null, src: Source): void;
  /** Return `false` for a drop that goes nowhere: the copy glides back. */
  onDrop(src: Source, drop: Drop, el: HTMLElement): void | boolean;
  /** Called after any pick-up ends. */
  onEnd?(src: Source, el: HTMLElement): void;
  /** A copy of what is being carried. */
  ghost(src: Source, el: HTMLElement): HTMLElement;
  /** Called when a hold is building (true) or has ended (false), for the "squeeze" look. */
  onHolding?(src: Source, on: boolean): void;
  ctx: { onCleanup(fn: () => void): void };
}

/** How far a finger may wander and still be tapping (px). */
export const TAP_SLOP = 12;
/** How long a still finger on a stage robot takes to count as a hold (ms). */
export const HOLD_MS = 1200;

const SHELF = 'shelf';
const STAGE = 'stage';

const inside = (p: Pt, r: RectLike, pad = 0): boolean =>
  p.x >= r.left - pad && p.x <= r.left + r.width + pad && p.y >= r.top - pad && p.y <= r.top + r.height + pad;

/** Where a release at `p` lands. Anywhere over the stage means the nearest seat — a forgiving drop. */
export function dropAt(p: Pt, targets: readonly Target[], stage: RectLike, shelf: RectLike): Drop {
  const exact = pickTarget(p, targets, { tolerance: 6 });
  if (exact !== null) return { kind: 'slot', slot: Number(exact) };
  if (inside(p, shelf)) return { kind: 'shelf' };
  const near = pickTarget(p, targets, { nearestWithin: stage, pad: 24 });
  if (near !== null) return { kind: 'slot', slot: Number(near) };
  return { kind: 'nowhere' };
}

export interface Dnd {
  attach(el: HTMLElement, src: () => Source | null): () => void;
  /** Is a robot being carried right now? */
  readonly active: boolean;
}

export function createDnd(opts: DndOptions): Dnd {
  const dd = createDragDrop<Source>({
    layer: opts.layer,
    slop: TAP_SLOP,
    // The shelf and the stage ride along with the seats, so every rect is measured once at pick-up
    // and a finger move never reads layout.
    targets: () => [...opts.targets(), { id: SHELF, rect: opts.shelfRect() }, { id: STAGE, rect: opts.stageRect() }],
    resolve: (p, targets) => {
      const seats = targets.filter((t) => t.id !== SHELF && t.id !== STAGE);
      const none = { left: 0, top: 0, width: 0, height: 0 };
      const d = dropAt(p, seats, targets.find((t) => t.id === STAGE)?.rect ?? none, targets.find((t) => t.id === SHELF)?.rect ?? none);
      return d.kind === 'slot' ? String(d.slot) : d.kind === 'shelf' ? SHELF : null;
    },
    ghost: opts.ghost,
    holdMs: (src) => (src.kind === 'stage' ? HOLD_MS : 0),
    onTap: opts.onTap,
    onHold: opts.onHold,
    onHolding: opts.onHolding,
    onPickUp: opts.onPickUp,
    onHover: (id, src) => opts.onHover?.(id === null || id === SHELF ? null : Number(id), src),
    onDrop: (src, hit, el) => {
      const drop: Drop = hit === null ? { kind: 'nowhere' } : hit === SHELF ? { kind: 'shelf' } : { kind: 'slot', slot: Number(hit) };
      const r = opts.onDrop(src, drop, el);
      return drop.kind === 'nowhere' ? false : r;
    },
    onEnd: opts.onEnd,
    ctx: opts.ctx,
  });
  return {
    attach(el, src) {
      // Only things in the shelf scroll with it; a robot on stage never does.
      return dd.attach(el, src, opts.shelfEl && opts.shelfEl.contains(el) ? { scroller: { el: opts.shelfEl, axis: 'x' } } : {});
    },
    get active() {
      return dd.active;
    },
  };
}
