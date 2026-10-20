import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAP_MS, createSayer, estimateMs } from './say';
import { createScope } from './scope';
import { exploreTabs } from './explore';
import { peopleFrom } from './curriculum';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the teacher speaks one short phrase at a time', () => {
  it('says phrases in order with a pause between, not all at once', async () => {
    const said: Array<[number, string]> = [];
    const scope = createScope();
    const sayer = createSayer((t) => said.push([Date.now(), t]), scope);
    const t0 = Date.now();
    sayer.say(['Chữ bê', 'đâu nào?']);
    expect(said.map((s) => s[1])).toEqual(['Chữ bê']);
    await vi.advanceTimersByTimeAsync(estimateMs('Chữ bê') + GAP_MS + 5);
    expect(said.map((s) => s[1])).toEqual(['Chữ bê', 'đâu nào?']);
    expect(said[1]![0] - t0).toBeGreaterThanOrEqual(estimateMs('Chữ bê') + GAP_MS);
    scope.dispose();
  });

  it('a new sentence drops the old one that was still waiting', async () => {
    const said: string[] = [];
    const scope = createScope();
    const sayer = createSayer((t) => said.push(t), scope);
    sayer.say(['một', 'hai', 'ba']);
    await vi.advanceTimersByTimeAsync(100);
    sayer.say(['Chữ a']);
    await vi.advanceTimersByTimeAsync(20000);
    expect(said).toEqual(['một', 'Chữ a']);
    scope.dispose();
  });

  it('stop() silences what is queued, and leaving clears the timers', async () => {
    const said: string[] = [];
    const scope = createScope();
    const sayer = createSayer((t) => said.push(t), scope);
    sayer.say(['a', 'b', 'c']);
    sayer.stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(said).toEqual(['a']);
    sayer.say(['x', 'y']);
    scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20000);
    expect(said).toEqual(['a', 'x']);
  });

  it('reports each phrase and when it is all done; a custom gap speeds up counting', async () => {
    const scope = createScope();
    const parts: number[] = [];
    let done = false;
    const sayer = createSayer(() => undefined, scope);
    sayer.say([{ text: 'một', gap: 100 }, 'hai'], { onPart: (i) => parts.push(i), onDone: () => (done = true) });
    expect(sayer.busy()).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(parts).toEqual([0, 1]);
    expect(done).toBe(true);
    expect(sayer.busy()).toBe(false);
    scope.dispose();
  });

  it('gives longer phrases more time, and commas a breath', () => {
    expect(estimateMs('Cái nào bắt đầu bằng chữ này?')).toBeGreaterThan(estimateMs('Chữ bê'));
    expect(estimateMs('một, hai, ba')).toBeGreaterThan(estimateMs('một hai ba'));
  });
});

describe('Khám phá content', () => {
  it('has a card for every letter with three pictures revealed in step with the words', () => {
    const tabs = exploreTabs({ people: [] });
    expect(tabs.map((t) => t.id)).toEqual(['letters', 'numbers', 'animals', 'colors', 'shapes']);
    const letters = tabs[0]!.tiles;
    expect(letters.length).toBe(29);
    for (const t of letters) {
      expect(t.gallery.length).toBe(3);
      expect(t.parts.filter((p) => p.reveal !== undefined).map((p) => p.reveal)).toEqual([0, 1, 2]);
    }
    const four = tabs[1]!.tiles[3]!;
    expect(four.gallery.length).toBe(4);
  });

  it('adds the family tab only when there are photos, one card per person', () => {
    const people = peopleFrom([
      { id: '1', url: 'a', name: 'Mẹ' },
      { id: '2', url: 'b', name: 'Mẹ' },
      { id: '3', url: 'c' },
    ]);
    const tabs = exploreTabs({ people });
    const family = tabs.find((t) => t.id === 'family')!;
    expect(family.tiles.length).toBe(2);
    expect(family.tiles[0]!.gallery.length).toBe(1);
  });
});
