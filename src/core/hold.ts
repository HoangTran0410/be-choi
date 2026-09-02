/**
 * Long-press helper used for the parent gate and destructive buttons. Shows a
 * `.hold-ring` progress ring while the pointer is held. Returns a dispose function.
 */
export function onHold(el: HTMLElement, ms: number, cb: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let raf = 0;
  let ring: HTMLSpanElement | null = null;
  let fired = false;

  const cleanupVisual = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ring?.remove();
    ring = null;
  };

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    cleanupVisual();
  };

  const start = (e: Event) => {
    if (timer) return;
    fired = false;
    e.preventDefault();
    ring = document.createElement('span');
    ring.className = 'hold-ring';
    el.append(ring);
    const t0 = performance.now();
    const tickRing = () => {
      if (!ring) return;
      const p = Math.min(1, (performance.now() - t0) / ms);
      ring.style.setProperty('--hold-progress', p.toFixed(3));
      if (p < 1) raf = requestAnimationFrame(tickRing);
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tickRing);
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      cleanupVisual();
      cb();
    }, ms);
  };

  const swallowClick = (e: Event) => {
    if (fired) {
      e.stopImmediatePropagation();
      e.preventDefault();
      fired = false;
    }
  };

  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('click', swallowClick, true);

  return () => {
    stop();
    el.removeEventListener('pointerdown', start);
    el.removeEventListener('pointerup', stop);
    el.removeEventListener('pointercancel', stop);
    el.removeEventListener('pointerleave', stop);
    el.removeEventListener('click', swallowClick, true);
  };
}
