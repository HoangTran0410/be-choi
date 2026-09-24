import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { SHELVES } from './logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
    }
  };
}

const ptr = (type = 'pointerdown'): PointerEvent => new PointerEvent(type, { pointerId: 1, bubbles: true });
const ID = 'dQw4w9WgXcQ';
const CUSTOM_KEY = 'be-choi:videos-custom';
const PLAYER = 'https://www.youtube-nocookie.com';

function mount() {
  vi.useFakeTimers();
  const ctx = fakeContext();
  game.start(ctx);
  return ctx;
}

const cards = (ctx: ReturnType<typeof fakeContext>) => [...ctx.stage.querySelectorAll<HTMLElement>('.vd-card')];
const iframe = (ctx: ReturnType<typeof fakeContext>) => ctx.stage.querySelector('iframe');

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

function addLink(ctx: ReturnType<typeof fakeContext>, text: string): void {
  ctx.stage.querySelector<HTMLElement>('.vd-plus')!.dispatchEvent(ptr('pointerup'));
  const input = ctx.stage.querySelector<HTMLInputElement>('.vd-input')!;
  input.value = text;
  ctx.stage.querySelector<HTMLFormElement>('.vd-box')!.requestSubmit();
}

describe('videos game', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    setOnline(true);
    fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ title: 'Baby Shark' }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setOnline(true);
  });

  it('opens on the first shelf, a card with a picture for every video, and a tab per shelf', () => {
    const ctx = mount();
    expect(ctx.stage.querySelectorAll('.vd-tab').length).toBe(SHELVES.length);
    expect(cards(ctx).length).toBe(SHELVES[0]!.videos.length);
    const first = SHELVES[0]!.videos[0]!;
    expect(cards(ctx)[0]!.querySelector('img')!.getAttribute('src')).toBe(`https://i.ytimg.com/vi/${first.id}/mqdefault.jpg`);
    expect(cards(ctx)[0]!.textContent).toContain(first.title);
    ctx.cleanup();
  });

  it('shows the emoji when the picture cannot load', () => {
    const ctx = mount();
    const img = cards(ctx)[0]!.querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    expect(cards(ctx)[0]!.querySelector('img')).toBeNull();
    expect(cards(ctx)[0]!.querySelector('.vd-emoji')!.textContent).toBe(SHELVES[0]!.videos[0]!.emoji);
    ctx.cleanup();
  });

  it('plays the card pressed, and the ✕ takes the player away', () => {
    const ctx = mount();
    const video = SHELVES[0]!.videos[2]!;
    cards(ctx)[2]!.click();
    const src = iframe(ctx)!.getAttribute('src')!;
    expect(src).toContain(`https://www.youtube-nocookie.com/embed/${video.id}?`);
    expect(src).toContain('autoplay=1');
    ctx.stage.querySelector<HTMLElement>('.vd-close')!.dispatchEvent(ptr());
    expect(iframe(ctx)).toBeNull();
    expect(ctx.stage.querySelector('.vd-player')).toBeNull();
    ctx.cleanup();
  });

  it('covers the player’s edges with strips that swallow every touch, and leaves the middle open', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const frame = ctx.stage.querySelector<HTMLElement>('.vd-frame')!;
    const strips = [...frame.querySelectorAll<HTMLElement>('.vd-shield:not(.vd-plug)')];
    expect(strips.map((s) => s.dataset.side)).toEqual(['top', 'bottom', 'left', 'right']);
    // Laid after the iframe, in the same box: they are on top.
    expect(frame.firstElementChild).toBe(iframe(ctx));
    // Placed in percent, so the hole moves with the player when it is resized.
    const box = (el: HTMLElement) => ['top', 'left', 'width', 'height'].map((k) => parseFloat(el.style.getPropertyValue(k)));
    for (const s of strips) for (const k of ['top', 'left', 'width', 'height']) expect(s.style.getPropertyValue(k)).toMatch(/%$/);
    const covered = (x: number, y: number) =>
      strips.some((s) => {
        const [t, l, w, hgt] = box(s) as [number, number, number, number];
        return x >= l && x < l + w && y >= t && y < t + hgt;
      });
    // The middle (YouTube's big play button) is open; the edges, where its links are, are not.
    for (const [x, y] of [
      [50, 50],
      [30, 30],
      [70, 70],
    ] as const)
      expect(covered(x, y), `${x},${y}`).toBe(false);
    for (const [x, y] of [
      [5, 5],
      [50, 3],
      [95, 95],
      [3, 50],
      [97, 50],
      [50, 97],
      [20, 50],
      [50, 80],
    ] as const)
      expect(covered(x, y), `${x},${y}`).toBe(true);

    const reached: string[] = [];
    iframe(ctx)!.addEventListener('pointerdown', () => reached.push('iframe'));
    ctx.stage.addEventListener('click', () => reached.push('stage'));
    for (const strip of strips) {
      for (const e of [
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ]) {
        strip.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
      }
    }
    expect(reached).toEqual([]);
    ctx.cleanup();
  });

  it('asks YouTube for a player with nothing of its own to press', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const url = new URL(iframe(ctx)!.getAttribute('src')!);
    expect(url.origin).toBe(PLAYER);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      autoplay: '1',
      controls: '0',
      disablekb: '1',
      fs: '0',
      iv_load_policy: '3',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      loop: '1',
      playlist: SHELVES[0]!.videos[0]!.id,
      enablejsapi: '1',
      origin: location.origin,
    });
    // Not muted: where the browser lets the card's tap carry over, it starts with sound.
    expect(url.searchParams.has('mute')).toBe(false);
    expect(iframe(ctx)!.getAttribute('allow')).toContain('autoplay');
    ctx.cleanup();
  });

  it('drives the player with its own big buttons', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const win = iframe(ctx)!.contentWindow!;
    const post = vi.spyOn(win, 'postMessage').mockImplementation(() => undefined);
    const sent = () => post.mock.calls.map(([msg, origin]) => ({ ...JSON.parse(String(msg)), origin }));
    const toggle = ctx.stage.querySelector<HTMLElement>('.vd-toggle')!;
    const sound = ctx.stage.querySelector<HTMLElement>('.vd-sound')!;

    // It starts with sound, so no 🔊 until the player says it was muted.
    expect(sound.hidden).toBe(true);
    expect(toggle.textContent).toBe('⏸️');

    toggle.dispatchEvent(ptr());
    expect(sent().at(-1)).toEqual({ event: 'command', func: 'pauseVideo', args: [], origin: PLAYER });
    expect(toggle.textContent).toBe('▶️');
    toggle.dispatchEvent(ptr());
    expect(sent().at(-1)).toMatchObject({ func: 'playVideo' });

    post.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', { origin: PLAYER, source: win, data: '{"event":"infoDelivery","info":{"muted":true}}' }),
    );
    expect(sound.hidden).toBe(false);
    sound.dispatchEvent(ptr());
    expect(sent().map((m) => m.func)).toEqual(['unMute', 'playVideo']);
    expect(sound.hidden).toBe(true);
    ctx.cleanup();
  });

  it('says hello once the player has loaded, until the player answers', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const frame = iframe(ctx)!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    frame.dispatchEvent(new Event('load'));
    expect(JSON.parse(String(post.mock.calls[0]![0]))).toMatchObject({ event: 'listening' });
    vi.advanceTimersByTime(1000);
    const before = post.mock.calls.length;
    expect(before).toBeGreaterThan(1);
    window.dispatchEvent(new MessageEvent('message', { origin: PLAYER, source: frame.contentWindow, data: '{"event":"onReady"}' }));
    vi.advanceTimersByTime(2000);
    expect(post.mock.calls.length).toBe(before);
    ctx.cleanup();
  });

  it('keeps ⏯ and 🔊 in step with what the player reports, and believes no one else', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const frame = iframe(ctx)!;
    const toggle = ctx.stage.querySelector<HTMLElement>('.vd-toggle')!;
    const sound = ctx.stage.querySelector<HTMLElement>('.vd-sound')!;
    const say = (data: unknown, origin = PLAYER, source: Window | null = frame.contentWindow) =>
      window.dispatchEvent(new MessageEvent('message', { origin, source, data }));

    say('{"event":"onStateChange","info":2}', 'https://evil.example');
    say('{"event":"onStateChange","info":2}', PLAYER, window);
    expect(toggle.textContent).toBe('⏸️');

    say('{"event":"onStateChange","info":2}');
    expect(toggle.textContent).toBe('▶️');
    say({ event: 'infoDelivery', info: { playerState: 1, muted: false } });
    expect(toggle.textContent).toBe('⏸️');
    expect(sound.hidden).toBe(true);
    say('{"event":"infoDelivery","info":{"muted":true}}');
    expect(sound.hidden).toBe(false);
    say('garbage');
    expect(toggle.textContent).toBe('⏸️');
    ctx.cleanup();
  });

  it('lets the controls fade while a video plays untouched, and brings them back on a touch or a pause', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const frame = iframe(ctx)!;
    const player = ctx.stage.querySelector<HTMLElement>('.vd-player')!;
    const say = (data: string) => window.dispatchEvent(new MessageEvent('message', { origin: PLAYER, source: frame.contentWindow, data }));
    say('{"event":"onStateChange","info":1}');
    vi.advanceTimersByTime(3100);
    expect(player.classList.contains('vd-idle')).toBe(true);
    // A touch anywhere, even on the shield that swallows it, wakes them.
    ctx.stage.querySelector<HTMLElement>('.vd-shield')!.dispatchEvent(ptr());
    expect(player.classList.contains('vd-idle')).toBe(false);
    vi.advanceTimersByTime(3100);
    expect(player.classList.contains('vd-idle')).toBe(true);
    // Paused: they come back and stay.
    say('{"event":"onStateChange","info":2}');
    expect(player.classList.contains('vd-idle')).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(player.classList.contains('vd-idle')).toBe(false);
    ctx.cleanup();
  });

  it('sandboxes the player: its links can neither open a tab nor take the app away', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const frame = iframe(ctx)!;
    const tokens = frame.getAttribute('sandbox')!.split(/\s+/).sort();
    expect(tokens).toEqual(['allow-presentation', 'allow-same-origin', 'allow-scripts']);
    for (const t of tokens) expect(t).not.toMatch(/popups|top-navigation|forms/);
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    ctx.cleanup();
  });

  describe('once it is playing', () => {
    function open() {
      const ctx = mount();
      cards(ctx)[0]!.click();
      const frame = iframe(ctx)!;
      const win = frame.contentWindow!;
      const post = vi.spyOn(win, 'postMessage').mockImplementation(() => undefined);
      const say = (info: unknown, event = 'infoDelivery') =>
        window.dispatchEvent(new MessageEvent('message', { origin: PLAYER, source: win, data: JSON.stringify({ event, info }) }));
      const sent = () => post.mock.calls.map(([msg]) => JSON.parse(String(msg)) as { func: string; args: unknown[] });
      const q = <T extends HTMLElement>(sel: string) => ctx.stage.querySelector<T>(sel)!;
      return { ctx, say, sent, post, q };
    }

    it('keeps the middle open until the first play, then closes it', () => {
      const { ctx, say, q } = open();
      expect(q('.vd-plug').hidden).toBe(true);
      say({ playerState: 2 });
      expect(q('.vd-plug').hidden).toBe(true);
      say({ playerState: 1 });
      expect(q('.vd-plug').hidden).toBe(false);
      ctx.cleanup();
    });

    it('covers a paused player with its own poster, but not before it has played', () => {
      const { ctx, say, sent, post, q } = open();
      const poster = q('.vd-poster');
      say({ playerState: -1 });
      say({ playerState: 2 });
      expect(poster.hidden).toBe(true);
      say({ playerState: 1 });
      expect(poster.hidden).toBe(true);
      say({ playerState: 2 });
      expect(poster.hidden).toBe(false);
      expect(poster.querySelector('img')!.getAttribute('src')).toBe(`https://i.ytimg.com/vi/${SHELVES[0]!.videos[0]!.id}/hqdefault.jpg`);

      post.mockClear();
      poster.dispatchEvent(ptr());
      expect(sent().map((m) => m.func)).toEqual(['playVideo']);
      // Up until the player says it is playing, so its "more videos" never peeks out.
      expect(poster.hidden).toBe(false);
      say(1, 'onStateChange');
      expect(poster.hidden).toBe(true);

      // Our own ⏯ pausing shows it too.
      q('.vd-toggle').dispatchEvent(ptr());
      expect(sent().at(-1)!.func).toBe('pauseVideo');
      expect(poster.hidden).toBe(false);
      ctx.cleanup();
    });

    it('shows the time and seeks 10 s either way, never past either end', () => {
      const { ctx, say, sent, q } = open();
      const [back, fwd] = [...ctx.stage.querySelectorAll<HTMLElement>('.vd-jump')];
      expect(q('.vd-seek').hidden).toBe(true);
      expect(back!.hidden).toBe(true);

      say({ playerState: 1, currentTime: 5, duration: 100, videoData: { isLive: false } });
      expect(q('.vd-seek').hidden).toBe(false);
      expect(back!.hidden).toBe(false);
      expect(q('.vd-time').textContent).toBe('0:05 / 1:40');

      back!.dispatchEvent(ptr());
      expect(sent().at(-1)).toEqual({ event: 'command', func: 'seekTo', args: [0, true] });
      fwd!.dispatchEvent(ptr());
      expect(sent().at(-1)!.args).toEqual([10, true]);
      say({ currentTime: 95 });
      fwd!.dispatchEvent(ptr());
      expect(sent().at(-1)!.args).toEqual([100, true]);
      expect(q('.vd-time').textContent).toBe('1:40 / 1:40');
      ctx.cleanup();
    });

    it('jumps to where the bar is tapped, and follows a drag before seeking once', () => {
      const { ctx, say, sent, post, q } = open();
      say({ playerState: 1, currentTime: 0, duration: 200 });
      const track = q('.vd-track');
      track.getBoundingClientRect = () => ({
        left: 100,
        width: 400,
        top: 0,
        height: 48,
        right: 500,
        bottom: 48,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      });
      const at = (type: string, x: number) => track.dispatchEvent(new PointerEvent(type, { pointerId: 1, bubbles: true, clientX: x }));

      post.mockClear();
      at('pointerdown', 300);
      at('pointerup', 300);
      expect(sent()).toEqual([{ event: 'command', func: 'seekTo', args: [100, true] }]);

      post.mockClear();
      at('pointerdown', 150);
      at('pointermove', 400);
      expect(q('.vd-knob').style.left).toBe('75%');
      // Reports from the player do not yank the knob from under the finger.
      say({ currentTime: 101 });
      expect(q('.vd-knob').style.left).toBe('75%');
      expect(sent()).toEqual([]);
      at('pointerup', 900);
      expect(sent()).toEqual([{ event: 'command', func: 'seekTo', args: [200, true] }]);
      ctx.cleanup();
    });

    it('has nothing to seek along on a live stream', () => {
      const { ctx, say, q } = open();
      say({ playerState: 1, currentTime: 3111310, duration: 3114908, videoData: { isLive: true } });
      expect(q('.vd-seek').hidden).toBe(true);
      for (const b of ctx.stage.querySelectorAll<HTMLElement>('.vd-jump')) expect(b.hidden).toBe(true);
      expect(q('.vd-toggle').hidden).toBe(false);
      ctx.cleanup();
    });
  });

  it('switches shelves from the tabs and remembers the shelf for next time', () => {
    const ctx = mount();
    const shelf = SHELVES[2]!;
    ctx.stage.querySelector<HTMLElement>(`.vd-tab[data-shelf="${shelf.id}"]`)!.dispatchEvent(ptr());
    expect(cards(ctx).length).toBe(shelf.videos.length);
    ctx.cleanup();
    const again = mount();
    expect(again.stage.querySelector('.vd-tab-on')!.getAttribute('data-shelf')).toBe(shelf.id);
    again.cleanup();
  });

  it('says it needs the internet instead of opening a broken player, and plays once it is back', () => {
    setOnline(false);
    const ctx = mount();
    cards(ctx)[0]!.click();
    expect(iframe(ctx)).toBeNull();
    expect(ctx.stage.querySelector('.vd-offline')!.textContent).toContain('mạng');
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(iframe(ctx)).not.toBeNull();
    ctx.cleanup();
  });

  it('stops the video when the child leaves the game', () => {
    const ctx = mount();
    cards(ctx)[0]!.click();
    const frame = iframe(ctx)!;
    ctx.cleanup();
    expect(frame.isConnected).toBe(false);
  });

  it('adds a pasted link to its own shelf, keeps it, and names it from YouTube', async () => {
    const ctx = mount();
    addLink(ctx, `https://youtu.be/${ID}?si=abc`);
    expect(ctx.stage.querySelector('.vd-add')).toBeNull();
    expect(ctx.stage.querySelector('.vd-tab-on')!.getAttribute('data-shelf')).toBe('mine');
    expect(cards(ctx).map((c) => c.dataset.key)).toEqual([`${ID}|`]);
    expect(JSON.parse(localStorage.getItem(CUSTOM_KEY)!)).toEqual([{ video: ID, title: 'Video của bé' }]);

    expect(String(fetchMock.mock.calls[0]![0])).toContain('https://www.youtube.com/oembed?url=');
    await vi.advanceTimersByTimeAsync(0);
    expect(cards(ctx)[0]!.textContent).toContain('Baby Shark');
    expect(JSON.parse(localStorage.getItem(CUSTOM_KEY)!)[0].title).toBe('Baby Shark');

    vi.advanceTimersByTime(500);
    cards(ctx)[0]!.click();
    expect(iframe(ctx)!.getAttribute('src')).toContain(`/embed/${ID}?`);
    ctx.cleanup();

    const again = mount();
    again.stage.querySelector<HTMLElement>('.vd-tab[data-shelf="mine"]')!.dispatchEvent(ptr());
    expect(cards(again)[0]!.textContent).toContain('Baby Shark');
    again.cleanup();
  });

  it('keeps the generic name when YouTube cannot be asked', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    const ctx = mount();
    addLink(ctx, `https://www.youtube.com/watch?v=${ID}`);
    await vi.advanceTimersByTimeAsync(0);
    expect(cards(ctx)[0]!.textContent).toContain('Video của bé');
    ctx.cleanup();
  });

  it('turns away a link that is not YouTube, and saves nothing', () => {
    const ctx = mount();
    addLink(ctx, 'https://vimeo.com/123456');
    expect(ctx.stage.querySelector('.vd-error')!.textContent).toBe('Link này không phải video YouTube.');
    expect(ctx.stage.querySelector('.vd-add')).not.toBeNull();
    expect(localStorage.getItem(CUSTOM_KEY)).toBeNull();
    expect(ctx.stage.querySelector('.vd-tab[data-shelf="mine"]')).toBeNull();
    ctx.cleanup();
  });

  it('only lets go of a saved video after a long press on its ✕', () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify([{ video: ID, title: 'Mine' }]));
    localStorage.setItem('be-choi:videos-tab', 'mine');
    const ctx = mount();
    expect(cards(ctx).length).toBe(1);
    const del = ctx.stage.querySelector<HTMLElement>('.vd-del')!;
    del.dispatchEvent(ptr());
    vi.advanceTimersByTime(200);
    del.dispatchEvent(ptr('pointerup'));
    expect(cards(ctx).length).toBe(1);

    del.dispatchEvent(ptr());
    vi.advanceTimersByTime(1000);
    expect(JSON.parse(localStorage.getItem(CUSTOM_KEY)!)).toEqual([]);
    // Nothing left on it, so the shelf goes and the first one shows.
    expect(ctx.stage.querySelector('.vd-tab[data-shelf="mine"]')).toBeNull();
    expect(cards(ctx).length).toBe(SHELVES[0]!.videos.length);
    ctx.cleanup();
  });
});
