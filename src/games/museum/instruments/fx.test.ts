import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFx, hasTrail, holdsPress, type Fx } from './fx';
import { newString, osc, pluckString, ribbonPath, stepString, stringOffset, stringPath, thin, wobbleFrames, zonesAlong } from './fxmath';
import { layoutFor } from './layout';
import type { InstrumentKind } from './types';

function setup(
  kind: InstrumentKind,
  w = 360,
  h = 560,
): { fx: Fx; svg: SVGSVGElement; host: HTMLElement; board: ReturnType<typeof layoutFor> } {
  const host = document.createElement('div');
  const board = layoutFor(kind, w, h, 'free');
  host.innerHTML = board.svg;
  document.body.append(host);
  const svg = host.querySelector('svg')!;
  const fx = createFx({
    svg: () => svg,
    board: () => board,
    later: (fn, ms) => setTimeout(fn, ms),
    zoneEls: (id) => Array.from(svg.querySelectorAll<SVGElement>('[data-z]')).filter((e) => e.dataset.z === id),
  });
  fx.rebuild();
  return { fx, svg, host, board };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('fx maths', () => {
  it('a wobble starts at rest, swings, and dies away', () => {
    expect(osc(0, 3, 3)).toBe(0); // a swing starts at rest
    expect(osc(0, 3, 3, Math.PI / 2)).toBeCloseTo(1, 5); // a skin starts at its dip
    const peaks = [0.1, 0.45, 0.8].map((t) => Math.abs(osc(t, 2, 3)));
    expect(Math.max(...peaks)).toBeGreaterThan(0.2);
    expect(Math.abs(osc(1, 2, 3))).toBeLessThan(0.01);
    const kf = wobbleFrames((u) => `scale(${1 - u * 0.1})`, 2, 3, 10);
    expect(kf.length).toBe(11);
    expect(kf[0]!.transform).toBe('scale(1)');
  });

  it('a plucked string swings as a sine along its length, fixed at both ends, and rings down', () => {
    const st = newString(120, 500);
    pluckString(st, 10, 0.5);
    expect(stringOffset(st, 0)).toBeCloseTo(0, 5);
    expect(stringOffset(st, 1)).toBeCloseTo(0, 5);
    expect(stringOffset(st, 0.5)).toBeGreaterThan(8); // the pull at the spot touched
    expect(stringOffset(st, 0.5)).toBeLessThan(11);
    // half a period later it has swung the other way, a little smaller
    st.age = 60;
    expect(stringOffset(st, 0.5)).toBeLessThan(-5);
    let alive = true;
    let ms = 0;
    while (alive && ms < 5000) {
      alive = stepString(st, 16);
      ms += 16;
    }
    expect(alive).toBe(false);
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(3000);
  });

  it('a harder pluck swings wider, and plucking near one end bends it near that end', () => {
    const soft = newString(120);
    const hard = newString(120);
    pluckString(soft, 4, 0.5);
    pluckString(hard, 12, 0.5);
    expect(Math.abs(stringOffset(hard, 0.5))).toBeGreaterThan(Math.abs(stringOffset(soft, 0.5)) * 2);
    const near = newString(120);
    pluckString(near, 10, 0.2);
    expect(stringOffset(near, 0.2)).toBeGreaterThan(stringOffset(near, 0.8));
  });

  it('a bowed string keeps vibrating for as long as the bow is on it, then settles', () => {
    const st = newString(110);
    st.bowTo = 10;
    for (let i = 0; i < 40; i++) stepString(st, 16);
    expect(st.bow).toBeGreaterThan(8);
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      stepString(st, 16);
      seen.add(Math.sign(Math.round(stringOffset(st, 0.5))));
    }
    expect(seen.has(1) && seen.has(-1)).toBe(true); // it really oscillates
    st.bowTo = 0;
    let alive = true;
    for (let i = 0; i < 200 && alive; i++) alive = stepString(st, 16);
    expect(alive).toBe(false);
  });

  it('writes a string as a path from end to end', () => {
    const d = stringPath(0, 0, 0, 100, () => 0, 4);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d.endsWith('L0 100')).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(4);
  });

  it('a ribbon is one closed path, thin at the tail and wide at the head', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: i * 10, y: Math.sin(i / 2) * 8, t: i * 16 }));
    const d = ribbonPath(pts, 12 * 16, 20, 300);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/M/g) ?? []).length).toBe(1);
    expect(ribbonPath(pts.slice(0, 1), 0, 20, 300)).toBe('');
  });

  it('walks a fast finger across the keys and finds every one in between', () => {
    const b = layoutFor('marimba', 360, 560, 'free');
    const first = b.zones[0]!;
    const last = b.zones[7]!;
    const c = (z: typeof first) => (z.shape.t === 'rect' ? { x: z.shape.x + z.shape.w / 2, y: z.shape.y + z.shape.h / 2 } : { x: 0, y: 0 });
    const a = c(first);
    const z = c(last);
    const crossed = zonesAlong(b.zones, a.x, a.y, z.x, z.y, first.id);
    expect(crossed.map((q) => q.zone.id)).toEqual(b.zones.slice(1).map((q) => q.id));
  });

  it('thins a long list but keeps both ends', () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    const t = thin(list, 6);
    expect(t.length).toBe(6);
    expect(t[0]).toBe(0);
    expect(t[5]).toBe(29);
    expect(thin([1, 2], 6)).toEqual([1, 2]);
  });
});

describe('fx on a drawing', () => {
  it('finds the strings of a harp, and a pluck bends the string, then it settles straight', () => {
    const { fx, svg } = setup('harp');
    const str = svg.querySelector<SVGPathElement>('path.str[data-s="3"]')!;
    const straight = str.getAttribute('d');
    fx.pluck(3, 0.9);
    fx.tick(0, 16);
    expect(str.getAttribute('d')).not.toBe(straight);
    expect(str.getAttribute('d')!.split('L').length).toBeGreaterThan(10); // a curve, not a line
    for (let i = 0; i < 400; i++) fx.tick(i * 16, 16);
    expect(str.getAttribute('d')!.split('L').length).toBe(2);
    expect(straight!.split('L').length).toBe(2);
  });

  it('a pluck from a harp zone vibrates the string in that zone', () => {
    const { fx, svg, board } = setup('harp');
    const z = board.zones[2]!;
    const str = svg.querySelector<SVGPathElement>(`[data-z="${z.id}"] path.str`)!;
    const straight = str.getAttribute('d');
    fx.hit(z, 100, 200, 0.8);
    fx.tick(0, 16);
    expect(str.getAttribute('d')).not.toBe(straight);
  });

  it('the violin has four strings that can sing, and a bow that follows the finger', () => {
    const { fx, svg } = setup('violin');
    expect(svg.querySelectorAll('path.str').length).toBe(4);
    fx.bowMove(1, 100, 100);
    fx.tick(0, 16);
    for (let i = 1; i < 12; i++) {
      // drawn along one string (the strings of the portrait violin run up and down)
      fx.bowMove(1, 100, 100 + i * 14);
      fx.tick(i * 16, 16);
    }
    const bow = svg.querySelector('.fx-bow g');
    expect(bow).not.toBeNull();
    expect(Number(bow!.getAttribute('opacity'))).toBeGreaterThan(0.3);
    const moving = Array.from(svg.querySelectorAll<SVGPathElement>('path.str')).filter(
      (p) => (p.getAttribute('d') ?? '').includes('L') && p.getAttribute('d')!.split('L').length > 10,
    );
    expect(moving.length).toBe(1); // only the string under the bow sings
    fx.bowEnd(1);
    for (let i = 12; i < 120; i++) fx.tick(i * 16, 16);
    expect(svg.querySelector('.fx-bow g')).toBeNull();
    for (const p of svg.querySelectorAll<SVGPathElement>('path.str')) expect(p.getAttribute('d')!.split('L').length).toBe(2);
  });

  it('a finger trail is a single smooth shape that follows the finger and fades once it lifts', () => {
    const { fx, svg } = setup('piano');
    for (let i = 0; i < 12; i++) {
      fx.trailMove(7, 40 + i * 12, 200 + i * 5);
      fx.tick(i * 16, 16);
    }
    const trail = svg.querySelector('.fx-trail g')!;
    expect(trail).not.toBeNull();
    const paths = trail.querySelectorAll('path');
    expect(paths.length).toBe(2); // glow and core, each one shape
    expect(paths[0]!.getAttribute('d')).toMatch(/^M.*Z$/);
    fx.trailEnd(7);
    for (let i = 12; i < 80; i++) fx.tick(i * 16, 16);
    expect(svg.querySelector('.fx-trail g')).toBeNull();
  });

  it('keys stay pressed while held and let go afterwards', () => {
    const { fx, svg, board } = setup('piano');
    const key = board.zones.find((z) => !z.small)!;
    const el = svg.querySelector(`[data-z="${key.id}"]`)!;
    expect(holdsPress(board, key)).toBe(true);
    fx.hit(key, 10, 10, 0.8);
    expect(el.classList.contains('down')).toBe(true);
    fx.release(key.id);
    vi.advanceTimersByTime(30);
    expect(el.classList.contains('down')).toBe(true); // shown for at least a moment, even for a tap
    vi.advanceTimersByTime(200);
    expect(el.classList.contains('down')).toBe(false);
  });

  it('only sliding families draw a trail, and the violin shows its bow instead', () => {
    expect(hasTrail(layoutFor('piano', 360, 560, 'free'))).toBe(true);
    expect(hasTrail(layoutFor('harp', 360, 560, 'free'))).toBe(true);
    expect(hasTrail(layoutFor('guitar', 660, 290, 'free'))).toBe(true);
    expect(hasTrail(layoutFor('violin', 360, 560, 'free'))).toBe(false);
    expect(hasTrail(layoutFor('snare', 360, 560, 'free'))).toBe(false);
  });

  it('never leaves unlimited sprites behind, whatever is hit', () => {
    for (const kind of ['snare', 'gong', 'steelpan', 'flute', 'tambourine'] as const) {
      const { fx, svg, board } = setup(kind);
      for (let i = 0; i < 60; i++) for (const z of board.zones) fx.hit(z, 50, 50, 1);
      expect(svg.querySelector('.fx')!.childElementCount).toBeLessThanOrEqual(31);
      fx.destroy();
    }
  });
});
