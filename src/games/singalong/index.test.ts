import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, fakeMic, type FakeContext, type FakeMic } from '../../core/testing';
import { CHOIR, REPERTOIRE, songUnlockAt } from './catalog';
import { SAVE_KEY } from './progress';
import { SINGABLE } from './modes/song';
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

function fire(el: Element, type: string): void {
  el.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, bubbles: true, cancelable: true }));
}

/** A tap that also lets the tap helper's cooldown pass. */
async function tap(el: Element): Promise<void> {
  fire(el, 'pointerdown');
  fire(el, 'pointerup');
  await vi.advanceTimersByTimeAsync(150);
}

function q<T extends Element = HTMLElement>(ctx: FakeContext, sel: string): T {
  const el = ctx.stage.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}
const all = (ctx: FakeContext, sel: string): HTMLElement[] => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];

/** Frames off the fake clock, with a stamp this file owns. */
function stubFrames(): void {
  let stamp = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) =>
      setTimeout(() => {
        stamp += 16;
        cb(stamp);
      }, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
}

let ctx: FakeContext;
let mic: FakeMic;

beforeEach(() => {
  vi.useFakeTimers();
  stubFrames();
  // The tap helper's cooldown reads performance.now(), which fake timers leave alone.
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  localStorage.clear();
  mic = fakeMic();
  ctx = fakeContext();
});
afterEach(() => {
  ctx.cleanup();
  mic.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const settle = (ms = 700) => vi.advanceTimersByTimeAsync(ms);
const mode = (id: string) => q(ctx, `.sa-mode[data-mode="${id}"]`);
const panel = (id: string) => q(ctx, `.sa-mode-panel[data-mode="${id}"]`);

describe('the hall', () => {
  it('opens on the karaoke with four big mode buttons, the singer and the crowd', async () => {
    game.start(ctx);
    await settle(50);
    expect(all(ctx, '.sa-mode').length).toBe(4);
    expect(q(ctx, '.sa').dataset.mode).toBe('song');
    expect(panel('song').hidden).toBe(false);
    expect(panel('echo').hidden).toBe(true);
    expect(all(ctx, '.sa-song').length).toBe(SINGABLE.length);
    expect(q(ctx, '.sa-singer')).toBeTruthy();
    expect(all(ctx, '.sa-animal').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the shell’s introduction free of our own voice', async () => {
    game.start(ctx);
    await settle(50);
    expect(ctx.sequenced).toEqual([]);
    expect(ctx.spoken).toEqual([]);
  });

  it('does not talk over the music: taps, songs and mode changes are silent (text only)', async () => {
    game.start(ctx);
    await settle(4000); // past the shell’s introduction window
    ctx.sequenced.length = 0;
    ctx.spoken.length = 0;
    for (const id of ['bird', 'perform', 'echo', 'song']) {
      await tap(mode(id));
      await settle(300);
      await tap(q(ctx, '.sa-singer'));
    }
    await tap(q(ctx, `.sa-song[data-song="${SINGABLE[0]!.id}"]`));
    await vi.advanceTimersByTimeAsync(8000); // the song is under way: the title, the count-in and the first words
    expect(ctx.sequenced).toEqual([]);
    expect(ctx.spoken).toEqual([]);
    expect(q(ctx, '.sa-bubble').textContent).toContain(SINGABLE[0]!.title);
  });

  it('moves between the four modes in any order', async () => {
    game.start(ctx);
    for (const id of ['bird', 'perform', 'echo', 'song', 'perform']) {
      await tap(mode(id));
      expect(q(ctx, '.sa').dataset.mode).toBe(id);
      expect(panel(id).hidden).toBe(false);
      expect(all(ctx, '.sa-mode-panel').filter((p) => !p.hidden).length).toBe(1);
      expect(mode(id).classList.contains('sa-mode-on')).toBe(true);
    }
  });

  it('shows the songs not yet won dimmed, and only says how many tickets are missing', async () => {
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await settle();
    const lockedIdx = SINGABLE.findIndex((s) => songUnlockAt(REPERTOIRE.indexOf(s)) > 0);
    expect(lockedIdx).toBeGreaterThan(0);
    const card = q(ctx, `.sa-song[data-song="${SINGABLE[lockedIdx]!.id}"]`);
    expect(card.classList.contains('sa-locked')).toBe(true);
    await tap(card);
    expect(q(ctx, '.sa-bubble').textContent).toMatch(/vé/);
    expect(q(ctx, '.sa-sing').hidden).toBe(true);
  });
});

describe('sing along', () => {
  it('counts in, runs the words, and ends with a star, tickets and a results card', async () => {
    game.start(ctx);
    const song = SINGABLE[0]!;
    await tap(q(ctx, `.sa-song[data-song="${song.id}"]`));
    expect(q(ctx, '.sa-sing').hidden).toBe(false);
    expect(all(ctx, '.sa-word').length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(2800);
    expect(q(ctx, '.sa-count').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(q(ctx, '.sa-res')).toBeTruthy();
    expect(all(ctx, '.sa-res-lit').length).toBeGreaterThanOrEqual(1);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
    expect(saved.tickets).toBeGreaterThanOrEqual(1);
    expect(saved.shows).toBe(1);
    // Carry on: the shelf of songs is back.
    await tap(q(ctx, '.sa-res-go'));
    expect(ctx.stage.querySelector('.sa-res')).toBeNull();
    expect(q(ctx, '.sa-sing').hidden).toBe(true);
    expect(q(ctx, '.sa-chip-n').textContent).toContain(String(saved.tickets));
  });

  it('lets the child stop and choose another song, with no star', async () => {
    game.start(ctx);
    await tap(q(ctx, `.sa-song[data-song="${SINGABLE[0]!.id}"]`));
    await tap(q(ctx, '.sa-sing .sa-stop'));
    expect(q(ctx, '.sa-sing').hidden).toBe(true);
    expect(q(ctx, '.sa-songs').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.stars).toBe(0);
  });

  it('earns more when the child sings, and the stage lights up for it', async () => {
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await settle();
    expect(q(ctx, '.sa-mic').classList.contains('sa-on')).toBe(true);
    await tap(q(ctx, `.sa-song[data-song="${SINGABLE[0]!.id}"]`));
    mic.level = 0.6;
    mic.pitchHz = 200;
    await vi.advanceTimersByTimeAsync(5000);
    expect(q(ctx, '.sa-back').classList.contains('sa-loud')).toBe(true);
    expect(q(ctx, '.sa-crowd').dataset.hot).toBe('0');
    expect(q(ctx, '.sa').classList.contains('sa-mic-on')).toBe(true);
    expect(ctx.stage.querySelectorAll('.sa-note').length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(120_000);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
    expect(saved.tickets).toBeGreaterThanOrEqual(3);
  }, 30_000);
});

describe('with no microphone', () => {
  it('keeps the button, asks again, and lets a tap on the singer do the singing', async () => {
    mic.granted = false;
    game.start(ctx);
    const btn = q(ctx, '.sa-mic');
    await tap(btn);
    await settle();
    expect(btn.hidden).toBe(false);
    expect(btn.classList.contains('sa-off')).toBe(true);

    const singer = q(ctx, '.sa-singer');
    fire(singer, 'pointerdown');
    await vi.advanceTimersByTimeAsync(200);
    expect(q(ctx, '.sa-back').classList.contains('sa-loud')).toBe(true);
    expect(q(ctx, '.sa-crowd').dataset.hot).toBe('all');
    fire(singer, 'pointerup');
    await vi.advanceTimersByTimeAsync(1200);
    expect(q(ctx, '.sa-back').classList.contains('sa-loud')).toBe(false);

    mic.granted = true;
    await tap(btn);
    await settle();
    expect(btn.classList.contains('sa-on')).toBe(true);
  });
});

describe('echo choir', () => {
  it('answers a tapped rhythm with every animal that has joined', async () => {
    mic.granted = false;
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await tap(mode('echo'));
    const note = vi.spyOn(ctx.audio, 'note');
    expect(q(ctx, '.sa-echo-go').textContent).toBe('🥁');
    await tap(q(ctx, '.sa-echo-go'));
    expect(panel('echo').dataset.state).toBe('listening');
    for (let i = 0; i < 3; i++) {
      fire(q(ctx, '.sa-singer'), 'pointerdown');
      fire(q(ctx, '.sa-singer'), 'pointerup');
      await vi.advanceTimersByTimeAsync(400);
    }
    await vi.advanceTimersByTimeAsync(2000);
    expect(panel('echo').dataset.state).toBe('choir');
    await vi.advanceTimersByTimeAsync(5000);
    expect(note).toHaveBeenCalled();
    expect(panel('echo').dataset.state).toBe('ready');
    expect(all(ctx, '.sa-pip-on').length).toBe(1);
  });

  it('records one line and has the choir sing it back at different speeds', async () => {
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await settle();
    await tap(mode('echo'));
    expect(q(ctx, '.sa-echo-go').textContent).toBe('🎤');
    await tap(q(ctx, '.sa-echo-go'));
    expect(panel('echo').dataset.state).toBe('listening');
    mic.level = 0.5;
    for (let i = 0; i < 4; i++) {
      mic.feed(2);
      await vi.advanceTimersByTimeAsync(200);
    }
    mic.level = 0;
    await vi.advanceTimersByTimeAsync(1800);
    expect(panel('echo').dataset.state).toBe('choir');
    await vi.advanceTimersByTimeAsync(6000);
    const rates = mic.played.map((p) => p.rate);
    expect(rates.length).toBe(CHOIR.filter((c) => c.at === 0).length);
    expect(new Set(rates).size).toBe(rates.length);
    expect(panel('echo').dataset.state).toBe('ready');
  });

  it('gives up gently when nothing is sung', async () => {
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await settle();
    await tap(mode('echo'));
    await tap(q(ctx, '.sa-echo-go'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(panel('echo').dataset.state).toBe('ready');
    expect(mic.played.length).toBe(0);
    expect(ctx.stars).toBe(0);
  });

  it('closes the show after three answers', async () => {
    mic.granted = false;
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await tap(mode('echo'));
    for (let round = 0; round < 3; round++) {
      await tap(q(ctx, '.sa-echo-go'));
      for (let i = 0; i < 3; i++) {
        fire(q(ctx, '.sa-singer'), 'pointerdown');
        fire(q(ctx, '.sa-singer'), 'pointerup');
        await vi.advanceTimersByTimeAsync(400);
      }
      await vi.advanceTimersByTimeAsync(9000);
    }
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelector('.sa-res')).not.toBeNull();
  });
});

describe('singing bird', () => {
  it('climbs while the singer is held and glides down when let go', async () => {
    mic.granted = false;
    game.start(ctx);
    await tap(mode('bird'));
    const bird = q(ctx, '.sa-bird');
    const top = () => parseFloat(bird.style.top);
    await vi.advanceTimersByTimeAsync(600);
    const start = top();
    expect(Number.isFinite(start)).toBe(true);
    fire(q(ctx, '.sa-sky'), 'pointerdown');
    await vi.advanceTimersByTimeAsync(1200);
    const held = top();
    expect(held).toBeLessThan(start);
    fire(q(ctx, '.sa-sky'), 'pointerup');
    // It keeps its momentum for a moment, then glides down to the grass.
    await vi.advanceTimersByTimeAsync(4500);
    expect(top()).toBeGreaterThan(held);
  });

  it('stops its loop when the child switches away', async () => {
    game.start(ctx);
    const before = vi.getTimerCount();
    await tap(mode('bird'));
    await tap(mode('song'));
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before + 1);
  });
});

describe('the show', () => {
  it('plays a whole song with lights and ends with a curtain call', async () => {
    game.start(ctx);
    await tap(mode('perform'));
    expect(all(ctx, '.sa-fx-btn').length).toBe(4);
    await tap(q(ctx, '.sa-fx-btn[data-fx="rainbow"]'));
    expect(q(ctx, '.sa-back').dataset.lights).toBe('rainbow');
    expect(ctx.stage.querySelectorAll('.sa-spark').length).toBeGreaterThan(0);
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    await tap(panel('perform').querySelector(`.sa-song[data-song="${REPERTOIRE[0]!.id}"]`)!);
    expect(q(ctx, '.sa-now').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(note).toHaveBeenCalled();
    expect(drum).toHaveBeenCalledWith('kick');
    expect(drum).toHaveBeenCalledWith('hat');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.stars).toBe(1);
    expect(q(ctx, '.sa-res')).toBeTruthy();
    await tap(q(ctx, '.sa-res-go'));
    expect(q(ctx, '.sa-now').hidden).toBe(true);
  });

  it('puts the lights back when the child leaves it', async () => {
    game.start(ctx);
    await tap(mode('perform'));
    await tap(q(ctx, '.sa-fx-btn[data-fx="fire"]'));
    await tap(mode('song'));
    expect(q(ctx, '.sa-back').dataset.lights).toBe('gold');
  });
});

describe('photos', () => {
  it('seats the family in the front row and lets the child sing as one of them', async () => {
    await ctx.photos.add([new Blob(['a']), new Blob(['b'])]);
    game.start(ctx);
    await settle(50);
    expect(all(ctx, '.sa-family').length).toBe(2);
    expect(q(ctx, '.sa-row-front').querySelectorAll('.sa-family').length).toBe(2);
    expect(q(ctx, '.sa-singer .sa-face').classList.contains('sa-photo')).toBe(false);

    await tap(q(ctx, '.sa-wardrobe'));
    const cells = all(ctx, '.sa-wd-cell');
    expect(cells.length).toBeGreaterThan(5);
    await tap(q(ctx, '.sa-wd-photo').parentElement as HTMLElement);
    expect(q(ctx, '.sa-singer .sa-face').classList.contains('sa-photo')).toBe(true);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}').face).toMatch(/^photo:/);
    await tap(q(ctx, '.sa-wd-close'));
    expect(ctx.stage.querySelector('.sa-wd')).toBeNull();
  });

  it('tells the child what is missing instead of dressing them in a hat not yet won', async () => {
    game.start(ctx);
    await tap(q(ctx, '.sa-wardrobe'));
    const locked = q(ctx, '.sa-wd-locked');
    await tap(locked);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}').hat ?? 'none').toBe('none');
    expect(q(ctx, '.sa-bubble').textContent).toMatch(/vé/);
  });
});

describe('leaving', () => {
  it('turns the microphone off and leaves nothing running', async () => {
    game.start(ctx);
    await tap(q(ctx, '.sa-mic'));
    await settle();
    await tap(mode('bird'));
    ctx.cleanup();
    mic.level = 0.9;
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelectorAll('.sa-note').length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
