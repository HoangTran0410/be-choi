import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import type { Loop } from '../../core/audio';
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

const ptr = (): PointerEvent => new PointerEvent('pointerdown', { pointerId: 1, bubbles: true });

function mount() {
  const ctx = fakeContext();
  const started: string[] = [];
  const stopped: string[] = [];
  let release: () => void = () => undefined;
  let hold = false;
  ctx.audio.loop = (url) => {
    const loop: Loop = { setVolume: () => undefined, stop: () => stopped.push(url) };
    if (!hold) {
      started.push(url);
      return Promise.resolve(loop);
    }
    return new Promise((res) => {
      release = () => {
        started.push(url);
        res(loop);
      };
    });
  };
  game.start(ctx);
  return {
    ctx,
    started,
    stopped,
    holdLoads: () => (hold = true),
    finishLoad: () => release(),
  };
}

const tile = (ctx: ReturnType<typeof fakeContext>, id: string) => ctx.stage.querySelector<HTMLElement>(`.amb-tile[data-id="${id}"]`)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ambience game', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom has no canvas; the picture is not what these tests are about.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens on the first shelf, silent', () => {
    const { ctx, started } = mount();
    expect(ctx.stage.querySelectorAll('.amb-tab').length).toBeGreaterThanOrEqual(5);
    expect(tile(ctx, 'rain')).not.toBeNull();
    expect(started).toEqual([]);
    ctx.cleanup();
  });

  it('switches a loop on, then off again', async () => {
    const { ctx, started, stopped } = mount();
    tile(ctx, 'rain').dispatchEvent(ptr());
    await flush();
    expect(started).toEqual(['ambience/rain.m4a']);
    expect(tile(ctx, 'rain').classList.contains('amb-on')).toBe(true);
    expect(ctx.spoken.at(-1)).toBe('Mưa rơi');
    tile(ctx, 'rain').dispatchEvent(ptr());
    expect(stopped).toEqual(['ambience/rain.m4a']);
    expect(tile(ctx, 'rain').classList.contains('amb-on')).toBe(false);
    ctx.cleanup();
  });

  it('spins a switch while its sound downloads, and drops it if switched off meanwhile', async () => {
    const m = mount();
    m.holdLoads();
    tile(m.ctx, 'wind').dispatchEvent(ptr());
    expect(tile(m.ctx, 'wind').classList.contains('amb-loading')).toBe(true);
    tile(m.ctx, 'wind').dispatchEvent(ptr());
    m.finishLoad();
    await flush();
    expect(tile(m.ctx, 'wind').classList.contains('amb-loading')).toBe(false);
    expect(m.stopped).toEqual(['ambience/wind.m4a']);
    m.ctx.cleanup();
  });

  it('switches everything off with the hush button', async () => {
    const { ctx, stopped } = mount();
    tile(ctx, 'rain').dispatchEvent(ptr());
    tile(ctx, 'wind').dispatchEvent(ptr());
    await flush();
    ctx.stage.querySelector<HTMLElement>('.amb-hush')!.dispatchEvent(ptr());
    expect(stopped.length).toBe(2);
    expect(ctx.stage.querySelectorAll('.amb-on').length).toBe(0);
    ctx.cleanup();
  });

  it('remembers what was on, and plays it again next time', async () => {
    const a = mount();
    tile(a.ctx, 'thunder').dispatchEvent(ptr());
    await flush();
    a.ctx.cleanup();
    const b = mount();
    await flush();
    expect(b.started).toEqual(['ambience/thunder.m4a']);
    b.ctx.cleanup();
  });

  it('stops every loop when the child leaves', async () => {
    const { ctx, stopped } = mount();
    tile(ctx, 'rain').dispatchEvent(ptr());
    await flush();
    ctx.cleanup();
    expect(stopped).toEqual(['ambience/rain.m4a']);
  });

  it('gives a star the first time three are mixed', async () => {
    const { ctx } = mount();
    for (const id of ['rain', 'wind', 'thunder']) tile(ctx, id).dispatchEvent(ptr());
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('lets the picture list scroll: a touch that lands on a picture does not choose it, a tap does', () => {
    const { ctx } = mount();
    ctx.stage.querySelector<HTMLElement>('.amb-pictures')!.dispatchEvent(ptr());
    const picker = ctx.stage.querySelector<HTMLElement>('.amb-picker')!;
    expect(picker.hidden).toBe(false);
    const card = ctx.stage.querySelector<HTMLElement>('.amb-pick[data-backdrop="sunset"]')!;
    card.dispatchEvent(ptr());
    expect(picker.hidden).toBe(false);
    // Its touches never reach the shell, which would cancel the scroll.
    let reached = false;
    const spy = () => (reached = true);
    document.addEventListener('touchmove', spy);
    card.dispatchEvent(new Event('touchmove', { bubbles: true }));
    document.removeEventListener('touchmove', spy);
    expect(reached).toBe(false);
    card.click();
    expect(picker.hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem('be-choi:ambience')!).backdrop).toBe('sunset');
    ctx.cleanup();
  });
});
