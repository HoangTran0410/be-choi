/**
 * Drag-to-scroll for touch and pen. The stage turns every native touch pan off
 * (`touch-action: none`), so a finger swipe has to move `scrollTop` itself; a mouse wheel and
 * the keyboard still scroll natively. Lifting the finger keeps the board gliding for a moment.
 */
interface Drag {
  id: number;
  y: number;
  top: number;
  moved: boolean;
  lastY: number;
  lastT: number;
  v: number;
}

export function dragScroll(el: HTMLElement, ctx?: { onCleanup(fn: () => void): void }): () => void {
  let drag: Drag | null = null;
  let raf = 0;
  const stopGlide = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' || e.isPrimary === false) return;
    stopGlide();
    drag = { id: e.pointerId, y: e.clientY, top: el.scrollTop, moved: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
  };
  const onMove = (e: PointerEvent): void => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 8) return;
    d.moved = true;
    el.scrollTop = d.top - dy;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;
  };
  const onEnd = (e: PointerEvent): void => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    drag = null;
    if (!d.moved || performance.now() - d.lastT > 80) return;
    let v = d.v * 16;
    const glide = (): void => {
      if (Math.abs(v) < 0.5) {
        raf = 0;
        return;
      }
      const before = el.scrollTop;
      el.scrollTop += v;
      v *= 0.94;
      raf = el.scrollTop === before ? 0 : requestAnimationFrame(glide);
    };
    raf = requestAnimationFrame(glide);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onEnd);
  el.addEventListener('pointercancel', onEnd);
  const dispose = (): void => {
    stopGlide();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onEnd);
    el.removeEventListener('pointercancel', onEnd);
  };
  ctx?.onCleanup(dispose);
  return dispose;
}
