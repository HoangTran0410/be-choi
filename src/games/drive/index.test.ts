import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { VEHICLES, makeRoad, propAt, riderAt, slotX } from './logic';
import { jobOf, vehicleFor } from './jobs';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
    }
  };
}

const ptr = (type: string, x = 0, y = 0): PointerEvent => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });

/** A canvas that records nothing and refuses nothing, so the draw path really runs. */
function fake2d(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const W = 420;
const H = 620;
const ROAD = makeRoad(W, H);

function size(el: HTMLElement, w: number, hgt: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: hgt, configurable: true });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: hgt, width: w, height: hgt, toJSON: () => ({}) }) as DOMRect;
}

/** Frames off the fake clock, with a stamp this file owns. */
function driveFrames(): void {
  let stamp = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) =>
      setTimeout(() => {
        stamp += 16;
        cb(stamp);
      }, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
}

function mount() {
  vi.useFakeTimers();
  driveFrames();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  const ctx = fakeContext();
  game.start(ctx);
  const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.drive-canvas')!;
  const view = ctx.stage.querySelector<HTMLElement>('.drive-view')!;
  size(view, W, H);
  size(canvas, W, H);
  vi.advanceTimersByTime(100);
  return { ctx, canvas, view };
}

/** Hold the forward pedal — which is how a child drives — until `done`. */
async function driveUntil(ctx: { stage: HTMLElement }, done: () => boolean, maxMs = 20000): Promise<boolean> {
  const fwd = ctx.stage.querySelector<HTMLElement>('.drive-go.fwd')!;
  fwd.dispatchEvent(ptr('pointerdown'));
  for (let waited = 0; waited < maxMs; waited += 250) {
    await vi.advanceTimersByTimeAsync(250);
    if (done()) break;
  }
  fwd.dispatchEvent(ptr('pointerup'));
  return done();
}

/** Open the garage door and take a vehicle out of it. */
function pickVehicle(ctx: { stage: HTMLElement }, id: string): HTMLElement {
  const garage = ctx.stage.querySelector<HTMLElement>('.drive-garage')!;
  garage.dispatchEvent(ptr('pointerdown'));
  garage.dispatchEvent(ptr('pointerup'));
  // The tap that opened the door is not allowed to also choose from it.
  vi.advanceTimersByTime(300);
  const tile = ctx.stage.querySelector<HTMLElement>(`.drive-pick[data-vehicle="${id}"]`)!;
  tile.dispatchEvent(ptr('pointerup'));
  return garage;
}

describe('drive game', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a road, a horn, two pedals and a garage door, and survives with no canvas', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    expect(ctx.stage.querySelector('canvas.drive-canvas')).not.toBeNull();
    expect(ctx.stage.querySelector('.drive-horn')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.drive-go').length).toBe(2);
    // Nothing to choose from until the door is opened.
    expect(ctx.stage.querySelectorAll('.drive-pick').length).toBe(0);
    expect(ctx.stage.querySelector('.drive-garage')?.getAttribute('data-vehicle')).toBe(VEHICLES[0]?.id);
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
  });

  it('keeps the five vehicles behind one door, and says what the new one is for', () => {
    const { ctx } = mount();
    const garage = ctx.stage.querySelector<HTMLElement>('.drive-garage')!;
    garage.dispatchEvent(ptr('pointerdown'));
    garage.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelectorAll('.drive-pick').length).toBe(VEHICLES.length);
    expect(ctx.stage.querySelector('.drive-pick.selected')?.getAttribute('data-vehicle')).toBe(VEHICLES[0]?.id);

    // A finger still down from opening the door must not choose for the child.
    const fire = ctx.stage.querySelector<HTMLElement>('.drive-pick[data-vehicle="fire"]')!;
    fire.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelectorAll('.drive-pick').length).toBe(VEHICLES.length);

    vi.advanceTimersByTime(300);
    fire.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelectorAll('.drive-pick').length).toBe(0);
    expect(garage.getAttribute('data-vehicle')).toBe('fire');
    expect(garage.textContent).toBe('🚒');
    expect(ctx.spoken.at(-1)).toContain('xe cứu hoả');
    expect(ctx.spoken.at(-1)).toContain('dập lửa');
    ctx.cleanup();
  });

  it('drives to the first stop, picks the passenger up and takes them home', async () => {
    const { ctx } = mount();
    const stop = propAt(ROAD, 2);
    expect(stop.kind).toBe('stop');
    const rider = riderAt(2);
    const badge = ctx.stage.querySelector<HTMLElement>('.drive-badge')!;

    expect(await driveUntil(ctx, () => !badge.hidden)).toBe(true);
    expect(badge.textContent).toBe(rider.emoji);
    expect(ctx.spoken.some((s) => s.includes(rider.name))).toBe(true);

    // The house three slots on takes them in, and the second fare earns the star.
    expect(await driveUntil(ctx, () => ctx.stars > 0)).toBe(true);
    expect(ctx.spoken.some((s) => s.includes('về tới nhà'))).toBe(true);
    expect(ctx.celebrations).toBe(1);
    expect(slotX(ROAD, 5)).toBeGreaterThan(stop.x);
    ctx.cleanup();
  });

  it('honks with the horn of the vehicle in use', () => {
    const { ctx } = mount();
    const fx = vi.fn();
    ctx.audio.fx = fx;
    ctx.stage.querySelector<HTMLElement>('.drive-horn')!.dispatchEvent(ptr('pointerdown'));
    expect(fx).toHaveBeenCalledWith(VEHICLES[0]?.horn);
    ctx.cleanup();
  });

  it('turns the lights out and back on', () => {
    const { ctx } = mount();
    const root = ctx.stage.querySelector<HTMLElement>('.drive')!;
    const btn = ctx.stage.querySelector<HTMLElement>('.drive-night')!;
    expect(root.classList.contains('night')).toBe(false);
    btn.dispatchEvent(ptr('pointerdown'));
    expect(root.classList.contains('night')).toBe(true);
    expect(btn.textContent).toBe('☀️');
    expect(ctx.spoken.at(-1)).toContain('tối');
    btn.dispatchEvent(ptr('pointerdown'));
    expect(root.classList.contains('night')).toBe(false);
    expect(btn.textContent).toBe('🌙');
    ctx.cleanup();
  });

  it('answers a poke at the roadside, and a poke never drives the car', () => {
    const { ctx, canvas } = mount();
    const pop = vi.fn();
    ctx.audio.pop = pop;
    const bar = ctx.stage.querySelector<HTMLElement>('.drive-fuel i')!;
    // The camera starts with the car a third of the way in, so the first house is on screen.
    expect(propAt(ROAD, 0).kind).toBe('house');
    canvas.dispatchEvent(ptr('pointerdown', 14, H * 0.5));
    expect(ctx.spoken.at(-1)).toBe('Có người ở nhà!');
    expect(pop).toHaveBeenCalled();
    // The road is for prodding: touching it burns not a drop of fuel.
    vi.advanceTimersByTime(1500);
    expect(bar.style.width).toBe('100%');
    ctx.cleanup();
  });

  it('offers both ways at the fork and takes the one the child picks', async () => {
    const { ctx } = mount();
    const root = ctx.stage.querySelector<HTMLElement>('.drive')!;
    const panel = ctx.stage.querySelector<HTMLElement>('.drive-fork')!;
    expect(panel.hidden).toBe(true);

    expect(await driveUntil(ctx, () => !panel.hidden, 30000)).toBe(true);
    expect(ctx.spoken).toContain('Bé chọn đường nào?');
    const ways = [...panel.querySelectorAll<HTMLElement>('.drive-way')];
    expect(ways.length).toBe(2);
    expect(ways[0]?.classList.contains('up')).toBe(true);
    expect(ways[1]?.classList.contains('down')).toBe(true);
    expect(ways[0]?.dataset.way).not.toBe(ways[1]?.dataset.way);

    const wanted = ways[1]!.getAttribute('aria-label');
    ways[1]!.dispatchEvent(ptr('pointerdown'));
    expect(panel.hidden).toBe(true);
    expect(ctx.spoken.at(-1)).toBe(`Đi ${wanted} nhé!`);
    expect(root.dataset.way).toBe(wanted);
    // And the road really goes there: the place changes as the car drives on.
    await driveUntil(ctx, () => root.dataset.place === ways[1]?.dataset.way, 20000);
    expect(root.dataset.place).toBe(ways[1]?.dataset.way);
    ctx.cleanup();
  });

  it('gives the lorry parcels instead of passengers, and empties the back on the way', async () => {
    const { ctx } = mount();
    const badge = ctx.stage.querySelector<HTMLElement>('.drive-badge')!;
    pickVehicle(ctx, 'truck');

    expect(await driveUntil(ctx, () => !badge.hidden, 30000)).toBe(true);
    expect(badge.textContent).not.toBe(riderAt(2).emoji);
    expect(ctx.spoken.some((line) => line.includes('đi giao'))).toBe(true);
    // Swapping to a different job tips the load out rather than carrying crates in a bus.
    pickVehicle(ctx, 'car');
    expect(badge.hidden).toBe(true);
    ctx.cleanup();
  });

  it('takes one crop per field, however long the tractor sits on it', async () => {
    const { ctx } = mount();
    const badge = ctx.stage.querySelector<HTMLElement>('.drive-badge')!;
    pickVehicle(ctx, 'tractor');
    expect(jobOf(vehicleFor('tractor')).capacity).toBeGreaterThan(1);

    expect(await driveUntil(ctx, () => !badge.hidden, 30000)).toBe(true);
    const first = badge.textContent;
    expect(first?.length).toBeGreaterThan(0);
    // Standing on the same field for a good while adds nothing to the back.
    await vi.advanceTimersByTimeAsync(3000);
    expect(badge.textContent).toBe(first);
    ctx.cleanup();
  });

  it('sends the fire engine to a burning house and puts the fire out', async () => {
    const { ctx } = mount();
    pickVehicle(ctx, 'fire');
    const act = ctx.stage.querySelector<HTMLElement>('.drive-act')!;
    expect(act.hidden).toBe(true);

    expect(await driveUntil(ctx, () => !act.hidden && act.textContent === '💦', 60000)).toBe(true);
    act.dispatchEvent(ptr('pointerdown'));
    await vi.advanceTimersByTimeAsync(3000);
    act.dispatchEvent(ptr('pointerup'));
    expect(ctx.spoken.some((line) => line.includes('Dập tắt lửa'))).toBe(true);
    ctx.cleanup();
  });

  it('burns fuel as it drives and shows how much is left', async () => {
    const { ctx } = mount();
    const bar = ctx.stage.querySelector<HTMLElement>('.drive-fuel i')!;
    expect(bar.style.width).toBe('100%');
    await driveUntil(ctx, () => parseInt(bar.style.width, 10) < 100, 20000);
    expect(parseInt(bar.style.width, 10)).toBeLessThan(100);
    expect(parseInt(bar.style.width, 10)).toBeGreaterThan(50);
    ctx.cleanup();
  });

  it('keeps drawing frame after frame and never leaves the start of the road', () => {
    const { ctx, canvas } = mount();
    const back = ctx.stage.querySelector<HTMLElement>('.drive-go.back')!;
    back.dispatchEvent(ptr('pointerdown'));
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    back.dispatchEvent(ptr('pointerup'));
    expect(canvas.width).toBe(W);
    expect(canvas.height).toBe(H);
    ctx.cleanup();
  });
});
