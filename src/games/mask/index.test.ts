import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cams: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
let grant = true;
vi.mock('../../core/camera', () => ({
  createCamera: () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 480 });
    const cam = {
      on: false,
      start: vi.fn(async () => (grant ? video : null)),
      stop: vi.fn(),
      snapshot: vi.fn(async () => null),
    };
    cams.push(cam);
    return cam;
  },
}));

import { fakeContext, type FakeContext } from '../../core/testing';
import { MASKS, STAR_AFTER, DETECT_MS } from './logic';
import game from './index';

const q = <T extends HTMLElement = HTMLElement>(ctx: FakeContext, sel: string): T => {
  const el = ctx.stage.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const press = (el: HTMLElement): void => {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
};

describe('mask game', () => {
  beforeEach(() => {
    cams.length = 0;
    grant = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { FaceDetector?: unknown }).FaceDetector;
  });

  it('opens the camera first and shows the first mask', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(cams[0]!.start).toHaveBeenCalledTimes(1);
    expect(q(ctx, '.mask').classList.contains('cam-on')).toBe(true);
    expect(q(ctx, '.mask-video')).toBeTruthy();
    expect(q(ctx, '.mask-emoji').textContent).toBe(MASKS[0]!.emoji);
    ctx.cleanup();
  });

  it('works without FaceDetector: the mask stays put in the middle', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(DETECT_MS * 5);
    expect(q(ctx, '.mask-emoji').textContent).toBe(MASKS[0]!.emoji);
    ctx.cleanup();
  });

  it('follows a face when FaceDetector exists', async () => {
    const detect = vi.fn(async () => [{ boundingBox: { x: 40, y: 200, width: 100, height: 100 } }]);
    (globalThis as { FaceDetector?: unknown }).FaceDetector = function () {
      return { detect };
    };
    const ctx = fakeContext();
    Object.defineProperty(ctx.stage, 'clientWidth', { value: 640 });
    Object.defineProperty(ctx.stage, 'clientHeight', { value: 480 });
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(DETECT_MS * 6);
    expect(detect).toHaveBeenCalled();
    const t = q(ctx, '.mask-face').style.transform;
    const x = Number(/translate\((-?\d+)px/.exec(t)?.[1]);
    expect(x).toBeGreaterThan(330);
    ctx.cleanup();
  });

  it('keeps playing when FaceDetector throws', async () => {
    (globalThis as { FaceDetector?: unknown }).FaceDetector = function () {
      return { detect: async () => Promise.reject(new Error('nope')) };
    };
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(DETECT_MS * 10);
    press(q(ctx, '.mask-next'));
    expect(q(ctx, '.mask-emoji').textContent).toBe(MASKS[1]!.emoji);
    ctx.cleanup();
  });

  it('the big button changes the mask and plays its animal voice', async () => {
    const ctx = fakeContext();
    const fx = vi.fn();
    ctx.audio.fx = fx;
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    press(q(ctx, '.mask-next'));
    expect(q(ctx, '.mask-emoji').textContent).toBe(MASKS[1]!.emoji);
    expect(fx).toHaveBeenCalledWith(MASKS[1]!.voice);
    expect(ctx.spoken.at(-1)).toBe(MASKS[1]!.say);
    ctx.cleanup();
  });

  it('celebrates with a star after enough different masks, and not before', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < STAR_AFTER - 1; i++) press(q(ctx, '.mask-next'));
    expect(ctx.stars).toBe(0);
    press(q(ctx, '.mask-next'));
    await vi.advanceTimersByTimeAsync(10);
    expect(ctx.stars).toBe(1);
    expect(ctx.celebrations).toBe(1);
    ctx.cleanup();
  });

  it('without a camera shows the cartoon mirror and still plays', async () => {
    grant = false;
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    const root = q(ctx, '.mask');
    expect(root.classList.contains('cam-on')).toBe(false);
    expect(root.querySelector('.mask-video')).toBeNull();
    expect(q(ctx, '.mask-cartoon')).toBeTruthy();
    expect(ctx.spoken.some((s) => s.includes('gương hoạt hình'))).toBe(true);
    press(q(ctx, '.mask-next'));
    expect(q(ctx, '.mask-emoji').textContent).toBe(MASKS[1]!.emoji);
    // The 📷 button stays so a parent can allow the camera and try again.
    expect(q(ctx, '.mask-cam').hidden).toBe(false);
    ctx.cleanup();
  });

  it('turns the camera off when the child leaves', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    ctx.cleanup();
    expect(cams[0]!.stop).toHaveBeenCalled();
  });

  it('stops a camera that arrives after the child has left', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    ctx.cleanup();
    await vi.advanceTimersByTimeAsync(0);
    expect(cams[0]!.stop.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
