import { describe, it, expect, vi, afterEach } from 'vitest';
import { APP_H, watchViewport } from './viewport';

const height = () => document.documentElement.style.getPropertyValue(APP_H);

function setInnerHeight(px: number): void {
  Object.defineProperty(window, 'innerHeight', { value: px, configurable: true, writable: true });
}

function setVisualViewport(px: number | null): void {
  const vv = px === null ? undefined : { height: px, addEventListener: () => undefined, removeEventListener: () => undefined };
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
}

afterEach(() => {
  setVisualViewport(null);
  document.documentElement.removeAttribute('style');
});

describe('viewport', () => {
  it('publishes the window height and follows a resize', () => {
    setInnerHeight(800);
    const stop = watchViewport();
    expect(height()).toBe('800px');
    setInnerHeight(640);
    window.dispatchEvent(new Event('resize'));
    expect(height()).toBe('640px');
    stop();
    expect(height()).toBe('');
  });

  it('takes the smaller of the layout and visual viewports', () => {
    // The stale-after-resume case: the layout viewport still claims the whole
    // screen while the visual one has already lost the navigation bar.
    setInnerHeight(800);
    setVisualViewport(752);
    const stop = watchViewport();
    expect(height()).toBe('752px');
    stop();
  });

  it('re-reads after the app comes back to the front', () => {
    vi.useFakeTimers();
    setInnerHeight(800);
    const stop = watchViewport();
    expect(height()).toBe('800px');
    // Android hands the app back, then resizes the window a moment later.
    setInnerHeight(752);
    document.dispatchEvent(new Event('visibilitychange'));
    setInnerHeight(700);
    vi.advanceTimersByTime(1200);
    expect(height()).toBe('700px');
    stop();
    vi.useRealTimers();
  });

  it('leaves the CSS fallback alone when there is nothing to measure', () => {
    setInnerHeight(0);
    const stop = watchViewport();
    expect(height()).toBe('');
    stop();
  });
});
