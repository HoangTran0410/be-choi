import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetFrameLoop } from './frame';
import { DEFAULT_SLOP, clampScroll, createDragDrop, edgeSpeed, intentOf, pastSlop, pickTarget } from './dragdrop';

const r = (left: number, top: number, w = 100, h = 100) => ({ left, top, width: w, height: h });

describe('pastSlop', () => {
  it('is a tap until the finger has gone slop px', () => {
    expect(pastSlop({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(false);
    expect(pastSlop({ x: 0, y: 0 }, { x: DEFAULT_SLOP, y: 0 })).toBe(true);
    expect(pastSlop({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
  });
});

describe('pickTarget', () => {
  const t = [
    { id: 'a', rect: r(0, 0) },
    { id: 'b', rect: r(200, 0) },
    { id: 'c', rect: r(0, 200) },
  ];
  it('takes the target under the point, honouring tolerance', () => {
    expect(pickTarget({ x: 50, y: 50 }, t)).toBe('a');
    expect(pickTarget({ x: 250, y: 50 }, t)).toBe('b');
    expect(pickTarget({ x: 110, y: 50 }, t)).toBeNull();
    expect(pickTarget({ x: 110, y: 50 }, t, { tolerance: 20 })).toBe('a');
  });
  it('picks the nearest centre when targets overlap', () => {
    const o = [
      { id: 'a', rect: r(0, 0, 100, 100) },
      { id: 'b', rect: r(80, 0, 100, 100) },
    ];
    expect(pickTarget({ x: 95, y: 50 }, o)).toBe('b');
    expect(pickTarget({ x: 85, y: 50 }, o)).toBe('a');
  });
  it('falls back to the nearest target inside a region, and to nothing outside it', () => {
    const region = r(0, 0, 400, 400);
    expect(pickTarget({ x: 150, y: 150 }, t, { nearestWithin: region })).toBe('a');
    expect(pickTarget({ x: 190, y: 230 }, t, { nearestWithin: region })).toBe('c');
    expect(pickTarget({ x: 600, y: 600 }, t, { nearestWithin: region })).toBeNull();
    expect(pickTarget({ x: 410, y: 100 }, t, { nearestWithin: region, pad: 20 })).toBe('b');
  });
  it('can cap how far the nearest one may be', () => {
    expect(pickTarget({ x: 150, y: 50 }, t, { maxDistance: 120 })).toBe('a');
    expect(pickTarget({ x: 150, y: 50 }, t, { maxDistance: 60 })).toBeNull();
    expect(pickTarget({ x: 1, y: 1 }, [], { nearestWithin: region0 })).toBeNull();
  });
});
const region0 = r(0, 0, 10, 10);

describe('intentOf', () => {
  it('waits while the finger has hardly moved', () => {
    expect(intentOf(3, 2, 'x', true)).toBe('pending');
  });
  it('a sideways swipe scrolls a sideways scroller; anything else picks up', () => {
    expect(intentOf(30, 5, 'x', true)).toBe('scroll');
    expect(intentOf(-30, 8, 'x', true)).toBe('scroll');
    expect(intentOf(5, -30, 'x', true)).toBe('drag');
    expect(intentOf(20, -20, 'x', true)).toBe('drag');
    expect(intentOf(5, 30, 'y', true)).toBe('scroll');
  });
  it('with nothing to scroll every move is a pick-up', () => {
    expect(intentOf(30, 0, 'x', false)).toBe('drag');
  });
});

describe('edgeSpeed', () => {
  it('is zero in the middle and ramps up toward either edge', () => {
    expect(edgeSpeed(200, 0, 400, 50, 10)).toBe(0);
    expect(edgeSpeed(25, 0, 400, 50, 10)).toBeCloseTo(-5);
    expect(edgeSpeed(0, 0, 400, 50, 10)).toBe(-10);
    expect(edgeSpeed(-30, 0, 400, 50, 10)).toBe(-10);
    expect(edgeSpeed(375, 0, 400, 50, 10)).toBeCloseTo(5);
    expect(edgeSpeed(400, 0, 400, 50, 10)).toBe(10);
  });
  it('copes with a tiny or empty span', () => {
    expect(edgeSpeed(5, 0, 0)).toBe(0);
    expect(Math.abs(edgeSpeed(5, 0, 40, 50, 10))).toBeLessThanOrEqual(10);
  });
});

describe('clampScroll', () => {
  it('stays inside 0..max', () => {
    expect(clampScroll(10, -30, 100)).toBe(0);
    expect(clampScroll(90, 30, 100)).toBe(100);
    expect(clampScroll(10, 20, 100)).toBe(30);
    expect(clampScroll(10, 20, -5)).toBe(0);
  });
});

// ---- the controller --------------------------------------------------------------------------

let queue: Map<number, FrameRequestCallback>;
let nextId: number;
let clock: number;
function frame(n = 1): void {
  for (let i = 0; i < n; i++) {
    clock += 16;
    const run = [...queue.entries()];
    queue.clear();
    for (const [, cb] of run) cb(clock);
  }
}

function ptr(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  const { buttons, ...rest } = extra;
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons: (buttons as number | undefined) ?? (type === 'pointerup' ? 0 : 1),
  });
  Object.assign(e, { pointerId: 1, isPrimary: true, pointerType: 'touch', ...rest });
  return e;
}

beforeEach(() => {
  vi.useFakeTimers();
  queue = new Map();
  nextId = 1;
  clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
});
afterEach(() => {
  resetFrameLoop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function world() {
  const layer = document.createElement('div');
  const el = document.createElement('div');
  document.body.append(layer, el);
  el.getBoundingClientRect = () =>
    ({ left: 100, top: 400, width: 80, height: 80, right: 180, bottom: 480, x: 100, y: 400, toJSON() {} }) as DOMRect;
  const targets = [
    { id: '0', rect: r(0, 0, 100, 100) },
    { id: '1', rect: r(200, 0, 100, 100) },
  ];
  const log: string[] = [];
  const opts = {
    layer,
    targets: () => targets,
    ghost: () => {
      const g = document.createElement('div');
      g.className = 'g';
      return g;
    },
    onTap: () => log.push('tap'),
    onHold: () => log.push('hold'),
    onPickUp: () => log.push('pick'),
    onHover: (id: string | null) => log.push(`hover:${id}`),
    onDrop: (_s: string, hit: string | null) => {
      log.push(`drop:${hit}`);
      return hit !== null;
    },
    onCancel: () => log.push('cancel'),
  };
  return { layer, el, log, opts };
}

describe('createDragDrop', () => {
  it('a finger that barely moves is a tap, not a drag', () => {
    const { el, log, opts, layer } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 154, 443));
    el.dispatchEvent(ptr('pointerup', 154, 443));
    expect(log).toEqual(['tap']);
    expect(layer.querySelector('.g')).toBeNull();
  });

  it('a drag picks up, reports the seat under the finger, and drops on it', () => {
    const { el, log, opts, layer } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 150, 300));
    expect(log).toEqual(['pick']);
    expect(dd.active).toBe(true);
    expect(layer.querySelector('.g')).not.toBeNull();
    expect(el.classList.contains('is-carried')).toBe(true);
    el.dispatchEvent(ptr('pointermove', 250, 50));
    frame();
    const g = layer.querySelector<HTMLElement>('.g')!;
    expect(g.style.transform).toContain('translate3d(');
    expect(g.style.willChange).toBe('transform');
    el.dispatchEvent(ptr('pointerup', 250, 50));
    expect(log).toEqual(['pick', 'hover:1', 'hover:null', 'drop:1']);
    expect(layer.querySelector('.g')).toBeNull();
    expect(el.classList.contains('is-carried')).toBe(false);
    expect(dd.active).toBe(false);
  });

  it('moves the ghost once per frame, however many moves arrive, and reads no layout while moving', () => {
    const { el, opts, layer } = world();
    const rect = vi.spyOn(el, 'getBoundingClientRect');
    const targets = vi.fn(() => opts.targets());
    const dd = createDragDrop<string>({ ...opts, targets });
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 150, 300));
    const picked = { rect: rect.mock.calls.length, targets: targets.mock.calls.length };
    const g = layer.querySelector<HTMLElement>('.g')!;
    const writes = vi.fn();
    let t = g.style.transform;
    Object.defineProperty(g.style, 'transform', { get: () => t, set: (v: string) => ((t = v), writes(v)) });
    for (let i = 0; i < 20; i++) el.dispatchEvent(ptr('pointermove', 150 + i, 300 - i));
    expect(writes).not.toHaveBeenCalled();
    frame();
    expect(writes).toHaveBeenCalledTimes(1);
    frame(5);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(rect.mock.calls.length).toBe(picked.rect);
    expect(targets.mock.calls.length).toBe(picked.targets);
    el.dispatchEvent(ptr('pointerup', 170, 280));
  });

  it('lands on the nearest target with a custom resolver (a forgiving drop)', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>({ ...opts, resolve: (p, t) => pickTarget(p, t, { nearestWithin: r(0, 0, 400, 400) }) });
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 120, 200));
    el.dispatchEvent(ptr('pointerup', 120, 200));
    expect(log.at(-1)).toBe('drop:0');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 260, 200));
    el.dispatchEvent(ptr('pointerup', 260, 200));
    expect(log.at(-1)).toBe('drop:1');
  });

  it('a refused drop glides the ghost back, then removes it', () => {
    const { el, log, opts, layer } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 150, 300));
    el.dispatchEvent(ptr('pointerup', 150, 300));
    expect(log).toContain('drop:null');
    const g = layer.querySelector<HTMLElement>('.g')!;
    expect(g).not.toBeNull();
    expect(g.style.transition).toContain('transform');
    expect(g.style.transform).toContain('translate3d(100.0px, 400.0px, 0)');
    vi.advanceTimersByTime(400);
    expect(layer.querySelector('.g')).toBeNull();
  });

  it('a pointercancel (the system took the finger) does not drop and glides back', () => {
    const { el, log, opts, layer } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 250, 50));
    el.dispatchEvent(ptr('pointercancel', 250, 50));
    expect(log).not.toContain('drop:1');
    expect(log).toContain('cancel');
    expect(dd.active).toBe(false);
    vi.advanceTimersByTime(400);
    expect(layer.querySelector('.g')).toBeNull();
    // and the next press works normally
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log.at(-1)).toBe('tap');
  });

  it('a cancel before the pick-up is nothing at all', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointercancel', 150, 440));
    expect(log).toEqual([]);
  });

  it('ignores a second finger and other mouse buttons', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440, { isPrimary: false }));
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log).toEqual([]);
    const right = ptr('pointerdown', 150, 440);
    Object.defineProperty(right, 'button', { value: 2 });
    el.dispatchEvent(right);
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log).toEqual([]);
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointerdown', 10, 10, { pointerId: 2, isPrimary: false }));
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log).toEqual(['tap']);
  });

  it('a mouse let go outside the window (a move with no button) ends the drag', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440, { pointerType: 'mouse' }));
    el.dispatchEvent(ptr('pointermove', 250, 50, { pointerType: 'mouse' }));
    window.dispatchEvent(ptr('pointermove', 250, 50, { pointerType: 'mouse', buttons: 0 }));
    expect(dd.active).toBe(false);
    expect(log).toContain('drop:1');
  });

  it('still ends the drag when the element was removed from the page mid-drag', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 250, 50));
    el.remove();
    document.body.dispatchEvent(ptr('pointerup', 250, 50));
    expect(log).toContain('drop:1');
    expect(dd.active).toBe(false);
  });

  it('a page that goes to the background cancels the drag', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 250, 50));
    window.dispatchEvent(new Event('blur'));
    expect(log).toContain('cancel');
    expect(dd.active).toBe(false);
  });

  it('a still finger is a hold, and moving first cancels the hold', () => {
    const { el, log, opts } = world();
    const holding: boolean[] = [];
    const dd = createDragDrop<string>({ ...opts, holdMs: () => 700, onHolding: (_s, on) => holding.push(on) });
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    vi.advanceTimersByTime(800);
    expect(log).toEqual(['hold']);
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log).toEqual(['hold']);
    expect(holding).toEqual([true, false]);
    log.length = 0;
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 150, 300));
    vi.advanceTimersByTime(800);
    expect(log).toEqual(['pick']);
    el.dispatchEvent(ptr('pointerup', 150, 300));
  });

  it('a sideways swipe on a scroller scrolls it by hand; an upward move picks up', () => {
    const { el, log, opts } = world();
    const shelf = document.createElement('div');
    document.body.append(shelf);
    Object.defineProperty(shelf, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(shelf, 'clientWidth', { value: 300, configurable: true });
    shelf.scrollLeft = 200;
    shelf.getBoundingClientRect = () =>
      ({ left: 0, top: 380, width: 400, height: 100, right: 400, bottom: 480, x: 0, y: 380, toJSON() {} }) as DOMRect;
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot', { scroller: { el: shelf, axis: 'x' } });
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 110, 444));
    el.dispatchEvent(ptr('pointermove', 90, 446));
    expect(shelf.scrollLeft).toBe(260);
    el.dispatchEvent(ptr('pointerup', 90, 446));
    expect(log).toEqual([]);
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 152, 400));
    expect(log).toEqual(['pick']);
    el.dispatchEvent(ptr('pointerup', 152, 400));
  });

  it('a shallow swipe that leaves the scroller across its axis becomes a pick-up', () => {
    const { el, log, opts } = world();
    const shelf = document.createElement('div');
    document.body.append(shelf);
    shelf.getBoundingClientRect = () =>
      ({ left: 0, top: 380, width: 400, height: 100, right: 400, bottom: 480, x: 0, y: 380, toJSON() {} }) as DOMRect;
    Object.defineProperty(shelf, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(shelf, 'clientWidth', { value: 300, configurable: true });
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot', { scroller: { el: shelf, axis: 'x' } });
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 175, 432)); // shallow: scrolls
    expect(log).toEqual([]);
    el.dispatchEvent(ptr('pointermove', 230, 370)); // over the top edge of the shelf: picked up
    expect(log).toEqual(['pick']);
    expect(dd.active).toBe(true);
    el.dispatchEvent(ptr('pointermove', 250, 50));
    el.dispatchEvent(ptr('pointerup', 250, 50));
    expect(log.at(-1)).toBe('drop:1');
  });

  it('scrolls a container by itself while the ghost is near its edge, and re-reads the targets', () => {
    const { el, opts } = world();
    const box = document.createElement('div');
    document.body.append(box);
    box.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    Object.defineProperty(box, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(box, 'clientWidth', { value: 400, configurable: true });
    const targets = vi.fn(() => opts.targets());
    const dd = createDragDrop<string>({ ...opts, targets, autoScroll: { el: box, axis: 'x', zone: 50, maxSpeed: 10 } });
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 395, 50));
    const before = targets.mock.calls.length;
    frame(3);
    expect(box.scrollLeft).toBeGreaterThan(20);
    expect(targets.mock.calls.length).toBeGreaterThan(before);
    el.dispatchEvent(ptr('pointermove', 200, 50));
    const stopped = box.scrollLeft;
    frame(3);
    expect(box.scrollLeft).toBe(stopped);
    el.dispatchEvent(ptr('pointerup', 200, 50));
  });

  it('dispose removes the listeners, the ghost and the frame callback', () => {
    const { el, log, opts, layer } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 250, 50));
    expect(layer.querySelector('.g')).not.toBeNull();
    dd.dispose();
    expect(layer.querySelector('.g')).toBeNull();
    expect(el.classList.contains('is-carried')).toBe(false);
    frame(2);
    expect(queue.size).toBe(0);
    log.length = 0;
    el.dispatchEvent(ptr('pointermove', 260, 60));
    el.dispatchEvent(ptr('pointerup', 260, 60));
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log).toEqual([]);
  });

  it('dispose during a glide removes the ghost at once; ctx cleanup disposes', () => {
    const { el, opts, layer } = world();
    let cleanup: () => void = () => undefined;
    const dd = createDragDrop<string>({ ...opts, ctx: { onCleanup: (f) => (cleanup = f) } });
    dd.attach(el, () => 'bot');
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointermove', 150, 300));
    el.dispatchEvent(ptr('pointerup', 150, 300));
    expect(layer.querySelector('.g')).not.toBeNull();
    cleanup();
    expect(layer.querySelector('.g')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a source that has nothing to carry is not picked up', () => {
    const { el, log, opts } = world();
    const dd = createDragDrop<string>(opts);
    dd.attach(el, () => null);
    el.dispatchEvent(ptr('pointerdown', 150, 440));
    el.dispatchEvent(ptr('pointerup', 150, 440));
    expect(log).toEqual([]);
  });
});
