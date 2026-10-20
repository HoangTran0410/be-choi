import { h, replay } from '../../core/dom';
import type { Target } from '../../core/drag';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { AnswerView } from './choose';
import type { DragBin, DragItem, DragQuestion } from './types';
import { renderVisual } from './visual';

export interface DragHandlers {
  /** An item landed in its own bin. */
  onPlaced(item: DragItem, bin: DragBin): void;
  /** An item was dropped on the wrong bin (it springs back). */
  onWrongDrop(item: DragItem, hit: DragBin, right: DragBin): void;
  /** The child touched an item without dragging it: say its name. */
  onTap(item: DragItem): void;
  onAllPlaced(): void;
}

/** How far the finger may be from a bin's edge and still count as "on" it. */
const TOLERANCE = 14;

export interface DragOptions {
  /** The picked-up copy floats in this element (positioned, covering the play area). */
  layer: HTMLElement;
}

/**
 * Sort-by-dragging: bins on top, loose items below. Dropping anywhere that is not a bin does
 * nothing (the item floats back); dropping on the wrong bin shakes that bin, and the teacher
 * says where the item belongs. Nothing is ever lost.
 */
export function renderDrag(host: HTMLElement, q: DragQuestion, handlers: DragHandlers, opts: DragOptions): AnswerView {
  const disposers: Array<() => void> = [];
  const binEls = new Map<string, HTMLElement>();
  const stacks = new Map<string, HTMLElement>();
  const itemEls = new Map<string, HTMLElement>();
  const placed = new Set<string>();

  const binsRow = h('div', { class: `lq-bins lq-bins-${q.bins.length}` });
  for (const bin of q.bins) {
    const stack = h('div', { class: 'lq-stack' });
    const el = h(
      'div',
      { class: `lq-bin lq-bin-${bin.visual.k}`, 'data-id': bin.id, 'aria-label': bin.name },
      renderVisual(bin.visual),
      stack,
    );
    binEls.set(bin.id, el);
    stacks.set(bin.id, stack);
    binsRow.append(el);
  }
  const tray = h('div', { class: 'lq-tray' });
  for (const item of q.items) {
    const el = h(
      'div',
      { class: `lq-item lq-item-${item.visual.k}`, 'data-id': item.id, role: 'button', 'aria-label': item.name },
      renderVisual(item.visual),
    );
    itemEls.set(item.id, el);
    tray.append(el);
  }
  host.replaceChildren(binsRow, tray);

  const targets = (): Target[] =>
    q.bins.map((b) => {
      const r = binEls.get(b.id)!.getBoundingClientRect();
      return { id: b.id, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
    });

  // The shared drag-and-drop (core/dragdrop): a still touch is a tap, a moving one carries a light copy.
  const dd = createDragDrop<DragItem>({
    layer: opts.layer,
    targets,
    resolve: (p, t) => pickTarget(p, t, { tolerance: TOLERANCE }),
    ghost: (_item, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'is-carried');
      return g;
    },
    onTap: (item) => handlers.onTap(item),
    onHover: (id) => q.bins.forEach((b) => binEls.get(b.id)?.classList.toggle('is-hover', b.id === id)),
    onDrop(item, hitId) {
      if (!hitId) return false;
      const el = itemEls.get(item.id)!;
      const hit = q.bins.find((b) => b.id === hitId)!;
      const right = q.bins.find((b) => b.id === item.binId)!;
      if (hitId !== item.binId) {
        replay(binEls.get(hitId)!, 'anim-shake');
        handlers.onWrongDrop(item, hit, right);
        return false;
      }
      placed.add(item.id);
      el.classList.add('placed');
      // Out of the tray, so the loose things left close ranks instead of leaving a gap.
      el.style.display = 'none';
      const mini = h('span', { class: 'lq-mini' }, renderVisual(item.visual));
      stacks.get(hitId)!.append(mini);
      replay(binEls.get(hitId)!, 'anim-bounce');
      handlers.onPlaced(item, hit);
      if (placed.size === q.items.length) handlers.onAllPlaced();
      return true;
    },
  });
  for (const item of q.items) disposers.push(dd.attach(itemEls.get(item.id)!, () => (placed.has(item.id) ? null : item)));
  disposers.push(() => dd.dispose());

  return {
    destroy() {
      for (const d of disposers) d();
      disposers.length = 0;
      binsRow.remove();
      tray.remove();
    },
    hintAnswer() {
      const next = q.items.find((i) => !placed.has(i.id));
      if (next) replay(itemEls.get(next.id)!, 'anim-wiggle');
    },
  };
}
