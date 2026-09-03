import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { createPhotoStore } from '../../core/photos';
import { FLAVORS, HAPPY_BIRTHDAY, HAPPY_BIRTHDAY_BPM, MAX_CANDLES } from './logic';
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

function ptr(type: string, x = 0, y = 0, id = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true, bubbles: true });
}

function tap(el: Element): void {
  el.dispatchEvent(ptr('pointerdown'));
  el.dispatchEvent(ptr('pointerup'));
}

/** jsdom rects are all zeros: a drop at (0,0) lands on the cake, one far away misses. */
function drop(el: Element, x = 0, y = 0): void {
  el.dispatchEvent(ptr('pointerdown'));
  el.dispatchEvent(ptr('pointermove', x, y));
  el.dispatchEvent(ptr('pointerup', x, y));
}

const SONG_MS = (HAPPY_BIRTHDAY.reduce((s, n) => s + n.d, 0) * 60000) / HAPPY_BIRTHDAY_BPM;

function q<T extends Element = HTMLElement>(ctx: FakeContext, sel: string): T {
  const el = ctx.stage.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}
function all(ctx: FakeContext, sel: string): HTMLElement[] {
  return [...ctx.stage.querySelectorAll<HTMLElement>(sel)];
}
function visibleButtons(ctx: FakeContext): string[] {
  return all(ctx, '.birthday-buttons .btn-round')
    .filter((b) => !b.hidden)
    .map((b) => b.textContent ?? '');
}

const ticksDone = (ctx: FakeContext): string[] => all(ctx, '.birthday-tick.done').map((el) => el.dataset.job ?? '');

/** Add `n` candles and light them all with 🔥. The song starts at once. */
function addAndLight(ctx: FakeContext, n: number): void {
  for (let i = 0; i < n; i++) tap(q(ctx, '.birthday-add-candle'));
  tap(q(ctx, '.birthday-light'));
}

/** … and let "Happy Birthday" finish. */
async function addLightAndSing(ctx: FakeContext, n: number): Promise<void> {
  addAndLight(ctx, n);
  await vi.advanceTimersByTimeAsync(SONG_MS + 50);
}

describe('birthday game', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts the cake, 8 toppings, the button row and three empty ticks', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(all(ctx, '.birthday-cake').length).toBe(1);
    expect(all(ctx, '.birthday-tier').length).toBe(2);
    expect(all(ctx, '.birthday-plate').length).toBe(1);
    expect(all(ctx, '.birthday-tray .birthday-topping').length).toBe(8);
    // 🔁 never goes away: a fresh cake is always one press off.
    expect(visibleButtons(ctx)).toEqual(['\u{1F382}', '\u{1F56F}\uFE0F', '\u{1F525}', '\u{1F501}']);
    expect(all(ctx, '.birthday-tick').length).toBe(3);
    expect(ticksDone(ctx)).toEqual([]);
    expect(q(ctx, '.birthday-cake').dataset.flavor).toBe(FLAVORS[0]!.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(q(ctx, '.birthday-topper').hidden).toBe(true);
    // Idle hint with no candles yet: the 🕯️ button wiggles.
    vi.advanceTimersByTime(6000);
    expect(q(ctx, '.birthday-add-candle').classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('decorates: toppings stick on the cake, flavour cycles, candles are counted, 🔥 needs a candle', () => {
    const ctx = fakeContext();
    const pop = vi.spyOn(ctx.audio, 'pop');
    const boing = vi.spyOn(ctx.audio, 'boing');
    const tick = vi.spyOn(ctx.audio, 'tick');
    game.start(ctx);
    const strawberry = q(ctx, '.birthday-tray .birthday-topping[data-emoji="\u{1F353}"]');

    drop(strawberry);
    expect(all(ctx, '.birthday-decor .birthday-topping.placed').length).toBe(1);
    expect(q(ctx, '.birthday-decor .birthday-topping.placed').textContent).toBe('\u{1F353}');
    expect(pop).toHaveBeenCalledTimes(1);
    // The tray piece stays in the tray for the next strawberry.
    expect(all(ctx, '.birthday-tray .birthday-topping').length).toBe(8);
    expect(strawberry.classList.contains('spring-back')).toBe(true);
    drop(strawberry);
    expect(all(ctx, '.birthday-decor .birthday-topping.placed').length).toBe(2);

    // Away from the cake: silent spring back, nothing placed.
    drop(strawberry, 900, 900);
    expect(all(ctx, '.birthday-decor .birthday-topping.placed').length).toBe(2);
    expect(pop).toHaveBeenCalledTimes(2);
    expect(boing).not.toHaveBeenCalled();

    // 🔥 with no candle: nudge towards 🕯️ instead.
    tap(q(ctx, '.birthday-light'));
    expect(all(ctx, '.birthday-flame').length).toBe(0);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(q(ctx, '.birthday-add-candle').classList.contains('anim-wiggle')).toBe(true);

    // 🎂 cycles the flavour and names it.
    tap(q(ctx, '.birthday-flavor'));
    expect(q(ctx, '.birthday-cake').dataset.flavor).toBe(FLAVORS[1]!.id);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(ctx.spoken).toContain(`B\u00e1nh ${FLAVORS[1]!.name}`);

    // 🕯️ ×3 → three candles, counted "một, hai, ba".
    for (let i = 0; i < 3; i++) tap(q(ctx, '.birthday-add-candle'));
    expect(all(ctx, '.birthday-candle').length).toBe(3);
    expect(ctx.spoken.slice(-3)).toEqual(['m\u1ed9t', 'hai', 'ba']);
    expect(ticksDone(ctx)).toEqual(['candles']);
    for (let i = 0; i < MAX_CANDLES; i++) tap(q(ctx, '.birthday-add-candle'));
    expect(all(ctx, '.birthday-candle').length).toBe(MAX_CANDLES);

    // Idle hint with unlit candles: 🔥 wiggles.
    vi.advanceTimersByTime(6000);
    expect(q(ctx, '.birthday-light').classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps decorating live while the candles burn, and while the song plays', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    const strawberry = q(ctx, '.birthday-tray .birthday-topping[data-emoji="\u{1F353}"]');
    addAndLight(ctx, 2);
    expect(all(ctx, '.birthday-flame').length).toBe(2);
    expect(ticksDone(ctx)).toEqual(['candles', 'lit']);
    // Every button is still there, and every one of them still works.
    expect(visibleButtons(ctx)).toEqual(['\u{1F382}', '\u{1F56F}\uFE0F', '\u{1F525}', '\u{1F3A4}', '\u{1F501}']);

    drop(strawberry);
    expect(all(ctx, '.birthday-decor .birthday-topping.placed').length).toBe(1);
    tap(q(ctx, '.birthday-flavor'));
    expect(q(ctx, '.birthday-cake').dataset.flavor).toBe(FLAVORS[1]!.id);

    // A third candle joins a burning cake, unlit, and the ticks say so.
    tap(q(ctx, '.birthday-add-candle'));
    expect(all(ctx, '.birthday-candle').length).toBe(3);
    expect(all(ctx, '.birthday-flame').length).toBe(2);
    expect(ticksDone(ctx)).toEqual(['candles']);

    // Blowing works during the song too: nothing is ever locked out.
    all(ctx, '.birthday-candle')[0]!.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.birthday-out').length).toBe(1);
    await vi.advanceTimersByTimeAsync(SONG_MS + 50);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a candle is a switch: tap to light, tap to blow out, tap to light again', async () => {
    const ctx = fakeContext();
    const pop = vi.spyOn(ctx.audio, 'pop');
    const puff = vi.spyOn(ctx.audio, 'puff');
    game.start(ctx);
    for (let i = 0; i < 2; i++) tap(q(ctx, '.birthday-add-candle'));
    const [first, second] = all(ctx, '.birthday-candle');

    pop.mockClear();
    first!.dispatchEvent(ptr('pointerdown'));
    expect(first!.classList.contains('birthday-lit')).toBe(true);
    expect(pop).toHaveBeenCalledWith(1.5);
    // The same candle again puts it out rather than doing nothing at all.
    first!.dispatchEvent(ptr('pointerdown'));
    expect(first!.classList.contains('birthday-out')).toBe(true);
    expect(puff).toHaveBeenCalledTimes(1);
    // And once more lights it back up.
    first!.dispatchEvent(ptr('pointerdown'));
    expect(first!.classList.contains('birthday-lit')).toBe(true);
    expect(first!.classList.contains('birthday-out')).toBe(false);
    expect(all(ctx, '.birthday-flame').length).toBe(1);

    // Lighting the last one starts the song.
    const note = vi.spyOn(ctx.audio, 'note');
    second!.querySelector('.birthday-stick')!.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.birthday-flame').length).toBe(2);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(expect.closeTo(261.63, 1), expect.closeTo(0.3375, 3), 'piano');
    expect(all(ctx, '.birthday-note').length).toBe(1);
    expect(ctx.spoken).toContain('Ch\u00fac m\u1eebng sinh nh\u1eadt!');
    await vi.advanceTimersByTimeAsync(SONG_MS + 50);
    expect(note).toHaveBeenCalledTimes(HAPPY_BIRTHDAY.length);
    expect(ctx.spoken.at(-1)).toBe('Th\u1ed5i n\u1ebfn n\u00e0o!');
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('blows the cake out for a star, and gives another one for a second round on the same cake', async () => {
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    game.start(ctx);
    await addLightAndSing(ctx, 3);
    const candles = all(ctx, '.birthday-candle');

    // Idle hint with everything alight: a lit candle and the 🎤 wiggle.
    vi.advanceTimersByTime(6000);
    expect(candles.some((c) => c.classList.contains('anim-wiggle') && c.classList.contains('birthday-lit'))).toBe(true);

    candles[0]!.querySelector('.birthday-flame')!.dispatchEvent(ptr('pointerdown'));
    expect(candles[0]!.classList.contains('birthday-out')).toBe(true);
    expect(candles[0]!.querySelector('.birthday-flame')!.classList.contains('birthday-flame-out')).toBe(true);
    expect(candles[0]!.querySelector('.birthday-puff')).not.toBeNull();
    expect(puff).toHaveBeenCalledTimes(1);
    expect(ctx.celebrations).toBe(0);
    candles[1]!.dispatchEvent(ptr('pointerdown'));
    candles[2]!.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.birthday-out').length).toBe(3);
    expect(puff).toHaveBeenCalledTimes(3);
    expect(ticksDone(ctx)).toEqual(['candles', 'out']);
    expect(ctx.spoken.at(-1)).toBe('Ch\u00fac m\u1eebng sinh nh\u1eadt b\u00e9!');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(all(ctx, '.birthday-flame').length).toBe(0);
    expect(all(ctx, '.birthday-puff').length).toBe(0);

    // The same cake, lit and blown out again, is worth another star.
    tap(q(ctx, '.birthday-light'));
    expect(all(ctx, '.birthday-flame').length).toBe(3);
    await vi.advanceTimersByTimeAsync(SONG_MS + 50);
    for (const c of all(ctx, '.birthday-candle')) c.dispatchEvent(ptr('pointerdown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.stars).toBe(2);

    // 🔁: fresh cake with the next flavour, and nothing to blow out.
    tap(q(ctx, '.birthday-again'));
    expect(all(ctx, '.birthday-candle').length).toBe(0);
    expect(all(ctx, '.birthday-decor .birthday-topping').length).toBe(0);
    expect(q(ctx, '.birthday-cake').dataset.flavor).toBe(FLAVORS[1]!.id);
    expect(ticksDone(ctx)).toEqual([]);
    expect(visibleButtons(ctx)).toEqual(['\u{1F382}', '\u{1F56F}\uFE0F', '\u{1F525}', '\u{1F501}']);
    expect(ctx.stars).toBe(2);
    vi.advanceTimersByTime(1000);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a swipe across the flames blows them out one after another', async () => {
    const ctx = fakeContext();
    const puff = vi.spyOn(ctx.audio, 'puff');
    game.start(ctx);
    await addLightAndSing(ctx, 3);
    const cake = q(ctx, '.birthday-cake');
    // Every jsdom rect is at (0,0): each move finds the next still-lit candle.
    cake.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.birthday-out').length).toBe(1);
    cake.dispatchEvent(ptr('pointermove'));
    expect(all(ctx, '.birthday-out').length).toBe(2);
    window.dispatchEvent(ptr('pointerup'));
    // Finger lifted: moving without pressing does nothing.
    cake.dispatchEvent(ptr('pointermove'));
    expect(all(ctx, '.birthday-out').length).toBe(2);
    cake.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.birthday-out').length).toBe(3);
    expect(puff).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.celebrations).toBe(1);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('🎤 without getUserMedia hides itself and tells the child to touch the candles', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await addLightAndSing(ctx, 1);
    const mic = q(ctx, '.birthday-mic');
    expect(mic.hidden).toBe(false);
    tap(mic);
    await vi.advanceTimersByTimeAsync(0);
    expect(mic.hidden).toBe(true);
    expect(ctx.spoken.at(-1)).toBe('Chạm vào nến để thổi nhé');
    // Still blowable by touch.
    q(ctx, '.birthday-candle').dispatchEvent(ptr('pointerdown'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('🎤 with a microphone: two loud polls blow every candle out and release the mic', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    let level = 128;
    const close = vi.fn(() => Promise.resolve());
    const connect = vi.fn();
    class FakeAudioContext {
      state = 'running';
      createAnalyser() {
        return {
          fftSize: 2048,
          getByteTimeDomainData(buf: Uint8Array) {
            buf.fill(level);
          },
        };
      }
      createMediaStreamSource() {
        return { connect };
      }
      resume() {
        return Promise.resolve();
      }
      close = close;
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      const ctx = fakeContext();
      const puff = vi.spyOn(ctx.audio, 'puff');
      game.start(ctx);
      await addLightAndSing(ctx, 3);
      const mic = q(ctx, '.birthday-mic');
      tap(mic);
      await vi.advanceTimersByTimeAsync(0);
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(connect).toHaveBeenCalled();
      expect(mic.classList.contains('birthday-listening')).toBe(true);
      expect(ctx.spoken.at(-1)).toBe('Thổi mạnh vào micro nào!');

      // Quiet: nothing happens. One loud poll: still nothing.
      await vi.advanceTimersByTimeAsync(500);
      expect(all(ctx, '.birthday-out').length).toBe(0);
      level = 255;
      await vi.advanceTimersByTimeAsync(100);
      expect(all(ctx, '.birthday-out').length).toBe(0);
      level = 128;
      await vi.advanceTimersByTimeAsync(300);
      expect(all(ctx, '.birthday-out').length).toBe(0);

      // Two loud polls in a row: candles go out 150 ms apart and the mic is released.
      level = 255;
      await vi.advanceTimersByTimeAsync(200);
      expect(all(ctx, '.birthday-out').length).toBe(1);
      expect(stop).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      expect(mic.classList.contains('birthday-listening')).toBe(false);
      await vi.advanceTimersByTimeAsync(150);
      expect(all(ctx, '.birthday-out').length).toBe(2);
      await vi.advanceTimersByTimeAsync(150);
      expect(all(ctx, '.birthday-out').length).toBe(3);
      expect(puff).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(0);
      expect(ctx.celebrations).toBe(1);
      expect(ctx.stars).toBe(1);
      ctx.cleanup();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    }
  });

  it('🎤 a second press gives the microphone back', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const close = vi.fn(() => Promise.resolve());
    class FakeAudioContext {
      state = 'running';
      createAnalyser() {
        return { fftSize: 2048, getByteTimeDomainData: (buf: Uint8Array) => buf.fill(128) };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      resume() {
        return Promise.resolve();
      }
      close = close;
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      const ctx = fakeContext();
      game.start(ctx);
      await addLightAndSing(ctx, 1);
      const mic = q(ctx, '.birthday-mic');
      tap(mic);
      await vi.advanceTimersByTimeAsync(0);
      expect(mic.classList.contains('birthday-listening')).toBe(true);

      // A child who changes their mind can hand the microphone back.
      tap(mic);
      await vi.advanceTimersByTimeAsync(0);
      expect(mic.classList.contains('birthday-listening')).toBe(false);
      expect(stop).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      // The candle is still lit: giving the microphone back is not blowing it out.
      expect(all(ctx, '.birthday-out').length).toBe(0);
      ctx.cleanup();
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    }
  });

  it('cleanup while the mic is open or the song plays stops everything', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const close = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        createAnalyser() {
          return { fftSize: 2048, getByteTimeDomainData: (b: Uint8Array) => b.fill(128) };
        }
        createMediaStreamSource() {
          return { connect: () => undefined };
        }
        close = close;
      },
    );
    try {
      const ctx = fakeContext();
      const note = vi.spyOn(ctx.audio, 'note');
      game.start(ctx);
      addAndLight(ctx, 2);
      vi.advanceTimersByTime(1000);
      const played = note.mock.calls.length;
      expect(played).toBeGreaterThan(1);
      // Leaving mid-song: no more notes, nothing said afterwards.
      ctx.cleanup();
      vi.advanceTimersByTime(SONG_MS);
      expect(note).toHaveBeenCalledTimes(played);
      expect(ctx.spoken).not.toContain('Thổi nến nào!');
      expect(vi.getTimerCount()).toBe(0);

      const ctx2 = fakeContext();
      game.start(ctx2);
      await addLightAndSing(ctx2, 1);
      tap(q(ctx2, '.birthday-mic'));
      await vi.advanceTimersByTimeAsync(100);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      ctx2.cleanup();
      expect(stop).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    }
  });

  it('lets the parent pick which photo tops the cake and remembers it', async () => {
    const ctx = fakeContext();
    ctx.photos = createPhotoStore(async (f) => `data:image/jpeg;base64,${f.size}`);
    const [p1, p2] = await ctx.photos.add([new Blob(['a']), new Blob(['bb'])]);
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    const topper = q(ctx, '.birthday-topper');
    expect(topper.hidden).toBe(false);
    expect(topper.dataset.photo).toBe(p1!.id);
    const btn = q(ctx, '.birthday-photo');
    expect(visibleButtons(ctx)).toEqual(['🎂', '🕯️', '🔥', '🖼️', '🔁']);

    btn.dispatchEvent(ptr('pointerdown'));
    const overlay = q(ctx, '.pp-overlay');
    expect(overlay.parentElement).toBe(ctx.stage);
    expect(all(ctx, '.pp-tile').length).toBe(3);
    expect(all(ctx, '.pp-tile.pp-photo').length).toBe(2);
    expect(q(ctx, '.pp-tile[data-id="none"]').textContent).toBe('🎂');
    // A second tap while it is open does not stack another picker.
    btn.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.pp-overlay').length).toBe(1);

    q(ctx, `.pp-tile[data-id="${p2!.id}"]`).dispatchEvent(ptr('pointerup'));
    expect(all(ctx, '.pp-overlay').length).toBe(0);
    expect(topper.dataset.photo).toBe(p2!.id);
    expect(topper.style.backgroundImage).toContain('data:image/jpeg;base64,2');
    expect(localStorage.getItem('be-choi:birthday-photo')).toBe(p2!.id);
    // jsdom fires the `storage` event from a 0 ms timer: let it go.
    await vi.advanceTimersByTimeAsync(0);

    // The topper itself opens the picker; 🎂 means no photo.
    topper.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.pp-tile').length).toBe(3);
    q(ctx, '.pp-tile[data-id="none"]').dispatchEvent(ptr('pointerup'));
    expect(topper.hidden).toBe(true);
    expect(localStorage.getItem('be-choi:birthday-photo')).toBe('none');
    await vi.advanceTimersByTimeAsync(0);

    // Closing without choosing keeps the choice.
    btn.dispatchEvent(ptr('pointerdown'));
    q(ctx, '.pp-close').dispatchEvent(ptr('pointerup'));
    expect(all(ctx, '.pp-overlay').length).toBe(0);
    expect(topper.hidden).toBe(true);

    // The 🖼️ button stays reachable with the candles alight; the picker closes on cleanup.
    addAndLight(ctx, 1);
    expect(btn.hidden).toBe(false);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('remembers the chosen photo, falls back to the first when it is gone, and follows photo changes', async () => {
    const ctx = fakeContext();
    ctx.photos = createPhotoStore(async (f) => `data:image/jpeg;base64,${f.size}`);
    const [p1, p2] = await ctx.photos.add([new Blob(['a']), new Blob(['bb'])]);
    localStorage.setItem('be-choi:birthday-photo', p2!.id);
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    const topper = q(ctx, '.birthday-topper');
    expect(topper.dataset.photo).toBe(p2!.id);

    await ctx.photos.remove(p2!.id);
    expect(topper.hidden).toBe(false);
    expect(topper.dataset.photo).toBe(p1!.id);
    expect(q(ctx, '.birthday-photo').hidden).toBe(false);

    await ctx.photos.remove(p1!.id);
    expect(topper.hidden).toBe(true);
    expect(q(ctx, '.birthday-photo').hidden).toBe(true);
    topper.dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.pp-overlay').length).toBe(0);

    // Leaving with the picker open removes it.
    await ctx.photos.add([new Blob(['c'])]);
    q(ctx, '.birthday-photo').dispatchEvent(ptr('pointerdown'));
    expect(all(ctx, '.pp-overlay').length).toBe(1);
    ctx.cleanup();
    expect(ctx.stage.querySelector('.pp-overlay')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the first family photo as a topper on the cake', async () => {
    const ctx = fakeContext();
    await ctx.photos.add([new Blob(['x'])]);
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(0);
    const topper = q(ctx, '.birthday-topper');
    expect(topper.hidden).toBe(false);
    expect(topper.style.backgroundImage).toContain('data:image/jpeg');
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});
