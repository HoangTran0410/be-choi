import { describe, it, expect, vi } from 'vitest';
import { createHint } from './hint';

describe('hint', () => {
  it('fires repeatedly, restarts on touch, stops on clear', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const hint = createHint();
    hint.touch(); // no-op when not armed
    hint.arm(fn, 1000);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    hint.touch();
    vi.advanceTimersByTime(900);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(3);
    hint.clear();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
  it('uses 6000 ms by default', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const hint = createHint();
    hint.arm(fn);
    vi.advanceTimersByTime(5999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    hint.clear();
    vi.useRealTimers();
  });
});
