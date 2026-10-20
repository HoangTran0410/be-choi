import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { SLOTS } from '../dressup/logic';
import { bath } from './activities/bath';
import { bed } from './activities/bed';
import { breakfast } from './activities/breakfast';
import { comfort } from './activities/comfort';
import { dress } from './activities/dress';
import { outing } from './activities/outing';
import { party } from './activities/party';
import { pet } from './activities/pet';
import { teeth } from './activities/teeth';
import { createKid } from './art';
import { makePlan, type DayPlan, type TaskId } from './day';
import { AUTO_MS, LEAVE_MS } from './done';
import type { Activity, Env } from './env';
import game from './index';
import { createScope } from './scope';
import { SAVE_KEY } from './store';

function press(el: Element): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
}
const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];

describe('the whole day: dressing, then back to the morning jobs', () => {
  let ctx: FakeContext;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now()); // tap cooldowns follow the fake clock
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    localStorage.clear();
    ctx = fakeContext();
  });
  afterEach(() => {
    ctx.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const stage = (): HTMLElement => ctx.stage;
  const act = (): HTMLElement => q(stage(), '.day-act');
  const wearAll = async (): Promise<void> => {
    for (const row of qa(stage(), '.dress-row')) {
      row.querySelector<HTMLElement>('.dress-piece')!.click();
      await vi.advanceTimersByTimeAsync(80);
    }
  };
  async function openDress(): Promise<void> {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(3000);
    press(q(stage(), '[data-task="dress"]'));
  }
  const dayState = (): { day: string; period: string | undefined; done: string[]; saved: string | null } => ({
    day: q(stage(), '.hud-day').textContent ?? '',
    period: stage().querySelector<HTMLElement>('.day')!.dataset.period,
    done: qa(stage(), '.task.done').map((t) => t.dataset.task ?? ''),
    saved: localStorage.getItem(SAVE_KEY),
  });

  it('three garments on does not end the job: it waits for ✓ and keeps taking input', async () => {
    await openDress();
    await wearAll();
    expect(qa(stage(), '.dress-piece.worn').length).toBe(3);
    expect(q(stage(), '.day-ok').hidden).toBe(false);
    // well within the slow timer: nothing has closed and no input is ignored
    await vi.advanceTimersByTimeAsync(AUTO_MS - 1500);
    expect(act().hidden).toBe(false);
    // change the hat to the other ones, several times
    const hats = qa(qa(stage(), '.dress-row')[0]!, '.dress-piece');
    for (const b of [hats[1]!, hats[2]!, hats[0]!, hats[1]!]) {
      b.click();
      await vi.advanceTimersByTimeAsync(60);
      expect(b.classList.contains('worn'), 'the latest choice is worn').toBe(true);
      expect(qa(stage(), '.dress-piece.worn').length).toBe(3);
    }
    expect(act().hidden).toBe(false);
  });

  it('pressing ✓ goes gently back to the morning jobs; the day is not reset', async () => {
    await openDress();
    const before = dayState();
    await wearAll();
    press(q(stage(), '.day-ok'));
    expect(act().classList.contains('leaving')).toBe(true);
    await vi.advanceTimersByTimeAsync(LEAVE_MS + 100);
    expect(act().hidden).toBe(true);
    expect(act().classList.contains('leaving')).toBe(false);
    expect(q(stage(), '.day-home').hidden).toBe(false);
    const after = dayState();
    expect(after.day).toBe(before.day);
    expect(after.period).toBe('0');
    expect(after.done).toEqual(['dress']);
    expect(after.saved).toBe(before.saved); // no day was finished
    expect(qa(stage(), '.task').map((t) => t.dataset.task)).toEqual(['dress', 'breakfast', 'teeth']);
    expect(q(stage(), '.day-banner').hidden).toBe(true);
    // and the next job opens straight away
    press(q(stage(), '[data-task="breakfast"]'));
    expect(act().hidden).toBe(false);
    expect(stage().querySelector('.cook')).not.toBeNull();
  });

  it('ends by itself only after a long quiet time, and a touch pushes that back', async () => {
    await openDress();
    await wearAll();
    await vi.advanceTimersByTimeAsync(AUTO_MS - 500);
    qa(qa(stage(), '.dress-row')[1]!, '.dress-piece')[1]!.click(); // a touch just before the end
    await vi.advanceTimersByTimeAsync(AUTO_MS - 500);
    expect(act().hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(1000 + LEAVE_MS + 100);
    expect(act().hidden).toBe(true);
    expect(qa(stage(), '.task.done').map((t) => t.dataset.task)).toEqual(['dress']);
    expect(dayState().period).toBe('0');
  });

  it('a garment can be dragged onto the friend: a light copy follows, a drop elsewhere only glides it home', async () => {
    const ptr = (type: string, x: number, y: number): PointerEvent =>
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: 1 }) as unknown as PointerEvent;
    await openDress();
    const kidBox = q(stage(), '.dress-kid').firstElementChild!;
    vi.spyOn(kidBox, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, width: 100, height: 300, right: 100, bottom: 300, toJSON: () => ({}),
    });
    const piece = qa(stage(), '.dress-piece')[0]!;
    piece.dispatchEvent(ptr('pointerdown', 500, 500));
    piece.dispatchEvent(ptr('pointermove', 400, 400));

    expect(q(stage(), '.dd-ghost')).toBeTruthy();
    expect(piece.classList.contains('is-carried')).toBe(true);
    piece.dispatchEvent(ptr('pointerup', 400, 400));
    expect(qa(stage(), '.dress-piece.worn').length).toBe(0);
    expect(piece.classList.contains('is-carried')).toBe(false);
    piece.dispatchEvent(ptr('pointerdown', 500, 500));
    piece.dispatchEvent(ptr('pointermove', 50, 150));
    piece.dispatchEvent(ptr('pointerup', 50, 150));
    expect(qa(stage(), '.dress-piece.worn').length).toBe(1);
  });

  it('taking a garment off hides ✓ and never ends the job', async () => {
    await openDress();
    await wearAll();
    qa(stage(), '.dress-piece.worn')[0]!.click();
    await vi.advanceTimersByTimeAsync(100);
    expect(q(stage(), '.day-ok').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(act().hidden).toBe(false);
    expect(qa(stage(), '.dress-piece.worn').length).toBe(2);
  });

  it('a silly garment makes the friend giggle but is never wrong and never blocks anything', async () => {
    await openDress();
    for (let round = 0; round < 3; round++) {
      for (const row of qa(stage(), '.dress-row')) {
        for (const b of qa(row, '.dress-piece')) {
          b.click();
          await vi.advanceTimersByTimeAsync(60);
        }
      }
    }
    expect(act().hidden).toBe(false);
    expect(SLOTS.length).toBe(3);
  });

  it('a banner never swallows a tap on a job', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(300); // the "new day" banner is still up
    expect(q(stage(), '.day-banner').hidden).toBe(false);
    press(q(stage(), '[data-task="dress"]'));
    expect(act().hidden).toBe(false);
    expect(q(stage(), '.day-banner').hidden).toBe(true);
  });

  it('leaves no timer behind: back from a job, and when the game closes', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(3000);
    ctx.hint.clear();
    const base = vi.getTimerCount();
    press(q(stage(), '[data-task="dress"]'));
    await wearAll();
    press(q(stage(), '.hud-home')); // leave in the middle of the countdown
    await vi.advanceTimersByTimeAsync(300);
    ctx.hint.clear();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(base);
    // nothing fires later and nothing is finished by a stray timer
    await vi.advanceTimersByTimeAsync(30_000);
    expect(qa(stage(), '.task.done').length).toBe(0);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------- every job on its own

function makeEnv(ctx: FakeContext, plan: DayPlan, host: HTMLElement): { env: Env; finished: () => number } {
  const scope = createScope();
  const kid = createKid({});
  let n = 0;
  const env: Env = {
    ctx,
    host,
    plan,
    days: 2,
    kid,
    kidView: (size) => kid.view(size),
    scope,
    photos: () => [],
    visitor: () => ({ url: null, visitor: { emoji: '👩', name: 'Mẹ' } }),
    say: (t) => ctx.speak(t),
    finish: () => {
      n++;
    },
  };
  ctx.onCleanup(() => scope.dispose());
  return { env, finished: () => n };
}

const JOBS: Array<[TaskId, Activity]> = [
  ['dress', dress],
  ['breakfast', breakfast],
  ['teeth', teeth],
  ['outing', outing],
  ['pet', pet],
  ['bath', bath],
  ['party', party],
  ['comfort', comfort],
  ['bed', bed],
];

describe('every job of the day', () => {
  let ctx: FakeContext;
  let host: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now()); // tap cooldowns follow the fake clock
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    ctx = fakeContext();
    host = document.createElement('div');
    ctx.stage.append(host);
  });
  afterEach(() => {
    ctx.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const plan = (event: 'none' | 'birthday' | 'friend'): DayPlan => ({ ...makePlan(3, 99, null), event, weather: 'sunny' });

  it.each(JOBS)('%s: left alone it never closes itself and never shows ✓ early', async (_id, run) => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    run(env);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(finished()).toBe(0);
    expect(host.querySelector<HTMLElement>('.day-ok')!.hidden).toBe(true);
    expect(host.children.length).toBeGreaterThan(1);
  });

  it.each(JOBS)('%s: closing it stops every timer it started', async (_id, run) => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    ctx.hint.clear();
    const base = vi.getTimerCount();
    run(env);
    env.scope.dispose();
    ctx.hint.clear();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(base);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(finished()).toBe(0);
  });

  /** A finished job shows ✓ and goes on being playable; ✓ then hands back to the day exactly once. */
  async function endsWithTick(env: Env, finished: () => number): Promise<void> {
    const ok = q(host, '.day-ok');
    expect(ok.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(AUTO_MS - 1500);
    expect(finished()).toBe(0);
    press(ok);
    press(ok);
    await vi.advanceTimersByTimeAsync(LEAVE_MS + 50);
    expect(finished()).toBe(1);
    await vi.advanceTimersByTimeAsync(AUTO_MS * 2);
    expect(finished()).toBe(1);
    expect(env.scope.alive()).toBe(true);
  }

  it('outing: all things found → ✓; a stray tap still works', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    outing(env);
    for (const t of qa(host, '.out-thing')) {
      press(t);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(qa(host, '.out-thing.got').length).toBe(qa(host, '.out-thing').length);
    press(qa(host, '.out-kid')[0]!);
    await endsWithTick(env, finished);
  });

  it('comfort: two soothings → ✓, and more comforting still gets a giggle', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    comfort(env);
    const btns = qa(host, '.comfort-btn');
    press(btns[0]!);
    await vi.advanceTimersByTimeAsync(2500);
    press(btns[1]!);
    await vi.advanceTimersByTimeAsync(300);
    expect(q(host, '.day-ok').hidden).toBe(false);
    for (const b of btns) {
      press(b);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(finished()).toBe(0);
    await endsWithTick(env, finished);
  });

  it('teeth: paste + rinse alone is not enough; ✓ only after brushing too', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    teeth(env);
    press(q(host, '[data-job="paste"]'));
    press(q(host, '[data-job="rinse"]'));
    await vi.advanceTimersByTimeAsync(AUTO_MS * 2);
    expect(q(host, '.day-ok').hidden).toBe(true);
    expect(finished()).toBe(0);
  });

  it('party: blow the candles → ✓; the candles can be lit again and again', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    party(env);
    const [add, light, blow] = qa(host, '.party-row:last-child .party-btn');
    press(add!);
    press(light!);
    await vi.advanceTimersByTimeAsync(50);
    press(blow!);
    await vi.advanceTimersByTimeAsync(300);
    expect(q(host, '.day-ok').hidden).toBe(false);
    press(light!);
    expect(qa(host, '.party-candle .flame').length).toBe(1);
    press(blow!);
    expect(qa(host, '.party-candle .flame').length).toBe(0);
    await endsWithTick(env, finished);
  });

  it('bed: all four done → asleep and ✓; undoing the lamp wakes the friend without closing', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    bed(env);
    for (const toy of qa(host, '.bed-toy')) toy.click();
    press(q(host, '.bed-lamp'));
    press(q(host, '.bed-bed'));
    press(q(host, '.bed-moon'));
    await vi.advanceTimersByTimeAsync(20_000 - AUTO_MS); // the lullaby plays out
    if (q(host, '.day-ok').hidden) {
      // the lullaby may still be playing: let it finish
      await vi.advanceTimersByTimeAsync(20_000);
    }
    expect(q(host, '.day-ok').hidden).toBe(false);
    expect(finished()).toBe(0);
    press(q(host, '.bed-lamp'));
    await vi.advanceTimersByTimeAsync(300);
    expect(q(host, '.day-ok').hidden).toBe(true);
    press(q(host, '.bed-lamp'));
    await vi.advanceTimersByTimeAsync(300);
    expect(q(host, '.day-ok').hidden).toBe(false);
    await endsWithTick(env, finished);
  });

  it('pet: three fed → ✓, and a fourth animal still arrives', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    pet(env);
    for (let i = 0; i < 3; i++) {
      // try every food: the wrong ones only shake, the right one is eaten
      for (const f of qa(host, '.pet-food')) {
        f.click();
        await vi.advanceTimersByTimeAsync(30);
      }
      await vi.advanceTimersByTimeAsync(1600);
    }
    expect(q(host, '.day-ok').hidden).toBe(false);
    expect(qa(host, '.pet-food:not(.eaten)').length).toBeGreaterThan(0);
    await endsWithTick(env, finished);
  });

  it('breakfast: sequential steps; feeding the friend → ✓ (no auto close before the quiet time)', async () => {
    const { env, finished } = makeEnv(ctx, plan('none'), host);
    breakfast(env);
    for (const b of qa(host, '.cook-item')) {
      press(b);
      await vi.advanceTimersByTimeAsync(30);
    }
    for (let i = 0; i < 12; i++) press(q(host, '.cook-pot'));
    await vi.advanceTimersByTimeAsync(300);
    q(host, '.cook-serve').click(); // a tap feeds
    await vi.advanceTimersByTimeAsync(300);
    expect(q(host, '.day-ok').hidden).toBe(false);
    await endsWithTick(env, finished);
  });
});
