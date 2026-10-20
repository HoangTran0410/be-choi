import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../../core/testing';
import { resetFrameLoop } from '../../../core/frame';
import { createInstrument } from './index';
import { shapeCenter } from './svg';
import { crossed, nearestLine, velocityFromGap } from './touch';
import type { InstrumentHandle, InstrumentKind, NoteEvent, Zone } from './types';
import { voiceMidi } from './voices';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

function ptr(type: string, x: number, y: number, id = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true, bubbles: true });
}

let ctx: FakeContext;
let host: HTMLElement;

function make(
  kind: InstrumentKind,
  harmony: 'free' | 'pentatonic' = 'free',
): { inst: InstrumentHandle; events: NoteEvent[]; root: Element } {
  const inst = createInstrument(kind, host, ctx, { harmony });
  const events: NoteEvent[] = [];
  inst.onNote((e) => events.push(e));
  return { inst, events, root: host.querySelector('.inst')! };
}
const at = (z: Zone) => shapeCenter(z.shape);
const down = (root: Element, z: Zone, id = 1) => root.dispatchEvent(ptr('pointerdown', at(z).x, at(z).y, id));
const move = (root: Element, x: number, y: number, id = 1) => root.dispatchEvent(ptr('pointermove', x, y, id));
const up = (root: Element, id = 1) => root.dispatchEvent(ptr('pointerup', 0, 0, id));

beforeEach(() => {
  vi.useFakeTimers();
  ctx = fakeContext();
  host = document.createElement('div');
  ctx.stage.append(host);
});
afterEach(() => {
  ctx.cleanup();
  resetFrameLoop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createInstrument', () => {
  it('draws an svg with a group for every zone and tells you its board', () => {
    const { inst } = make('piano');
    expect(host.querySelector('svg')).not.toBeNull();
    const b = inst.board();
    for (const z of b.zones) expect(host.querySelector(`[data-z="${z.id}"]`), z.id).not.toBeNull();
  });

  it('plays the note under the finger, and a slide across the keys plays each key crossed', () => {
    const note = vi.spyOn(ctx.audio, 'note');
    const { inst, events, root } = make('piano');
    expect(inst.board().portrait).toBe(true); // jsdom has no layout, so the fallback board is portrait
    const sorted = inst
      .board()
      .zones.filter((z) => !z.small)
      .sort((a, b) => at(b).y - at(a).y);
    down(root, sorted[0]!);
    expect(note).toHaveBeenCalledTimes(1);
    expect(voiceMidi(events[0]!.voice!)).toBe(60);
    // along the middle of the keys the finger runs over the black keys too, like a real glissando
    for (let i = 1; i < 4; i++) move(root, at(sorted[i]!).x, at(sorted[i]!).y);
    up(root);
    vi.advanceTimersByTime(300);
    expect(events.map((e) => voiceMidi(e.voice!))).toEqual([60, 61, 62, 63, 64, 65]);
  });

  it('a flick that jumps over many keys still plays every key in between, in order, one after another', () => {
    const { inst, events, root } = make('piano');
    const white = inst
      .board()
      .zones.filter((z) => !z.small)
      .sort((a, b) => at(b).y - at(a).y);
    // slide along the bottom end of the keys (no black keys there) in one single jump from C to the next C
    const edge = (z: Zone) => ({ x: z.shape.t === 'rect' ? z.shape.x + z.shape.w * 0.92 : 0, y: at(z).y });
    root.dispatchEvent(ptr('pointerdown', edge(white[0]!).x, edge(white[0]!).y));
    move(root, edge(white[7]!).x, edge(white[7]!).y);
    expect(events.length).toBeLessThan(8); // not all at once: the rest follow a moment later
    vi.advanceTimersByTime(400);
    up(root);
    expect(events.map((e) => voiceMidi(e.voice!))).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('a finger that jitters across the edge of a key does not stutter the note', () => {
    let t = 50_000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const { inst, events, root } = make('marimba');
    const bars = inst.board().zones;
    const a = at(bars[0]!);
    const b = at(bars[1]!);
    down(root, bars[0]!);
    for (let i = 0; i < 6; i++) {
      t += 8;
      move(root, i % 2 ? a.x : b.x, i % 2 ? a.y : b.y);
    }
    up(root);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('plays quick taps louder than slow ones', () => {
    let t = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const { inst, events, root } = make('marimba');
    const z = inst.board().zones[0]!;
    down(root, z);
    up(root);
    t += 2000;
    down(root, z);
    up(root);
    t += 80;
    down(root, z);
    expect(events.length).toBe(3);
    expect(events[1]!.vel).toBeCloseTo(0.4);
    expect(events[2]!.vel).toBe(1);
  });

  it('pentatonic mode snaps the black keys', () => {
    const { inst, events, root } = make('piano', 'pentatonic');
    const black = inst.board().zones.find((z) => z.id === 'k61')!;
    down(root, black);
    expect(voiceMidi(events[0]!.voice!)).toBe(62);
  });

  it('a silent instrument ignores touches', () => {
    const note = vi.spyOn(ctx.audio, 'note');
    const { inst, root } = make('piano');
    inst.setEnabled(false);
    down(root, inst.board().zones[0]!);
    expect(note).not.toHaveBeenCalled();
  });

  it('cleans up: no timers, no listeners on window, root removed', () => {
    const before = vi.getTimerCount();
    const add = vi.spyOn(window, 'addEventListener');
    const { inst, root } = make('flute');
    down(
      root,
      inst.board().zones.find((z) => z.role === 'blow')!,
    );
    inst.destroy();
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
    expect(host.querySelector('.inst')).toBeNull();
    for (const [type] of add.mock.calls) expect(['resize', 'devicemotion']).toContain(type);
  });
});

describe('strumming', () => {
  it('a tap strums every string of the chosen chord, a chord cell changes the chord', () => {
    const note = vi.spyOn(ctx.audio, 'note');
    const { inst, events, root } = make('guitar');
    const b = inst.board();
    const strum = b.zones.find((z) => z.role === 'strum')!;
    down(root, strum);
    up(root);
    vi.advanceTimersByTime(500);
    expect(note).toHaveBeenCalledTimes(5); // C: the low E string is muted
    const g = b.zones.find((z) => z.id === 'chord:G')!;
    down(root, g);
    up(root);
    vi.advanceTimersByTime(500);
    events.length = 0;
    down(root, strum);
    up(root);
    vi.advanceTimersByTime(500);
    expect(events.length).toBe(6);
    expect(events.every((e) => e.zoneId.startsWith('string'))).toBe(true);
    expect(host.querySelector('[data-z="chord:G"]')!.classList.contains('sel')).toBe(true);
  });

  it('swiping across the strings plucks each one crossed, in order', () => {
    const { inst, events, root } = make('ukulele');
    const b = inst.board();
    const strum = b.zones.find((z) => z.role === 'strum')!;
    const lines = b.strum!.lines;
    const horizontal = b.strum!.axis === 'x';
    const c = at(strum);
    root.dispatchEvent(ptr('pointerdown', horizontal ? lines[0]! : c.x, horizontal ? c.y : lines[0]!));
    for (let j = 1; j < lines.length; j++) move(root, horizontal ? lines[j]! : c.x, horizontal ? c.y : lines[j]!);
    up(root);
    vi.advanceTimersByTime(300);
    expect(events.map((e) => e.zoneId)).toEqual(['string1', 'string2', 'string3']);
  });
});

describe('wind', () => {
  it('covering holes lowers the note and blowing keeps renewing it while held', () => {
    const { inst, events, root } = make('flute', 'pentatonic');
    const b = inst.board();
    const blow = b.zones.find((z) => z.role === 'blow')!;
    down(root, blow);
    const open = voiceMidi(events[0]!.voice!)!;
    vi.advanceTimersByTime(2000);
    expect(events.length).toBeGreaterThan(2); // renewed while held
    up(root);
    const n = events.length;
    vi.advanceTimersByTime(3000);
    expect(events.length).toBe(n); // stopped when the finger lifted
    for (const id of b.holes!.slice(0, 2)) {
      down(
        root,
        b.zones.find((z) => z.id === id)!,
      );
      up(root);
    }
    events.length = 0;
    down(root, blow);
    up(root);
    expect(voiceMidi(events[0]!.voice!)!).toBeLessThan(open);
  });
});

describe('gong and shakers', () => {
  it('a finger left on the gong damps it, a finger that moves does not', () => {
    const stop = vi.fn();
    vi.spyOn(ctx.audio, 'inst').mockReturnValue({ stop });
    const { inst, root } = make('gong');
    const boss = inst.board().zones.find((z) => z.id === 'gong:boss')!;
    down(root, boss);
    vi.advanceTimersByTime(600);
    expect(stop).toHaveBeenCalledTimes(1);
    up(root);
    down(root, boss);
    move(root, at(boss).x + 30, at(boss).y + 30);
    vi.advanceTimersByTime(600);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('waving a finger across the maracas shakes them', () => {
    const { inst, events, root } = make('maracas');
    const z = inst.board().zones[0]!;
    const c = at(z);
    down(root, z);
    for (let i = 0; i < 12; i++) move(root, c.x + (i % 2 ? 40 : -40), c.y);
    expect(events.length).toBeGreaterThan(3);
  });
});

describe('every kind can be created, hit and destroyed', () => {
  it('survives a hit on every zone', async () => {
    const { ALL_KINDS } = await import('./layout');
    for (const kind of ALL_KINDS) {
      const { inst, root } = make(kind);
      for (const z of inst.board().zones) {
        inst.hit(z.id, 0.7);
        down(root, z);
        up(root);
      }
      vi.advanceTimersByTime(600);
      inst.destroy();
    }
  });
});

describe('touch helpers', () => {
  it('maps pace to velocity', () => {
    expect(velocityFromGap(null)).toBeCloseTo(0.65);
    expect(velocityFromGap(50)).toBe(1);
    expect(velocityFromGap(5000)).toBeCloseTo(0.4);
    expect(velocityFromGap(400)).toBeGreaterThan(velocityFromGap(800));
  });
  it('finds strings', () => {
    expect(nearestLine([10, 20, 30], 26)).toBe(2);
    expect(crossed(0, 3)).toEqual([1, 2, 3]);
    expect(crossed(3, 1)).toEqual([2, 1]);
    expect(crossed(2, 2)).toEqual([]);
  });
});
