import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSequencer } from './sequencer';

describe('sequencer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs events in time order, each at its moment', () => {
    const seq = createSequencer();
    const log: string[] = [];
    seq.at(300, () => log.push('c'));
    seq.at(100, () => log.push('a'));
    seq.at(200, () => log.push('b'));
    vi.advanceTimersByTime(99);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(['a']);
    vi.advanceTimersByTime(250);
    expect(log).toEqual(['a', 'b', 'c']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps every event on its own moment', () => {
    const seq = createSequencer();
    const at: number[] = [];
    for (let i = 1; i <= 5; i++) seq.at(i * 100, () => at.push(Math.round(seq.now())));
    vi.advanceTimersByTime(520);
    expect(at).toEqual([100, 200, 300, 400, 500]);
  });

  it('clears by tag and keeps the rest', () => {
    const seq = createSequencer();
    const log: string[] = [];
    seq.at(100, () => log.push('band'), 'band');
    seq.at(120, () => log.push('tune'), 'tune');
    seq.clear('band');
    vi.advanceTimersByTime(200);
    expect(log).toEqual(['tune']);
  });

  it('runs events scheduled by events, and stop() leaves no timer behind', () => {
    const seq = createSequencer();
    const log: number[] = [];
    seq.at(50, () => {
      log.push(1);
      seq.at(100, () => log.push(2));
    });
    vi.advanceTimersByTime(120);
    expect(log).toEqual([1, 2]);
    seq.at(10_000, () => log.push(3));
    seq.stop();
    expect(vi.getTimerCount()).toBe(0);
    seq.at(5, () => log.push(4));
    vi.advanceTimersByTime(20_000);
    expect(log).toEqual([1, 2]);
  });

  it('survives a throwing event', () => {
    const seq = createSequencer();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log: number[] = [];
    seq.at(10, () => {
      throw new Error('boom');
    });
    seq.at(20, () => log.push(1));
    vi.advanceTimersByTime(30);
    expect(log).toEqual([1]);
    spy.mockRestore();
  });
});
