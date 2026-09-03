export type Child = Node | string | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | EventListener>;

/** Tiny element builder. `on*` keys become listeners, `class` sets className. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'class') {
        el.className = String(value);
      } else if (key === 'style') {
        el.style.cssText = String(value);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else if (value !== false) {
        el.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** Parse an `<svg>…</svg>` string into an element. */
export function svgEl(markup: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const el = tpl.content.firstElementChild;
  if (!(el instanceof SVGSVGElement)) throw new Error('svgEl: markup must be an <svg> root');
  return el;
}

/** Deterministic PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** `n` distinct elements. Throws if `n > arr.length`. */
export function pick<T>(arr: readonly T[], n: number, rng: () => number = Math.random): T[] {
  if (n > arr.length) throw new Error(`pick: need ${n} but only ${arr.length} available`);
  return shuffle(arr, rng).slice(0, n);
}

/** Integer in [min, max]. */
export function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Restart a CSS animation class. */
export function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  // Force reflow so the browser sees the class removed before it is re-added.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
