import { describe, it, expect } from 'vitest';
import { createBreakTracker } from './breakTimer';
import { EDGE_PX, buzz, isEdgeTouch } from './haptics';

const MIN = 60_000;

describe('break tracker', () => {
  it('never fires when off', () => {
    let t = 0;
    const b = createBreakTracker(() => t);
    b.enter();
    t = 90 * MIN;
    expect(b.due(0)).toBe(false);
  });
  it('fires once the limit of play has passed, then starts over', () => {
    let t = 0;
    const b = createBreakTracker(() => t);
    b.enter();
    t = 9 * MIN;
    expect(b.due(10)).toBe(false);
    t = 10 * MIN;
    expect(b.due(10)).toBe(true);
    t = 15 * MIN;
    expect(b.due(10)).toBe(false);
    t = 20 * MIN;
    expect(b.due(10)).toBe(true);
  });
  it('does not count time spent on the home screen, but remembers short trips', () => {
    let t = 0;
    const b = createBreakTracker(() => t);
    b.enter();
    t = 6 * MIN;
    b.leave();
    t = 8 * MIN; // two minutes at home
    b.enter();
    t = 12 * MIN; // 6 + 4 minutes played
    expect(b.due(10)).toBe(true);
  });
  it('starts fresh after a long break away', () => {
    let t = 0;
    const b = createBreakTracker(() => t);
    b.enter();
    t = 8 * MIN;
    b.leave();
    t = 30 * MIN;
    b.enter();
    t = 33 * MIN;
    expect(b.due(10)).toBe(false);
  });
});

describe('touch helpers', () => {
  it('spots touches along the screen edge', () => {
    expect(isEdgeTouch(2, 800)).toBe(true);
    expect(isEdgeTouch(800 - 2, 800)).toBe(true);
    expect(isEdgeTouch(EDGE_PX + 10, 800)).toBe(false);
  });
  it('vibrates when it can and is silent when it cannot', () => {
    expect(() => buzz()).not.toThrow();
    const calls: number[] = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (ms: number) => calls.push(ms) });
    buzz(7);
    expect(calls).toEqual([7]);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
  });
});
