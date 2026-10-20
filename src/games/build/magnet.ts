/**
 * The "magnet" that pulls a piece toward its place while the child drags: the nearer the piece, the
 * harder the pull, so letting go anywhere inside the radius lands it. Pure maths plus one small DOM
 * helper that nudges the transform `makeDraggable` has just set.
 */

export interface V {
  x: number;
  y: number;
}

/** How hard the pull is at the very centre (0 … 1). Below 1 so the piece still feels held by the finger. */
export const PULL = 0.85;

/**
 * Extra displacement to add to a piece whose centre is `offset` away from its place (place minus
 * piece). Zero outside `radius`, growing smoothly to `PULL × offset` as the piece arrives.
 */
export function magnetPull(offset: V, radius: number, strength = PULL): V {
  const d = Math.hypot(offset.x, offset.y);
  if (radius <= 0 || d >= radius || d === 0) return { x: 0, y: 0 };
  const k = strength * (1 - d / radius);
  return { x: offset.x * k, y: offset.y * k };
}

/** Is a piece this far from its place close enough to count as put there? */
export function isNear(distance: number, radius: number): boolean {
  return distance <= radius;
}

const TRANSLATE = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\s*\)/;

/**
 * Pull the dragged element toward `target` (a point in client coordinates). Reads the translate
 * `makeDraggable` just wrote, so the pull never accumulates from one move to the next. Returns true
 * while the element is inside the radius.
 */
export function pullElement(el: HTMLElement, target: V, radius: number): boolean {
  const r = el.getBoundingClientRect();
  const offset = { x: target.x - (r.left + r.width / 2), y: target.y - (r.top + r.height / 2) };
  const near = isNear(Math.hypot(offset.x, offset.y), radius);
  const pull = magnetPull(offset, radius);
  const m = TRANSLATE.exec(el.style.transform);
  if (m && (pull.x || pull.y)) {
    const scale = el.style.transform.includes('scale') ? ' scale(1.06)' : '';
    el.style.transform = `translate(${Number(m[1]) + pull.x}px, ${Number(m[2]) + pull.y}px)${scale}`;
  }
  el.classList.toggle('bw-near', near);
  return near;
}
