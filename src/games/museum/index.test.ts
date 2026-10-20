import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFrameLoop } from '../../core/frame';
import { fakeContext, type FakeContext } from '../../core/testing';
import { ENTRIES } from './catalog';
import game from './index';
import { emptyAlbum, SAVE_KEY, stepMs, TRACKS } from './logic';

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

let ctx: FakeContext;
let now = 100_000;

const click = (el: Element | null): void => {
  expect(el).not.toBeNull();
  for (const type of ['pointerdown', 'pointerup'])
    el!.dispatchEvent(new PointerEvent(type, { clientX: 5, clientY: 5, pointerId: 7, isPrimary: true, button: 0, bubbles: true }));
};
const tileOf = (id: string) => ctx.stage.querySelector(`.mu-tile[data-id="${id}"]`);
const ptr = (type: string, x: number, y: number) =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true });

function seed(stamps: string[], band: (string | null)[] = [null, null, null, null]): void {
  const a = emptyAlbum();
  a.stamps = stamps;
  a.band = band;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...a, v: 1 }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  localStorage.clear();
  ctx = fakeContext();
});
afterEach(() => {
  ctx.cleanup();
  resetFrameLoop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('museum: the room', () => {
  it('shows four cabinets with every instrument, a locked door and the album', () => {
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.mu-cab').length).toBe(4);
    expect(ctx.stage.querySelectorAll('.mu-tile').length).toBe(ENTRIES.length);
    expect(ctx.stage.querySelector('.mu-door.locked')).not.toBeNull();
    expect(ctx.stage.querySelector('.mu-albumbtn')).not.toBeNull();
    for (const el of ctx.stage.querySelectorAll('.mu-tile')) expect((el as HTMLElement).getAttribute('aria-label')).toBeTruthy();
  });

  it('a locked door explains itself kindly and does not open', () => {
    game.start(ctx);
    click(ctx.stage.querySelector('.mu-door'));
    expect(ctx.sequenced.join(' ')).toContain('tem');
    expect(ctx.stage.querySelector('.mu-band')).toBeNull();
  });

  it('marks collected instruments with a star', () => {
    seed(['harp']);
    game.start(ctx);
    expect(tileOf('harp')!.classList.contains('stamped')).toBe(true);
    expect(tileOf('gong')!.classList.contains('stamped')).toBe(false);
  });
});

describe('museum: a table', () => {
  it('opens an instrument, says its name slowly, and goes back', () => {
    game.start(ctx);
    click(tileOf('marimba'));
    expect(ctx.stage.querySelector('.mu-table')).not.toBeNull();
    expect(ctx.stage.querySelector('.inst svg')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.mu-pill').length).toBe(4);
    vi.advanceTimersByTime(500);
    expect(ctx.sequenced.join(' ')).toContain('đàn, ma, rim, ba');
    click(ctx.stage.querySelector('.mu-back'));
    expect(ctx.stage.querySelector('.mu-room')).not.toBeNull();
    expect(ctx.stage.querySelector('.mu-table')).toBeNull();
  });

  it('earns the stamp by playing: three places, fast, slow, soft and loud', () => {
    game.start(ctx);
    click(tileOf('xylo'));
    const root = ctx.stage.querySelector('.inst')!;
    // read the bars from the drawing: the jsdom fallback board is 360×560, portrait
    const bars = Array.from(root.querySelectorAll<SVGElement>('[data-z]')).map((el) => el.dataset.z!);
    expect(bars.length).toBe(8);
    const rects = bars.map((id) => root.querySelector(`[data-z="${id}"] rect`)!);
    const centre = (r: Element) => ({
      x: Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2,
      y: Number(r.getAttribute('y')) + Number(r.getAttribute('height')) / 2,
    });
    const tap = (i: number): void => {
      const c = centre(rects[i]!);
      root.dispatchEvent(ptr('pointerdown', c.x, c.y));
      root.dispatchEvent(ptr('pointerup', c.x, c.y));
    };
    now += 10_000;
    tap(0); // first touch
    now += 2000;
    tap(1); // slow
    now += 2000;
    tap(2); // slow, third place
    for (let i = 0; i < 6; i++) {
      now += 200;
      tap(i % 8); // fast and loud
    }
    expect(ctx.stage.querySelectorAll('.mu-pill.done').length).toBe(4);
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    expect(saved.stamps).toEqual(['xylo']);
    expect(saved.v).toBe(1);
    expect(ctx.stage.querySelector('.mu-stamp')).not.toBeNull();
    // playing again never earns a second stamp
    tap(3);
    expect(ctx.stars).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(ctx.stage.querySelector('.mu-stamp')).toBeNull();
  });

  it('shows an instrument already collected with its missions done', () => {
    seed(['gong']);
    game.start(ctx);
    click(tileOf('gong'));
    expect(ctx.stage.querySelectorAll('.mu-pill.done').length).toBe(4);
  });
});

describe('museum: the album', () => {
  it('lists every stamp and opens an instrument when touched', () => {
    seed(['harp', 'gong']);
    game.start(ctx);
    click(ctx.stage.querySelector('.mu-albumbtn'));
    expect(ctx.stage.querySelectorAll('.mu-album .mu-tile').length).toBe(ENTRIES.length);
    expect(ctx.stage.querySelectorAll('.mu-album .mu-tile.got').length).toBe(2);
    click(ctx.stage.querySelector('.mu-album .mu-tile.got'));
    expect(ctx.stage.querySelector('.mu-table')).not.toBeNull();
  });
});

describe('museum: the orchestra', () => {
  const five = ['marimba', 'harp', 'gong', 'piano', 'djembe'];

  it('opens at five stamps, seats two instruments and plays the backing by itself', () => {
    seed(five);
    game.start(ctx);
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    click(ctx.stage.querySelector('.mu-door.open'));
    expect(ctx.stage.querySelector('.mu-band')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.mu-slot.full').length).toBe(2);
    expect(ctx.stage.querySelector('.mu-slot.focus')).not.toBeNull();
    expect(ctx.stage.querySelector('.inst')).not.toBeNull();
    // one bar of the first track
    for (let i = 0; i < 16; i++) {
      now += stepMs(TRACKS[0]!);
      vi.advanceTimersByTime(stepMs(TRACKS[0]!) + 5);
    }
    expect(drum).toHaveBeenCalled();
    expect(note).toHaveBeenCalled();
    // pause stops it
    click(ctx.stage.querySelector('.mu-play'));
    const n = drum.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(drum.mock.calls.length).toBe(n);
  });

  it('lets the child pick from collected instruments only', () => {
    seed(five, ['marimba', null, null, null]);
    game.start(ctx);
    click(ctx.stage.querySelector('.mu-door'));
    const empty = ctx.stage.querySelectorAll('.mu-slot')[2]!;
    click(empty);
    const picker = ctx.stage.querySelector('.mu-picker')!;
    expect(picker.hasAttribute('hidden')).toBe(false);
    click(picker.querySelector('.mu-tile.locked'));
    expect(ctx.sequenced.join(' ')).toContain('tem');
    expect(picker.hasAttribute('hidden')).toBe(false);
    click(picker.querySelector('.mu-tile[data-id="harp"]'));
    expect(picker.hasAttribute('hidden')).toBe(true);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).band[2]).toBe('harp');
  });

  it('plays the first track in C: the instrument in hand is pentatonic', () => {
    seed(five, ['piano', 'harp', null, null]);
    game.start(ctx);
    click(ctx.stage.querySelector('.mu-door'));
    const note = vi.spyOn(ctx.audio, 'note');
    const root = ctx.stage.querySelector('.inst')!;
    // a black key of the piano, in the drawing
    const black = root.querySelector('[data-z="k61"] rect')!;
    const x = Number(black.getAttribute('x')) + 4;
    const y = Number(black.getAttribute('y')) + 4;
    root.dispatchEvent(ptr('pointerdown', x, y));
    const last = note.mock.calls.at(-1)!;
    expect(last[2]).toBe('piano');
    expect(Math.round(12 * Math.log2(last[0] / 440) + 69) % 12).toBe(2); // C# snapped to D
  });
});

describe('museum: leaving', () => {
  it('stops everything when the child leaves', () => {
    seed(['marimba', 'harp', 'gong', 'piano', 'djembe']);
    game.start(ctx);
    click(ctx.stage.querySelector('.mu-door'));
    ctx.cleanup();
    const drum = vi.spyOn(ctx.audio, 'drum');
    vi.advanceTimersByTime(10_000);
    expect(drum).not.toHaveBeenCalled();
    ctx = fakeContext(); // so afterEach has something to clean up
  });
});
