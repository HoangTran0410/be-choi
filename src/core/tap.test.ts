import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeTappable } from './tap';

function press(el: Element, init: { isPrimary?: boolean } = {}): Event {
  const e = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'isPrimary', { value: init.isPrimary ?? true });
  el.dispatchEvent(e);
  return e;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('makeTappable', () => {
  it('fires on pointerdown and prevents the default', () => {
    const el = document.createElement('button');
    const fn = vi.fn();
    makeTappable(el, fn);
    const e = press(el);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('ignores a second press inside the cooldown, accepts one after', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const el = document.createElement('div');
    const fn = vi.fn();
    makeTappable(el, fn, { cooldownMs: 200 });
    press(el);
    vi.advanceTimersByTime(100);
    press(el);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    press(el);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cooldownMs 0 lets every press through', () => {
    const el = document.createElement('div');
    const fn = vi.fn();
    makeTappable(el, fn, { cooldownMs: 0 });
    press(el);
    press(el);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cooldown is per element', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const fn = vi.fn();
    makeTappable(a, fn);
    makeTappable(b, fn);
    press(a);
    press(b);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('adds is-tapped briefly', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const el = document.createElement('div');
    makeTappable(el, () => undefined);
    press(el);
    expect(el.classList.contains('is-tapped')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(el.classList.contains('is-tapped')).toBe(false);
  });

  it('feedback: false leaves the class alone', () => {
    const el = document.createElement('div');
    makeTappable(el, () => undefined, { feedback: false });
    press(el);
    expect(el.classList.contains('is-tapped')).toBe(false);
  });

  it('vibrates when asked', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const el = document.createElement('div');
    makeTappable(el, () => undefined, { haptic: 10 });
    press(el);
    expect(vibrate).toHaveBeenCalledWith(10);
    vi.unstubAllGlobals();
  });

  it('skips non-primary pointers by default', () => {
    const el = document.createElement('div');
    const fn = vi.fn();
    makeTappable(el, fn, { cooldownMs: 0 });
    press(el, { isPrimary: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('can leave the default alone', () => {
    const el = document.createElement('div');
    makeTappable(el, () => undefined, { preventDefault: false });
    expect(press(el).defaultPrevented).toBe(false);
  });

  it('dispose, and ctx.onCleanup, remove the listener', () => {
    const el = document.createElement('div');
    const fn = vi.fn();
    const dispose = makeTappable(el, fn, { cooldownMs: 0 });
    dispose();
    press(el);
    expect(fn).not.toHaveBeenCalled();

    const cleanups: Array<() => void> = [];
    const fn2 = vi.fn();
    makeTappable(el, fn2, { cooldownMs: 0, ctx: { onCleanup: (f) => void cleanups.push(f) } });
    press(el);
    expect(fn2).toHaveBeenCalledTimes(1);
    for (const c of cleanups) c();
    press(el);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
