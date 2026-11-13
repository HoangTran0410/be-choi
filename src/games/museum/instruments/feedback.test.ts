import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Regression: a touched instrument must always MOVE, not only sound. It once went silent on phones that
 * have "reduce motion" on (fx.ts returned early), and lite mode also trims effects: both must keep a
 * visible answer. jsdom has no Web Animations, so a recording stub stands in for `Element.animate`
 * (installed before fx.ts is imported, because it checks for it once).
 */
const h = vi.hoisted(() => {
  const calls: Array<{ target: Element; frames: unknown[] }> = [];
  const state = { reduce: false };
  const proto = Element.prototype as unknown as { animate: unknown };
  proto.animate = function (this: Element, frames: unknown[]) {
    calls.push({ target: this, frames });
    return { cancel() {}, onfinish: null, oncancel: null };
  };
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({ matches: state.reduce && q.includes('reduce'), media: q });
  return { calls, state };
});

import { perf } from '../../../core/frame';
import { createFx, type Fx } from './fx';
import { ALL_KINDS, createInstrument } from './index';
import { layoutFor } from './layout';
import { fakeContext } from '../../../core/testing';
import type { InstrumentKind, Zone } from './types';

function setup(kind: InstrumentKind): { fx: Fx; svg: SVGSVGElement; board: ReturnType<typeof layoutFor> } {
  const host = document.createElement('div');
  const board = layoutFor(kind, 360, 560, 'free');
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
  return { fx, svg, board };
}

const hitZone = (board: ReturnType<typeof layoutFor>): Zone =>
  board.zones.find((z) => z.role === 'play') ?? board.zones.find((z) => z.role === 'shake') ?? board.zones.find((z) => z.role === 'hole') ?? board.zones[0]!;

beforeEach(() => {
  vi.useFakeTimers();
  h.calls.length = 0;
});
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  h.state.reduce = false;
  perf.low = false;
});

const MODES: Array<[string, () => void]> = [
  ['normal', () => undefined],
  ['reduce motion', () => (h.state.reduce = true)],
  ['lite mode', () => (perf.low = true)],
];

for (const [mode, on] of MODES) {
  describe(`touch feedback (${mode})`, () => {
    beforeEach(on);

    for (const kind of ALL_KINDS) {
      it(`${kind}: a touch animates, presses or vibrates something`, () => {
        const { fx, svg, board } = setup(kind);
        const z = hitZone(board);
        const strings = [...svg.querySelectorAll<SVGPathElement>('path.str')];
        const straight = strings.map((s) => s.getAttribute('d'));
        if (strings.length && board.family !== 'harp' && board.family !== 'bow') fx.pluck(1, 0.9, { x: 100, y: 200 });
        else fx.hit(z, 100, 200, 0.9);
        fx.tick(0, 16);
        const moved = h.calls.some((c) => svg.contains(c.target) || c.target === svg);
        const pressed = svg.querySelector('.down') !== null;
        const vibrating = strings.some((s, i) => s.getAttribute('d') !== straight[i]);
        expect(moved || pressed || vibrating, `${kind} gave no feedback`).toBe(true);
      });
    }

    it('plucked strings of every string instrument bend and the pressed key gets its class', () => {
      for (const kind of ['guitar', 'ukulele', 'banjo', 'bass', 'violin', 'harp'] as const) {
        const { fx, svg } = setup(kind);
        const s = svg.querySelector<SVGPathElement>('path.str')!;
        const straight = s.getAttribute('d');
        fx.pluck(Number(s.dataset.s), 0.9, { x: 100, y: 200 });
        fx.tick(0, 16);
        expect(s.getAttribute('d'), kind).not.toBe(straight);
      }
      const { fx, svg, board } = setup('piano');
      const key = board.zones.find((z) => !z.small)!;
      fx.hit(key, 10, 10, 0.8);
      expect(svg.querySelector(`[data-z="${key.id}"]`)!.classList.contains('down')).toBe(true);
    });

    it('the whole instrument (maracas, tambourine, castanets, gong, chimes) is animated', () => {
      for (const kind of ['maracas', 'tambourine', 'castanets', 'gong', 'chimes'] as const) {
        h.calls.length = 0;
        const { fx, svg, board } = setup(kind);
        fx.hit(hitZone(board), 100, 200, 0.9);
        expect(h.calls.some((c) => svg.contains(c.target)), kind).toBe(true);
      }
    });
  });
}

describe('through the real instrument', () => {
  it('a tap on a drum from code starts an animation on the drawing', () => {
    const host = document.createElement('div');
    document.body.append(host);
    h.state.reduce = true;
    const inst = createInstrument('kick', host, fakeContext(), {});
    inst.hit('d:kick', 0.9);
    expect(h.calls.length).toBeGreaterThan(0);
    inst.destroy();
  });
});
