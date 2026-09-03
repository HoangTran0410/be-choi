export interface Pt {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Target {
  id: string;
  rect: RectLike;
}

/** First target whose rect (grown by `tolerance` on every side) contains `p`. */
export function hitTest(p: Pt, targets: readonly Target[], tolerance = 0): string | null {
  for (const t of targets) {
    const { left, top, width, height } = t.rect;
    if (p.x >= left - tolerance && p.x <= left + width + tolerance && p.y >= top - tolerance && p.y <= top + height + tolerance) {
      return t.id;
    }
  }
  return null;
}

export function centerOf(el: Element): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export interface DragOptions {
  onStart?(el: HTMLElement): void;
  onMove?(el: HTMLElement, p: Pt): void;
  /**
   * Called on release with the pointer position. Return `true` to accept the drop
   * (the element keeps its current translate; the caller usually re-parents it) or
   * `false` to spring back to where the drag started.
   */
  onDrop(el: HTMLElement, p: Pt): boolean | Promise<boolean>;
}

/**
 * Make an element draggable with Pointer Events. The element is moved with a CSS
 * `translate()` so it never leaves its layout slot. Returns a dispose function.
 */
export function makeDraggable(el: HTMLElement, opts: DragOptions): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  /** While dragging the piece is lifted with a cheap scale (no filters: they stall tablets). */
  const setTranslate = (x: number, y: number, lifted = false) => {
    el.style.transform = `translate(${x}px, ${y}px)${lifted ? ' scale(1.06)' : ''}`;
  };

  const down = (e: PointerEvent) => {
    if (pointerId !== null || e.button !== 0 || !e.isPrimary) return;
    if (el.classList.contains('placed')) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    baseX = Number(el.dataset.dx ?? 0);
    baseY = Number(el.dataset.dy ?? 0);
    el.classList.remove('spring-back');
    el.classList.add('dragging');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom or already captured */
    }
    e.preventDefault();
    setTranslate(baseX, baseY, true);
    opts.onStart?.(el);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const x = baseX + e.clientX - startX;
    const y = baseY + e.clientY - startY;
    setTranslate(x, y, true);
    opts.onMove?.(el, { x: e.clientX, y: e.clientY });
  };

  const finish = (accepted: boolean, x: number, y: number) => {
    if (accepted) {
      el.dataset.dx = String(x);
      el.dataset.dy = String(y);
    } else {
      el.classList.add('spring-back');
      setTranslate(baseX, baseY);
    }
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    el.classList.remove('dragging');
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const x = baseX + e.clientX - startX;
    const y = baseY + e.clientY - startY;
    const result = opts.onDrop(el, { x: e.clientX, y: e.clientY });
    if (typeof result === 'boolean') finish(result, x, y);
    else void result.then((ok) => finish(ok, x, y)).catch(() => finish(false, x, y));
  };

  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    el.classList.remove('dragging');
    finish(false, 0, 0);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);

  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    pointerId = null;
    el.classList.remove('dragging');
  };
}
