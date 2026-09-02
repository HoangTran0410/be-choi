import { describe, it, expect, vi } from 'vitest';
import { onHold } from './hold';

describe('onHold', () => {
  it('fires after ms, not before, and cancels on pointerup', () => {
    vi.useFakeTimers();
    const el = document.createElement('button');
    document.body.append(el);
    const cb = vi.fn();
    const dispose = onHold(el, 1000, cb);
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(el.querySelector('.hold-ring')).not.toBeNull();
    vi.advanceTimersByTime(500);
    el.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
    expect(el.querySelector('.hold-ring')).toBeNull();
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.hold-ring')).toBeNull();
    dispose();
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
