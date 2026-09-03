import { describe, it, expect } from 'vitest';
import { createChecklist } from './chores';

type Job = 'a' | 'b' | 'c';
const JOBS: readonly Job[] = ['a', 'b', 'c'];

describe('a checklist', () => {
  it('starts with everything still to do', () => {
    const list = createChecklist(JOBS);
    expect(list.jobs).toEqual(JOBS);
    expect(list.left()).toEqual(['a', 'b', 'c']);
    expect(list.allDone()).toBe(false);
    for (const job of JOBS) expect(list.done(job)).toBe(false);
  });

  it('takes the jobs in whatever order they come', () => {
    const back = createChecklist(JOBS);
    for (const job of ['c', 'b', 'a'] as Job[]) back.set(job, true);
    const forward = createChecklist(JOBS);
    for (const job of ['a', 'b', 'c'] as Job[]) forward.set(job, true);
    expect(back.allDone()).toBe(true);
    expect(forward.allDone()).toBe(true);
    expect(back.left()).toEqual(forward.left());
  });

  it('keeps the jobs left in declared order, whatever order they were done in', () => {
    const list = createChecklist(JOBS);
    list.set('c', true);
    expect(list.left()).toEqual(['a', 'b']);
    list.set('a', true);
    expect(list.left()).toEqual(['b']);
    expect(list.allDone()).toBe(false);
  });

  it('lets a job be undone again, and says when nothing changed', () => {
    const list = createChecklist(JOBS);
    expect(list.set('a', true)).toBe(true);
    expect(list.set('a', true)).toBe(false);
    expect(list.set('a', false)).toBe(true);
    expect(list.done('a')).toBe(false);
    for (const job of JOBS) list.set(job, true);
    expect(list.allDone()).toBe(true);
    list.set('b', false);
    expect(list.allDone()).toBe(false);
    expect(list.left()).toEqual(['b']);
  });

  it('ignores a job it has never heard of', () => {
    const list = createChecklist(JOBS);
    expect(list.set('d' as Job, true)).toBe(false);
    expect(list.done('d' as Job)).toBe(false);
    expect(list.left()).toEqual(['a', 'b', 'c']);
  });

  it('clears down for the next round', () => {
    const list = createChecklist(JOBS);
    for (const job of JOBS) list.set(job, true);
    list.reset();
    expect(list.left()).toEqual(['a', 'b', 'c']);
    expect(list.allDone()).toBe(false);
  });
});
