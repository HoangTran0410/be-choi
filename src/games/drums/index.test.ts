import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { BEAT_STEPS, PADS, STAR_EVERY, stepMs } from './logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

function ptr(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId, button: 0, isPrimary: true, bubbles: true });
}

function pad(ctx: ReturnType<typeof fakeContext>, kind: string): HTMLElement {
  const el = ctx.stage.querySelector<HTMLElement>(`.drums-pad[data-kind="${kind}"]`);
  if (!el) throw new Error(`no pad ${kind}`);
  return el;
}

function beatButton(ctx: ReturnType<typeof fakeContext>): HTMLElement {
  const el = ctx.stage.querySelector<HTMLElement>('.drums-beat');
  if (!el) throw new Error('no beat button');
  return el;
}

describe('drums game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts 6 pads and a beat button; a tap plays the pad, squashes it and floats its emoji', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    const pads = ctx.stage.querySelectorAll<HTMLElement>('.drums-pad');
    expect(pads.length).toBe(6);
    expect(ctx.stage.querySelectorAll('.drums-emoji').length).toBe(6);
    expect(ctx.stage.querySelectorAll('.drums-beat').length).toBe(1);
    expect(beatButton(ctx).textContent).toBe('▶');
    for (const p of PADS) expect(pad(ctx, p.kind).getAttribute('aria-label')).toBe(p.name);

    const kick = pad(ctx, 'kick');
    kick.dispatchEvent(ptr('pointerdown', 40, 50));
    expect(drum).toHaveBeenCalledWith('kick');
    expect(drum).toHaveBeenCalledTimes(1);
    expect(kick.classList.contains('drums-hit')).toBe(true);
    expect(ctx.stage.querySelectorAll('.drums-burst').length).toBe(1);
    expect(ctx.stage.querySelector('.drums-burst')!.textContent).toBe('🥁');
    expect(ctx.spoken).toEqual(['trống cái']);
    vi.advanceTimersByTime(200);
    expect(kick.classList.contains('drums-hit')).toBe(false);
    expect(ctx.stage.querySelectorAll('.drums-burst').length).toBe(1);
    vi.advanceTimersByTime(400);
    expect(ctx.stage.querySelectorAll('.drums-burst').length).toBe(0);

    // Tapping the emoji inside the pad, or with a bare Event (no coordinates), still hits the pad.
    kick.querySelector('.drums-emoji')!.dispatchEvent(ptr('pointerdown', 41, 51, 2));
    pad(ctx, 'snare').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(drum).toHaveBeenNthCalledWith(2, 'kick');
    expect(drum).toHaveBeenNthCalledWith(3, 'snare');
    expect(ctx.stage.querySelectorAll('.drums-burst').length).toBe(2);
    expect(ctx.stars).toBe(0);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('throttles the spoken pad name to once per 2 s per pad', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const kick = pad(ctx, 'kick');
    const tom = pad(ctx, 'tom');
    kick.dispatchEvent(ptr('pointerdown', 10, 10));
    kick.dispatchEvent(ptr('pointerdown', 10, 10));
    vi.advanceTimersByTime(1000);
    kick.dispatchEvent(ptr('pointerdown', 10, 10));
    tom.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(ctx.spoken).toEqual(['trống cái', 'trống tom']);
    vi.advanceTimersByTime(1000);
    kick.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(ctx.spoken).toEqual(['trống cái', 'trống tom', 'trống cái']);
    ctx.cleanup();
  });

  it('beat button loops kick / snare / hat, lights the pads, and stops on a second press', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    const btn = beatButton(ctx);
    const kick = pad(ctx, 'kick');

    btn.dispatchEvent(ptr('pointerdown', 5, 5));
    expect(btn.textContent).toBe('⏸');
    expect(btn.classList.contains('drums-on')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(ctx.spoken).toContain('Gõ theo nhé!');
    expect(drum).not.toHaveBeenCalled();

    // First step: kick + hat, and the kick pad lights up briefly.
    vi.advanceTimersByTime(stepMs());
    expect(drum).toHaveBeenCalledWith('kick');
    expect(drum).toHaveBeenCalledWith('hat');
    expect(drum).not.toHaveBeenCalledWith('snare');
    expect(kick.classList.contains('drums-lit')).toBe(true);
    expect(pad(ctx, 'hat').classList.contains('drums-lit')).toBe(true);
    vi.advanceTimersByTime(150);
    expect(kick.classList.contains('drums-lit')).toBe(false);

    vi.advanceTimersByTime(stepMs() * (BEAT_STEPS - 1));
    const count = (kind: string) => drum.mock.calls.filter((c) => c[0] === kind).length;
    expect(count('kick')).toBeGreaterThanOrEqual(2);
    expect(count('snare')).toBeGreaterThanOrEqual(2);
    expect(count('hat')).toBeGreaterThanOrEqual(8);
    expect(count('tom')).toBe(0);
    // Beat hits do not count towards a star.
    expect(ctx.stars).toBe(0);

    btn.dispatchEvent(ptr('pointerdown', 5, 5));
    expect(btn.textContent).toBe('▶');
    expect(btn.classList.contains('drums-on')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    const before = drum.mock.calls.length;
    vi.advanceTimersByTime(stepMs() * BEAT_STEPS);
    expect(drum.mock.calls.length).toBe(before);
    expect(ctx.stage.querySelectorAll('.drums-lit').length).toBe(0);

    // The child can still drum while the beat is off.
    kick.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(drum.mock.calls.length).toBe(before + 1);

    ctx.cleanup();
  });

  it('awards a star every 40 taps and floats a star over the pad', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const jingle = vi.spyOn(ctx.audio, 'jingle');
    game.start(ctx);
    const kinds = PADS.map((p) => p.kind);
    for (let i = 0; i < STAR_EVERY - 1; i++) {
      pad(ctx, kinds[i % kinds.length]!).dispatchEvent(ptr('pointerdown', 10, 10));
    }
    expect(ctx.stars).toBe(0);
    expect(ctx.stage.querySelectorAll('.drums-star').length).toBe(0);
    pad(ctx, 'clap').dispatchEvent(ptr('pointerdown', 10, 10));
    expect(ctx.stars).toBe(1);
    expect(jingle).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.drums-star').length).toBe(1);
    vi.advanceTimersByTime(800);
    expect(ctx.stage.querySelectorAll('.drums-star').length).toBe(0);
    for (let i = 0; i < STAR_EVERY; i++) pad(ctx, 'kick').dispatchEvent(ptr('pointerdown', 10, 10));
    expect(ctx.stars).toBe(2);
    ctx.cleanup();
  });

  it('cleanup stops the beat and every pending timer', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    beatButton(ctx).dispatchEvent(ptr('pointerdown', 5, 5));
    pad(ctx, 'tom').dispatchEvent(ptr('pointerdown', 10, 10));
    vi.advanceTimersByTime(stepMs() * 2);
    const before = drum.mock.calls.length;
    expect(before).toBeGreaterThan(1);
    expect(() => ctx.cleanup()).not.toThrow();
    vi.advanceTimersByTime(stepMs() * BEAT_STEPS * 2);
    expect(drum.mock.calls.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
