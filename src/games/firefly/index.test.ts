import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { BLOW_GAP_MS, BURSTS, CANDLES, STAR_EVERY } from './logic';
import game from './index';

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

function ptr(type: string): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, button: 0, isPrimary: true, bubbles: true });
}

function tap(el: Element): void {
  el.dispatchEvent(ptr('pointerdown'));
  el.dispatchEvent(ptr('pointerup'));
}

function q<T extends Element = HTMLElement>(ctx: FakeContext, sel: string): T {
  const el = ctx.stage.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}
function all(ctx: FakeContext, sel: string): HTMLElement[] {
  return [...ctx.stage.querySelectorAll<HTMLElement>(sel)];
}

/** Enough of a 2d context for the fireworks to draw into; every call is recorded. */
function fake2d() {
  const gradient = { addColorStop: vi.fn() };
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    lineCap: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '' as string | typeof gradient,
    globalAlpha: 1,
    globalCompositeOperation: '',
  };
}

/** jsdom has no canvas backend; without this it complains once a frame. */
function fakeCanvas(): ReturnType<typeof fake2d> {
  const c = fake2d();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => c as unknown as CanvasRenderingContext2D);
  return c;
}

/** Give the field a size: jsdom lays nothing out, so every client box is zero. */
function size(el: HTMLElement, w: number, hgt: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: hgt, configurable: true });
}

/**
 * Run the animation frames off the fake timer clock, with a frame stamp this file
 * owns. Whether vitest fakes rAF and `performance` varies; the drift must not.
 */
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

/** A microphone that reports whatever `byte` is set to. 128 is silence, 255 a hard blow. */
function fakeBlowMic(): { set(byte: number): void; close: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } {
  let byte = 128;
  const stop = vi.fn();
  const close = vi.fn(() => Promise.resolve());
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => stream }, configurable: true });
  class FakeAudioContext {
    state = 'running';
    createAnalyser() {
      return {
        fftSize: 2048,
        getByteTimeDomainData(buf: Uint8Array) {
          buf.fill(byte);
        },
      };
    }
    createMediaStreamSource() {
      return { connect: vi.fn() };
    }
    resume() {
      return Promise.resolve();
    }
    close = close;
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return {
    set(v: number) {
      byte = v;
    },
    close,
    stop,
  };
}

/** Open the microphone and let the permission promise settle. */
async function listen(ctx: FakeContext): Promise<HTMLElement> {
  const mic = q(ctx, '.fly-mic');
  tap(mic);
  await vi.advanceTimersByTimeAsync(0);
  return mic;
}

const lean = (ctx: FakeContext): number => parseFloat(q(ctx, '.fly-grass').style.getPropertyValue('--fly-lean') || '0');

describe('firefly game', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });

  it('opens on a sky, a moon, fireflies, grass and a row of unlit candles', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    expect(all(ctx, '.fly-star').length).toBeGreaterThan(20);
    expect(all(ctx, '.fly-bug').length).toBeGreaterThan(3);
    expect(all(ctx, '.fly-blade').length).toBeGreaterThan(10);
    expect(all(ctx, '.fly-candle').length).toBe(CANDLES);
    expect(ctx.stage.querySelector('.fly-moon')).not.toBeNull();
    // Nothing is alight and nothing is asked of the child.
    expect(all(ctx, '.fly-candle.fly-lit').length).toBe(0);
    expect(ctx.stage.querySelector('.fly-flame')).toBeNull();
    ctx.cleanup();
  });

  it('the fireflies drift on their own, with no touch at all', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);
    vi.advanceTimersByTime(100);
    const first = q(ctx, '.fly-bug').style.transform;
    vi.advanceTimersByTime(600);
    expect(q(ctx, '.fly-bug').style.transform).not.toBe(first);
    expect(first).toMatch(/translate/);
    ctx.cleanup();
  });

  it('a tap on a firefly chimes and names it once', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    const ding = vi.spyOn(ctx.audio, 'ding');
    game.start(ctx);
    const bugs = all(ctx, '.fly-bug');
    bugs[0]?.dispatchEvent(ptr('pointerdown'));
    expect(ding).toHaveBeenCalledTimes(1);
    expect(bugs[0]?.classList.contains('fly-bug-hit')).toBe(true);
    expect(ctx.spoken).toContain('Con đom đóm!');
    // Said once: the field is for looking at, not for being talked at.
    bugs[1]?.dispatchEvent(ptr('pointerdown'));
    expect(ctx.spoken.filter((s) => s === 'Con đom đóm!').length).toBe(1);
    ctx.cleanup();
  });

  it('a tap on a star sparkles, and now and then one slides across the sky', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const ctx = fakeContext();
    const fx = vi.spyOn(ctx.audio, 'fx');
    game.start(ctx);
    const star = q(ctx, '.fly-star');
    star.dispatchEvent(ptr('pointerdown'));
    expect(fx).toHaveBeenCalledWith('sparkle');
    expect(star.classList.contains('fly-star-hit')).toBe(true);
    expect(all(ctx, '.fly-shoot').length).toBe(1);
    // The streak clears itself up.
    vi.advanceTimersByTime(1200);
    expect(all(ctx, '.fly-shoot').length).toBe(0);
    ctx.cleanup();
  });

  it('the candle lights on a touch and goes out with a puff on the next one', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    game.start(ctx);
    const candle = q(ctx, '.fly-candle');
    candle.dispatchEvent(ptr('pointerdown'));
    expect(candle.classList.contains('fly-lit')).toBe(true);
    // Its neighbours are its own business: one touch lights one candle.
    expect(all(ctx, '.fly-candle.fly-lit').length).toBe(1);
    expect(candle.querySelector('.fly-flame')).not.toBeNull();

    candle.dispatchEvent(ptr('pointerdown'));
    expect(candle.classList.contains('fly-lit')).toBe(false);
    expect(candle.classList.contains('fly-out')).toBe(true);
    expect(puff).toHaveBeenCalledTimes(1);
    expect(candle.querySelector('.fly-puff')).not.toBeNull();
    // Flame and puff both tidy themselves away, and it can be lit again.
    vi.advanceTimersByTime(800);
    expect(candle.querySelector('.fly-flame')).toBeNull();
    expect(candle.querySelector('.fly-puff')).toBeNull();
    candle.dispatchEvent(ptr('pointerdown'));
    expect(candle.classList.contains('fly-lit')).toBe(true);
    ctx.cleanup();
  });

  it('each candle lit warms the meadow, and blowing them out takes it away again', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    const field = q(ctx, '.fly');
    const candles = all(ctx, '.fly-candle');
    const warm = (): number => parseFloat(field.style.getPropertyValue('--fly-warm') || '0');
    expect(warm()).toBe(0);

    candles[0]?.dispatchEvent(ptr('pointerdown'));
    // The first flame is worth half the light on its own.
    expect(warm()).toBe(0.5);
    const oneLit = warm();
    candles[1]?.dispatchEvent(ptr('pointerdown'));
    candles[2]?.dispatchEvent(ptr('pointerdown'));
    expect(warm()).toBeGreaterThan(oneLit);

    for (const c of candles) if (c.classList.contains('fly-lit')) c.dispatchEvent(ptr('pointerdown'));
    expect(warm()).toBe(0);
    ctx.cleanup();
  });

  it('🎤 one breath puts the whole row out, one candle after another', async () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const mic = fakeBlowMic();
    const ctx = fakeContext();
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);
    const candles = all(ctx, '.fly-candle');
    for (const c of candles) c.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.fly-candle.fly-lit').length).toBe(CANDLES);
    await listen(ctx);

    mic.set(255);
    await vi.advanceTimersByTimeAsync(200);
    // The first goes out with the breath; the rest follow, not all at once.
    expect(all(ctx, '.fly-candle.fly-lit').length).toBe(CANDLES - 1);
    await vi.advanceTimersByTimeAsync(BLOW_GAP_MS);
    expect(all(ctx, '.fly-candle.fly-lit').length).toBe(CANDLES - 2);
    await vi.advanceTimersByTimeAsync(BLOW_GAP_MS * CANDLES);
    expect(all(ctx, '.fly-candle.fly-lit').length).toBe(0);
    expect(parseFloat(q(ctx, '.fly').style.getPropertyValue('--fly-warm'))).toBe(0);
    ctx.cleanup();
  });

  it('a press on the moon makes it flare', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    const fx = vi.spyOn(ctx.audio, 'fx');
    game.start(ctx);
    const moon = q(ctx, '.fly-moon');
    moon.dispatchEvent(ptr('pointerdown'));
    expect(moon.classList.contains('fly-moon-hit')).toBe(true);
    expect(fx).toHaveBeenCalledWith('sparkle');
    expect(ctx.spoken).toContain('Ông trăng!');
    ctx.cleanup();
  });

  it('🎆 a press sends a rocket up, and it opens into a shape of sparks', () => {
    vi.useFakeTimers();
    driveFrames();
    const c = fakeCanvas();
    const ctx = fakeContext();
    const fx = vi.spyOn(ctx.audio, 'fx');
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);

    q(ctx, '.fly-fw-btn').dispatchEvent(ptr('pointerdown'));
    expect(fx).toHaveBeenCalledWith('whistle');
    expect(ctx.spoken).toContain('Pháo hoa!');

    // Climbing: drawn as a streak, and not yet opened.
    vi.advanceTimersByTime(200);
    expect(c.stroke).toHaveBeenCalled();
    expect(drum).not.toHaveBeenCalled();

    // It opens near the top of its climb, with a thump and a shower of sparks.
    vi.advanceTimersByTime(1000);
    expect(drum).toHaveBeenCalledWith('kick');
    expect(fx).toHaveBeenCalledWith('sparkle');
    const strokes = c.stroke.mock.calls.length;
    expect(strokes).toBeGreaterThan(30);

    // And it burns out on its own, leaving the canvas clear and untouched after.
    vi.advanceTimersByTime(4000);
    const settled = c.stroke.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(c.stroke.mock.calls.length).toBe(settled);
    ctx.cleanup();
  });

  it('🎆 sends one up by itself on the way in, so the button is worth finding', () => {
    vi.useFakeTimers();
    driveFrames();
    const c = fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);
    // Nothing in the sky yet: the canvas is not even asked for a context.
    vi.advanceTimersByTime(300);
    expect(c.stroke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(c.stroke).toHaveBeenCalled();
    expect(BURSTS).toContain('heart');
    ctx.cleanup();
  });

  it('every twelfth happy touch is a star, and none of them is asked for', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    const bug = q(ctx, '.fly-bug');
    for (let i = 0; i < STAR_EVERY - 1; i++) bug.dispatchEvent(ptr('pointerdown'));
    expect(ctx.stars).toBe(0);
    bug.dispatchEvent(ptr('pointerdown'));
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('🎤 a gentle breath lays the grass over without putting the candle out', async () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const mic = fakeBlowMic();
    const ctx = fakeContext();
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);
    q(ctx, '.fly-candle').dispatchEvent(ptr('pointerdown'));
    const btn = await listen(ctx);
    expect(btn.classList.contains('fly-listening')).toBe(true);
    expect(lean(ctx)).toBe(0);

    // Under the blow threshold: the grass answers, the flame stays.
    mic.set(140);
    await vi.advanceTimersByTimeAsync(400);
    expect(lean(ctx)).toBeGreaterThan(0);
    expect(q(ctx, '.fly-candle').classList.contains('fly-lit')).toBe(true);

    // And it dies away again once the child stops.
    mic.set(128);
    await vi.advanceTimersByTimeAsync(1500);
    expect(lean(ctx)).toBeLessThan(1);
    ctx.cleanup();
  });

  it('🎤 a hard blow puts the candle out, then a quiet spell hands the microphone back', async () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const mic = fakeBlowMic();
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);
    q(ctx, '.fly-candle').dispatchEvent(ptr('pointerdown'));
    const btn = await listen(ctx);

    // One loud poll is not enough — a cough should not blow the candle out.
    mic.set(255);
    await vi.advanceTimersByTimeAsync(100);
    expect(q(ctx, '.fly-candle').classList.contains('fly-lit')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(q(ctx, '.fly-candle').classList.contains('fly-out')).toBe(true);
    expect(puff).toHaveBeenCalledTimes(1);

    // The microphone stays open for more blowing, then lets go on its own.
    expect(btn.classList.contains('fly-listening')).toBe(true);
    mic.set(128);
    await vi.advanceTimersByTimeAsync(12500);
    expect(btn.classList.contains('fly-listening')).toBe(false);
    expect(mic.close).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
    ctx.cleanup();
  });

  it('🎤 a second press gives the microphone back', async () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const mic = fakeBlowMic();
    const ctx = fakeContext();
    game.start(ctx);
    const btn = await listen(ctx);
    expect(btn.classList.contains('fly-listening')).toBe(true);

    // Pressing it again is the only way a child has of turning it off, and it works.
    tap(btn);
    await vi.advanceTimersByTimeAsync(0);
    expect(btn.classList.contains('fly-listening')).toBe(false);
    expect(mic.close).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();

    // And it can be turned on again afterwards.
    tap(btn);
    await vi.advanceTimersByTimeAsync(0);
    expect(btn.classList.contains('fly-listening')).toBe(true);
    ctx.cleanup();
  });

  it('🎆 the whole sky takes the colour of whatever just went off', () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    size(q(ctx, '.fly'), 800, 600);
    const wash = q(ctx, '.fly-sky-flash');
    expect(wash.classList.contains('fly-sky-lit')).toBe(false);

    q(ctx, '.fly-fw-btn').dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(1200);
    expect(wash.classList.contains('fly-sky-lit')).toBe(true);
    // Its colour is the firework's own, and it is lit from where the shell opened.
    expect(wash.style.getPropertyValue('--fly-fx-h')).not.toBe('');
    expect(wash.style.getPropertyValue('--fly-fx-y')).toMatch(/%$/);
    ctx.cleanup();
  });

  it('🎤 without a microphone the button steps aside and points at the candle', async () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const ctx = fakeContext();
    game.start(ctx);
    const btn = await listen(ctx);
    expect(btn.hidden).toBe(true);
    expect(ctx.spoken.at(-1)).toBe('Chạm vào nến để thổi nhé');
    // The candle is still blowable by hand.
    const candle = q(ctx, '.fly-candle');
    candle.dispatchEvent(ptr('pointerdown'));
    candle.dispatchEvent(ptr('pointerdown'));
    expect(candle.classList.contains('fly-out')).toBe(true);
    ctx.cleanup();
  });

  it('cleanup stops the frames, the crickets and an open microphone', async () => {
    vi.useFakeTimers();
    driveFrames();
    fakeCanvas();
    const mic = fakeBlowMic();
    const ctx = fakeContext();
    game.start(ctx);
    await listen(ctx);
    ctx.cleanup();
    expect(mic.close).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
