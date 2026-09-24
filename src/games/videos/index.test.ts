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
