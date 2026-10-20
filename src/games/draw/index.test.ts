import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { makePath, sampleTrack } from '../trace/logic';
import { PICTURES } from '../trace/pictures';
import { strokePath } from '../trace/modes';
import { STORAGE_KEY, createGallery, parseBook } from './gallery';
import game from './index';
import { THEMES } from './progress';
import { EXPO_MS } from './notebook';

vi.mock('./art', async () => {
  const real = await vi.importActual<typeof import('./art')>('./art');
  return { ...real, svgToJpeg: () => Promise.resolve('data:image/jpeg;base64,PRACTICE') };
});

function fakeCtx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'canvas') return canvas;
        if (key === 'getImageData')
          return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        return () => undefined;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

function ev(type: string, x = 0, y = 0): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

const flush = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

function setup() {
  const ctx = fakeContext();
  game.start(ctx);
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => ctx.stage.querySelector<T>(sel)!;
  const qa = (sel: string): HTMLElement[] => [...ctx.stage.querySelectorAll<HTMLElement>(sel)];
  const tap = (el: Element): void => {
    el.dispatchEvent(ev('pointerdown'));
  };
  const release = (el: Element): void => {
    el.dispatchEvent(ev('pointerdown'));
    el.dispatchEvent(ev('pointerup'));
  };
  const door = (id: string): void => tap(q(`.dr-door-${id}`));
  const stroke = (el: Element, pts: Array<[number, number]>): void => {
    el.dispatchEvent(ev('pointerdown', pts[0]![0], pts[0]![1]));
    for (const [x, y] of pts) el.dispatchEvent(ev('pointermove', x, y));
    el.dispatchEvent(ev('pointerup', pts.at(-1)![0], pts.at(-1)![1]));
  };
  return { ctx, q, qa, tap, release, door, stroke };
}

describe('draw workshop', () => {
  let live: FakeContext | null = null;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return fakeCtx2d(this);
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
  });
  afterEach(() => {
    live?.cleanup();
    live = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });
  const start = () => {
    const s = setup();
    live = s.ctx;
    return s;
  };

  it('opens on a door with four ways to draw, the notebook and the collection, all big and wordless', () => {
    const { qa, q } = start();
    expect(qa('.dr-door').length).toBe(6);
    for (const id of ['practice', 'colour', 'free', 'copy']) expect(q(`.dr-door-${id}`).getAttribute('aria-label')).toBeTruthy();
    expect(q('.dr-hub').textContent).not.toMatch(/[a-zA-ZÀ-ỹ]{3,}/);
    expect(q('.dr').classList.contains('at-hub')).toBe(true);
  });

  describe('Vẽ tự do', () => {
    it('has colour, pen, size, stamp and eraser, and never offers a locked colour for real', () => {
      const { door, qa, q, ctx, release } = start();
      door('free');
      expect(q('.dr').dataset.mode).toBe('free');
      expect(ctx.sequenced).toContain('Vẽ tự do.');
      for (const cls of ['dr-color', 'dr-brush', 'dr-size', 'dr-stamp', 'dr-eraser']) expect(q(`.dr-tools .${cls}`)).toBeTruthy();
      q('.dr-color').dispatchEvent(ev('pointerdown'));
      const tiles = qa('.dr-tile');
      expect(tiles.length).toBe(12);
      expect(tiles.filter((t) => t.classList.contains('locked')).length).toBe(6);
      // a locked colour does nothing but a soft sound, and the panel stays
      release(tiles.find((t) => t.classList.contains('locked'))!);
      expect(qa('.dr-panel').length).toBe(1);
      // an open one speaks its name slowly and closes the panel
      release(tiles[1]!);
      expect(ctx.sequenced.at(-1)).toBe('Màu vàng.');
      expect(qa('.dr-panel').length).toBe(0);
    });

    it('a panel that opens under the finger does not count that finger lifting as a choice', () => {
      const { door, q, qa, ctx } = start();
      door('free');
      q('.dr-color').dispatchEvent(ev('pointerdown'));
      const tile = qa('.dr-tile')[1]!;
      tile.dispatchEvent(ev('pointerup'));
      expect(qa('.dr-panel').length).toBe(1);
      expect(ctx.sequenced.at(-1)).not.toBe('Màu vàng.');
    });

    it('✅ keeps the sheet in the notebook, gives a star, cheers and starts a clean sheet', async () => {
      const { door, q, stroke, ctx } = start();
      door('free');
      const canvas = q('.dr-canvas');
      for (let i = 0; i < 3; i++)
        stroke(canvas, [
          [10 + i * 20, 10],
          [60, 80],
          [100, 40],
        ]);
      q('.dr-done').dispatchEvent(ev('pointerdown'));
      await flush();
      expect(ctx.stars).toBe(1);
      expect(ctx.celebrations).toBe(1);
      const book = parseBook(localStorage.getItem(STORAGE_KEY));
      expect(book.works.length).toBe(1);
      expect(book.works[0]?.mode).toBe('free');
      expect(book.made).toBe(1);
      // the sheet is clean again: leaving now keeps nothing more
      ctx.cleanup();
      live = null;
      expect(parseBook(localStorage.getItem(STORAGE_KEY)).works.length).toBe(1);
    });

    it('✅ on a nearly empty sheet does nothing wrong: no star, no page', async () => {
      const { door, q, stroke, ctx } = start();
      door('free');
      stroke(q('.dr-canvas'), [
        [10, 10],
        [30, 30],
      ]);
      q('.dr-done').dispatchEvent(ev('pointerdown'));
      await flush();
      expect(ctx.stars).toBe(0);
      expect(parseBook(localStorage.getItem(STORAGE_KEY)).works.length).toBe(0);
    });

    it('leaving the workshop keeps a sheet with enough on it, and drops a scribble', () => {
      const a = start();
      a.door('free');
      for (let i = 0; i < 4; i++)
        a.stroke(a.q('.dr-canvas'), [
          [10, 10 + i],
          [50, 50],
        ]);
      a.ctx.cleanup();
      live = null;
      expect(parseBook(localStorage.getItem(STORAGE_KEY)).works.length).toBe(1);
      const b = start();
      b.door('free');
      b.stroke(b.q('.dr-canvas'), [
        [10, 10],
        [50, 50],
      ]);
      b.ctx.cleanup();
      live = null;
      expect(parseBook(localStorage.getItem(STORAGE_KEY)).works.length).toBe(1);
    });

    it('stamping collects the sticker once, and a full set earns a star', async () => {
      const { door, q, qa, release, stroke, ctx } = start();
      door('free');
      const pets = THEMES[0]!;
      for (const item of pets.items) {
        q('.dr-stamp').dispatchEvent(ev('pointerdown'));
        release(qa('.dr-tile').find((t) => t.dataset.id === item.emoji)!);
        expect(ctx.sequenced.at(-1)).toMatch(/^[A-ZÀ-Ỹ]/);
        stroke(q('.dr-canvas'), [[50, 50]]);
        stroke(q('.dr-canvas'), [[60, 60]]);
      }
      await flush();
      expect(createGallery().collected()).toEqual(pets.items.map((i) => i.emoji));
      expect(ctx.stars).toBe(1);
      expect(ctx.celebrations).toBe(1);
      expect(createGallery().themesDone()).toEqual(['pets']);
    });
  });

  describe('Tô tranh', () => {
    it('opens a colouring page and the bucket fills it; the picture chooser shows photos first and locks later pictures', async () => {
      const { door, q, qa, release, ctx, stroke } = start();
      await ctx.photos.add([new Blob(['x'])]);
      door('colour');
      await flush();
      expect(q('.dr-bucket').classList.contains('selected')).toBe(true);
      expect(q('.dr-pictures').classList.contains('has-photos')).toBe(true);
      stroke(q('.dr-canvas'), [[100, 100]]);
      q('.dr-pictures').dispatchEvent(ev('pointerdown'));
      const tiles = qa('.dr-tile');
      expect(tiles[0]?.getAttribute('aria-label')).toBe('ảnh của nhà mình');
      expect(tiles.length).toBe(1 + PICTURES.length);
      expect(tiles.filter((t) => t.classList.contains('locked')).length).toBe(PICTURES.length - 8);
      release(tiles.find((t) => t.classList.contains('locked'))!);
      expect(qa('.dr-panel').length).toBe(1);
      release(tiles[2]!);
      expect(qa('.dr-panel').length).toBe(0);
      expect(ctx.sequenced.at(-2)).toBe('Tô.');
    });

    it('finishing a page saves it, then offers the next picture', async () => {
      const { door, q, stroke, ctx } = start();
      door('colour');
      const first = ctx.sequenced.at(-1);
      for (let i = 0; i < 3; i++) stroke(q('.dr-canvas'), [[100 + i * 30, 120]]);
      q('.dr-done').dispatchEvent(ev('pointerdown'));
      await flush();
      expect(ctx.stars).toBe(1);
      const book = parseBook(localStorage.getItem(STORAGE_KEY));
      expect(book.works[0]?.mode).toBe('colour');
      expect(book.works[0]?.title).toBeTruthy();
      expect(ctx.sequenced.at(-1)).not.toBe(first);
    });
  });

  describe('Tập vẽ', () => {
    it('has the three trace ways; tracing every stroke finishes the picture and puts it in the book', async () => {
      const { door, q, qa, ctx } = start();
      door('practice');
      expect(qa('.dr-way').length).toBe(3);
      const lead = ctx.sequenced.indexOf('Mình vẽ.');
      expect(lead).toBeGreaterThanOrEqual(0);
      const said = ctx.sequenced[lead + 1] ?? ''; // the name is a part of its own
      const field = q('.dr-practice');
      const shown = PICTURES.find((p) => said.toLowerCase().includes(p.name))!;
      expect(shown).toBeTruthy();
      const press = (type: string, p: { x: number; y: number }): void => {
        // no layout in jsdom: the field is 400 x 600, so the paper is fitPaper(400, 600, 1, 6) = 388 px at (6, 106)
        field.dispatchEvent(ev(type, 6 + p.x * 388, 106 + p.y * 388));
      };
      for (const s of [...shown.strokes].reverse()) {
        const pts = strokePath(s).pts;
        press('pointerdown', pts[0]!);
        for (const p of pts) press('pointermove', p);
        press('pointerup', pts.at(-1)!);
      }
      await flush(50);
      expect(ctx.sequenced.some((s) => s.includes('xong'))).toBe(true);
      expect(ctx.stars).toBe(1);
      const book = parseBook(localStorage.getItem(STORAGE_KEY));
      expect(book.works.length).toBe(1);
      expect(book.works[0]).toMatchObject({ mode: 'practice', title: shown.name });
      // next picture comes up, a different one
      expect(ctx.sequenced.at(-1)).not.toBe(said);
    });

    it('the three ways can be switched freely', () => {
      const { door, qa } = start();
      door('practice');
      for (const b of qa('.dr-way')) {
        b.dispatchEvent(ev('pointerdown'));
        expect(b.classList.contains('selected')).toBe(true);
      }
    });
  });

  describe('Vẽ theo mẫu', () => {
    it('lights the template where the child draws near it, ignores lines elsewhere, and finishes when the strokes are covered', async () => {
      const { door, q, ctx, stroke } = start();
      door('copy');
      const said = ctx.sequenced.at(-1)!;
      const shown = PICTURES.find((p) => said.toLowerCase().includes(p.name))!;
      expect(shown.id).toBe('sun');
      const canvas = q('.dr-canvas');
      // far from everything: just a line on the paper, nothing happens
      stroke(canvas, [
        [2, 2],
        [4, 4],
      ]);
      expect(ctx.stars).toBe(0);
      const W = 384;
      for (const s of shown.strokes) {
        const pts = makePath(sampleTrack(s.segs)).pts.map((p) => [p.x * W, p.y * W] as [number, number]);
        stroke(canvas, pts);
      }
      await flush(50);
      expect(ctx.stars).toBe(1);
      const book = parseBook(localStorage.getItem(STORAGE_KEY));
      expect(book.works[0]).toMatchObject({ mode: 'copy', title: shown.name });
    });
  });

  describe('Quyển vở', () => {
    function seeded(n: number): void {
      const g = createGallery();
      for (let i = 0; i < n; i++) g.add({ mode: 'free', thumb: `data:image/jpeg;base64,P${i}`, w: 100, h: 100, title: `tranh ${i}` });
    }

    it('is empty at first, then shows pages newest first with the mode on each', () => {
      const a = start();
      a.tap(a.q('.dr-door-book-tile'));
      expect(a.qa('.dr-thumb').length).toBe(0);
      expect(a.q('.dr-book-empty')).toBeTruthy();
      a.ctx.cleanup();
      live = null;
      seeded(3);
      const b = start();
      b.tap(b.q('.dr-door-book-tile'));
      const thumbs = b.qa('.dr-thumb');
      expect(thumbs.length).toBe(3);
      expect(thumbs[0]!.style.backgroundImage).toContain('P2');
    });

    it('flips with the arrows and by swiping, and speaks the title slowly', () => {
      seeded(3);
      const { tap, q, qa, release, ctx } = start();
      tap(q('.dr-door-book-tile'));
      release(qa('.dr-thumb')[0]!);
      expect(q<HTMLImageElement>('.dr-book-img').src).toContain('P2');
      expect(ctx.sequenced.at(-1)).toBe('Tranh 2.');
      tap(q('.dr-flip.next'));
      expect(q<HTMLImageElement>('.dr-book-img').src).toContain('P1');
      tap(q('.dr-flip.prev'));
      tap(q('.dr-flip.prev'));
      expect(q<HTMLImageElement>('.dr-book-img').src).toContain('P0');
      const page = q('.dr-book-page');
      page.dispatchEvent(ev('pointerdown', 200, 100));
      page.dispatchEvent(ev('pointerup', 100, 100));
      expect(q<HTMLImageElement>('.dr-book-img').src).toContain('P2');
    });

    it('pins a page as wallpaper and takes it off again', () => {
      seeded(2);
      const { tap, q, qa, release } = start();
      tap(q('.dr-door-book-tile'));
      release(qa('.dr-thumb')[0]!);
      tap(q('.dr-wall'));
      expect(createGallery().wallpaper()?.title).toBe('tranh 1');
      expect(q('.dr').classList.contains('has-wall')).toBe(true);
      expect(q('.dr').style.getPropertyValue('--dr-wall')).toContain('P1');
      tap(q('.dr-wall'));
      expect(createGallery().wallpaper()).toBeNull();
      expect(q('.dr').classList.contains('has-wall')).toBe(false);
    });

    it('deleting needs a grown-up long press: a quick tap keeps the page', async () => {
      seeded(2);
      const { tap, q, qa, release } = start();
      tap(q('.dr-door-book-tile'));
      release(qa('.dr-thumb')[0]!);
      tap(q('.dr-del'));
      const hold = q('.dr-del-hold');
      hold.dispatchEvent(ev('pointerdown'));
      await flush(300);
      hold.dispatchEvent(ev('pointerup'));
      await flush(2000);
      expect(createGallery().list().length).toBe(2);
      // "giữ lại" brings the page back
      tap(q('.dr-keep'));
      expect(document.querySelector('.dr-confirm')).toBeNull();
      expect(createGallery().list().length).toBe(2);
      // a real hold removes it
      tap(q('.dr-del'));
      q('.dr-del-hold').dispatchEvent(ev('pointerdown'));
      await flush(1700);
      expect(createGallery().list().length).toBe(1);
      expect(createGallery().made()).toBe(2);
    });

    it('the exhibition shows every picture in turn with applause, then returns to the shelf', async () => {
      seeded(3);
      const { tap, q, ctx } = start();
      const drum = vi.fn();
      ctx.audio.drum = drum;
      tap(q('.dr-door-book-tile'));
      tap(q('.dr-expo-btn'));
      const seen: string[] = [];
      for (let i = 0; i < 3; i++) {
        await flush(i === 0 ? 1000 : EXPO_MS);
        seen.push(q<HTMLImageElement>('.dr-expo-img').src);
      }
      expect(seen.map((s) => s.match(/P(\d)/)![1])).toEqual(['0', '1', '2']);
      expect(drum.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(drum).toHaveBeenCalledWith('clap');
      await flush(EXPO_MS + 2500);
      expect(document.querySelector('.dr-expo')).toBeNull();
      expect(document.querySelector('.dr-shelf')).not.toBeNull();
    });

    it('a finished picture announces what it unlocked', async () => {
      const { door, q, stroke } = start();
      door('free');
      for (let i = 0; i < 3; i++)
        stroke(q('.dr-canvas'), [
          [10 + i, 10],
          [80, 80],
        ]);
      q('.dr-done').dispatchEvent(ev('pointerdown'));
      await flush();
      expect(document.querySelector('.dr-toast')).not.toBeNull();
      await flush(3000);
      expect(document.querySelector('.dr-toast')).toBeNull();
    });
  });

  describe('Bộ sưu tập', () => {
    it('shows collected stickers in colour, the rest waiting, and locked sets locked', () => {
      const g = createGallery();
      g.collect('🐶');
      const { tap, q, qa } = start();
      tap(q('.dr-door-collection'));
      const slots = qa('.dr-slot');
      expect(slots.length).toBe(THEMES.length * 6);
      expect(slots[0]!.classList.contains('have')).toBe(true);
      expect(slots[1]!.classList.contains('have')).toBe(false);
      expect(qa('.dr-theme.locked').length).toBe(THEMES.length - 2);
    });
  });
});
