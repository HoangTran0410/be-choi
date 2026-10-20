import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findSong } from '../../core/music';
import { fakeContext } from '../../core/testing';
import { CAT_COUNT, SAVE_KEY, SONG_UNLOCKS, catHz, chordCats, songSteps, STYLES, type SongStep } from './logic';
import game from './index';

type Ctx = ReturnType<typeof fakeContext>;

function down(el: Element | null): void {
  if (!el) throw new Error('missing element');
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}
const cell = (ctx: Ctx, i: number) => ctx.stage.querySelector<HTMLElement>(`.cb-cell[data-cat="${i}"]`);
const mode = (ctx: Ctx, m: string) => ctx.stage.querySelector<HTMLElement>(`.cb-btn[data-mode="${m}"]`);
const styleBtn = (ctx: Ctx, s: string) => ctx.stage.querySelector<HTMLElement>(`.cb-btn[data-style="${s}"]`);
const songBtn = (ctx: Ctx, id: string) => ctx.stage.querySelector<HTMLElement>(`.cb-song[data-song="${id}"]`);
const lit = (ctx: Ctx) => [...ctx.stage.querySelectorAll('.cb-cell')].findIndex((c) => c.classList.contains('cb-lit'));

function setup() {
  const ctx = fakeContext();
  const pitched = vi.fn();
  const drum = vi.fn();
  const note = vi.fn();
  ctx.audio.pitched = pitched;
  ctx.audio.drum = drum;
  ctx.audio.note = note;
  let stars = 0;
  ctx.addStar = () => {
    stars++;
  };
  game.start(ctx);
  return { ctx, pitched, drum, note, stars: () => stars };
}

describe('catband game', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    // The tap helper reads performance.now(), which fake timers leave alone here.
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('puts eight different cats on the stage, each drawn with a face', () => {
    const { ctx } = setup();
    const cells = ctx.stage.querySelectorAll('.cb-cell');
    expect(cells.length).toBe(CAT_COUNT);
    const drawings = new Set([...ctx.stage.querySelectorAll('.cb-cat')].map((c) => c.innerHTML));
    expect(drawings.size).toBe(CAT_COUNT);
    for (const svg of ctx.stage.querySelectorAll('.cb-cat svg')) {
      expect(svg.querySelector('.cb-mouth-open')).not.toBeNull();
      expect(svg.querySelector('.cb-eyes-open')).not.toBeNull();
    }
    ctx.cleanup();
  });

  it('a touched cat meows its own note and opens its mouth; bigger cats sing lower', () => {
    const { ctx, pitched } = setup();
    for (let i = 0; i < CAT_COUNT; i++) {
      down(cell(ctx, i));
      expect(pitched).toHaveBeenLastCalledWith('meow', catHz(i), undefined);
      expect(cell(ctx, i)!.classList.contains('cb-sing')).toBe(true);
      vi.advanceTimersByTime(600);
      expect(cell(ctx, i)!.classList.contains('cb-sing')).toBe(false);
    }
    const hz = pitched.mock.calls.map((c) => c[1] as number);
    for (let i = 1; i < hz.length; i++) expect(hz[i]!).toBeGreaterThan(hz[i - 1]!);
    const sizes = [...ctx.stage.querySelectorAll<HTMLElement>('.cb-cat')].map((c) => Number(c.style.getPropertyValue('--s')));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
    ctx.cleanup();
  });

  it('starts the band on the first touch, and the style buttons change it', () => {
    const { ctx, drum, note } = setup();
    expect(drum).not.toHaveBeenCalled();
    down(cell(ctx, 0));
    vi.advanceTimersByTime(2200);
    expect(drum).toHaveBeenCalled();
    expect(note).toHaveBeenCalled();
    expect(styleBtn(ctx, 'vui')!.classList.contains('cb-on')).toBe(true);
    down(styleBtn(ctx, 'rock'));
    vi.advanceTimersByTime(60);
    expect(styleBtn(ctx, 'rock')!.classList.contains('cb-on')).toBe(true);
    expect(styleBtn(ctx, 'vui')!.classList.contains('cb-on')).toBe(false);
    drum.mockClear();
    vi.advanceTimersByTime(2000);
    expect(drum.mock.calls.some((c) => c[0] === 'snare')).toBe(true);
    // Stopping the band stops the sound.
    down(ctx.stage.querySelector('.cb-stop'));
    drum.mockClear();
    vi.advanceTimersByTime(300);
    drum.mockClear();
    vi.advanceTimersByTime(5000);
    expect(drum).not.toHaveBeenCalled();
    expect(STYLES.length).toBe(3);
    ctx.cleanup();
  });

  it('when the child stops, the cats sing along on notes of the chord; a touch joins in', () => {
    const { ctx, pitched } = setup();
    down(cell(ctx, 4));
    pitched.mockClear();
    vi.advanceTimersByTime(5000);
    expect(pitched).not.toHaveBeenCalled();
    // Idle for a while: a few cats start singing by themselves, softly.
    vi.advanceTimersByTime(4000 + 8000);
    const sung = pitched.mock.calls.filter((c) => c[2] && (c[2] as { gain: number }).gain < 1);
    expect(sung.length).toBeGreaterThan(2);
    const allowed = new Set<number>();
    for (const chord of ['C', 'F', 'G', 'Am'] as const) for (const c of chordCats(chord)) allowed.add(Math.round(catHz(c)));
    for (const call of sung) expect(allowed.has(Math.round(call[1] as number))).toBe(true);
    ctx.cleanup();
  });

  it('shows the song list with locked songs and does not open them', () => {
    const { ctx } = setup();
    down(mode(ctx, 'song'));
    const picker = ctx.stage.querySelector<HTMLElement>('.cb-picker')!;
    expect(picker.hidden).toBe(false);
    const buttons = picker.querySelectorAll('.cb-song');
    expect(buttons.length).toBe(SONG_UNLOCKS.length + 1); // + Nhớ giai điệu
    expect(picker.querySelectorAll('.cb-locked').length).toBe(SONG_UNLOCKS.filter((s) => s.need > 0).length);
    ctx.sequenced.length = 0;
    down(songBtn(ctx, 'birthday'));
    expect(picker.hidden).toBe(false);
    expect(lit(ctx)).toBe(-1);
    expect(ctx.sequenced).toEqual([]); // choosing a song is silent: the music is the point
    ctx.cleanup();
  });

  function playThrough(ctx: Ctx, steps: readonly SongStep[]): void {
    steps.forEach((s) => {
      expect(lit(ctx)).toBe(s.cat);
      // A wrong cat never matters.
      let wrong = (s.cat + 3) % CAT_COUNT;
      while (wrong === s.cat) wrong = (wrong + 1) % CAT_COUNT;
      vi.advanceTimersByTime(300);
      down(cell(ctx, wrong));
      expect(lit(ctx)).toBe(s.cat);
      down(cell(ctx, s.cat));
      vi.advanceTimersByTime(300);
    });
  }

  it('Twinkle: lights the cats one by one, waits for wrong touches, then the band sings it and a star is given', () => {
    const { ctx, pitched, stars } = setup();
    down(mode(ctx, 'song'));
    down(songBtn(ctx, 'twinkle'));
    const steps = songSteps(findSong('twinkle')!);
    expect(lit(ctx)).toBe(steps[0]!.cat);
    // A wrong touch changes nothing about the light.
    down(cell(ctx, 5));
    expect(lit(ctx)).toBe(steps[0]!.cat);
    expect(pitched).toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    playThrough(ctx, steps);
    expect(lit(ctx)).toBe(-1);
    expect(stars()).toBe(0);
    pitched.mockClear();
    // The whole tune now plays by itself.
    vi.advanceTimersByTime(60_000);
    expect(pitched.mock.calls.length).toBeGreaterThanOrEqual(steps.length);
    expect(stars()).toBe(1);
    expect(ctx.celebrations).toBe(1);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}')).toEqual({ stars: 1, faces: {}, v: 2 });
    // A new cat has arrived, and the song list is back.
    expect(ctx.sequenced.some((t) => t.startsWith('Mèo mới'))).toBe(true);
    vi.advanceTimersByTime(8000);
    expect(ctx.stage.querySelector<HTMLElement>('.cb-picker')!.hidden).toBe(false);
    expect(songBtn(ctx, 'row')!.classList.contains('cb-locked')).toBe(false);
    ctx.cleanup();
  });

  it('can wander off mid-song and back to free play without a star', () => {
    const { ctx, stars } = setup();
    down(mode(ctx, 'song'));
    down(songBtn(ctx, 'lamb'));
    expect(lit(ctx)).toBeGreaterThanOrEqual(0);
    vi.advanceTimersByTime(400);
    down(mode(ctx, 'free'));
    expect(lit(ctx)).toBe(-1);
    vi.advanceTimersByTime(30_000);
    expect(stars()).toBe(0);
    ctx.cleanup();
  });

  it('remembers the stars: a returning child has the new cats and songs', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, stars: 3 }));
    const { ctx } = setup();
    const names = [...ctx.stage.querySelectorAll('.cb-cell')].map((c) => c.getAttribute('aria-label'));
    expect(names).toContain('Mèo cam');
    expect(names).toContain('Mèo tam thể');
    down(mode(ctx, 'song'));
    expect(songBtn(ctx, 'bridge')!.classList.contains('cb-locked')).toBe(false);
    expect(songBtn(ctx, 'birthday')!.classList.contains('cb-locked')).toBe(true);
    ctx.cleanup();
  });

  it('counting the cats sings the scale upward and says nothing', () => {
    const { ctx, pitched } = setup();
    vi.advanceTimersByTime(1000); // past the welcome
    ctx.sequenced.length = 0;
    down(mode(ctx, 'scale'));
    vi.advanceTimersByTime(8 * 720 + 1500);
    const hz = pitched.mock.calls.map((c) => c[1] as number);
    expect(hz.length).toBe(CAT_COUNT);
    for (let i = 1; i < hz.length; i++) expect(hz[i]!).toBeGreaterThan(hz[i - 1]!);
    expect(ctx.sequenced).toEqual([]);
    ctx.cleanup();
  });

  it('is silent while the child plays: no name, no number, no style or mode announcement', () => {
    const { ctx } = setup();
    vi.advanceTimersByTime(3000);
    ctx.sequenced.length = 0;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < CAT_COUNT; i++) {
        down(cell(ctx, i));
        vi.advanceTimersByTime(700);
      }
    }
    for (const s of STYLES) {
      down(styleBtn(ctx, s.id));
      vi.advanceTimersByTime(300);
    }
    down(mode(ctx, 'song'));
    down(songBtn(ctx, 'twinkle'));
    vi.advanceTimersByTime(4000); // under the idle time: the child is still busy
    down(mode(ctx, 'free'));
    down(mode(ctx, 'scale'));
    vi.advanceTimersByTime(5000);
    expect(ctx.sequenced).toEqual([]);
    ctx.cleanup();
  });

  it('reminds a child who sits still, a few words at a time, and only then', () => {
    const { ctx } = setup();
    vi.advanceTimersByTime(3000);
    ctx.sequenced.length = 0;
    vi.advanceTimersByTime(30_000); // nobody touched a cat
    expect(ctx.sequenced.length).toBeGreaterThanOrEqual(1);
    expect(ctx.sequenced.every((t) => t.length < 40)).toBe(true);
    ctx.sequenced.length = 0;
    down(cell(ctx, 0));
    vi.advanceTimersByTime(1000);
    expect(ctx.sequenced).toEqual([]); // a touch is not answered with words
    ctx.cleanup();
  });

  it('welcomes every visit with one short line, a longer one for a child who has played', () => {
    const first = setup();
    vi.advanceTimersByTime(2000);
    expect(first.ctx.sequenced).toEqual(['Chạm vào mèo nhé.']);
    first.ctx.cleanup();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, stars: 1, faces: {} }));
    const back = setup();
    vi.advanceTimersByTime(2000);
    expect(back.ctx.sequenced).toEqual(['Chào bé!', 'Chạm vào mèo để mèo hát nhé.']);
    back.ctx.cleanup();
  });

  it('leaves nothing running when the child leaves', () => {
    const before = vi.getTimerCount();
    const { ctx } = setup();
    down(cell(ctx, 0));
    down(mode(ctx, 'song'));
    down(songBtn(ctx, 'twinkle'));
    vi.advanceTimersByTime(3000);
    ctx.cleanup();
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
  });

  it('puts a family photo on the chosen cat as its face, and keeps it', async () => {
    const photo = { id: 'p1', url: 'data:image/jpeg;base64,AAAA', createdAt: 0 };
    const ctx = fakeContext();
    ctx.photos = {
      list: () => Promise.resolve([photo]),
      add: () => Promise.resolve([photo]),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      onChange: () => () => undefined,
    };
    const pitched = vi.fn();
    ctx.audio.pitched = pitched;
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(10);
    const btn = ctx.stage.querySelector<HTMLElement>('[data-act="face"]')!;
    expect(btn.hidden).toBe(false);
    down(btn);
    const tile = document.querySelector<HTMLElement>('.pp-tile[data-id="p1"]')!;
    tile.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(ctx.stage.textContent).toContain('Chạm vào mèo muốn đeo');
    down(cell(ctx, 3));
    expect(cell(ctx, 3)!.querySelector('.cb-face[data-photo="p1"]')).not.toBeNull();
    expect(pitched).toHaveBeenLastCalledWith('meow', catHz(3), undefined);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}').faces).toEqual({ '3': 'p1' });
    ctx.cleanup();
    // Next visit it is still there.
    const ctx2 = fakeContext();
    ctx2.photos = ctx.photos;
    game.start(ctx2);
    await vi.advanceTimersByTimeAsync(10);
    expect(cell(ctx2, 3)!.querySelector('.cb-face')).not.toBeNull();
    ctx2.cleanup();
  });

  it('without photos there is no photo button and the cats keep their faces', () => {
    const { ctx } = setup();
    expect(ctx.stage.querySelector<HTMLElement>('[data-act="face"]')!.hidden).toBe(true);
    expect(ctx.stage.querySelector('.cb-face')).toBeNull();
    ctx.cleanup();
  });

  it('Nhớ giai điệu: the cats sing a phrase, a wrong cat only makes them sing it again, three rounds earn a star', () => {
    const { ctx, pitched, stars } = setup();
    // Fixed phrases, so the test knows what to tap.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    down(mode(ctx, 'song'));
    down(songBtn(ctx, 'memory'));
    pitched.mockClear();
    vi.advanceTimersByTime(1800 + 5 * 760);
    const heard = pitched.mock.calls.map((c) => c[1] as number);
    expect(heard.length).toBe(2);
    const cats = heard.map((hz) => Array.from({ length: CAT_COUNT }, (_, i) => i).find((i) => Math.abs(catHz(i) - hz) < 0.5)!);
    // Wrong first: nothing is lost, the phrase comes again.
    const wrong = (cats[0]! + 1) % CAT_COUNT;
    down(cell(ctx, wrong));
    pitched.mockClear();
    vi.advanceTimersByTime(700 + 400 + 3 * 760 + 200);
    expect(pitched.mock.calls.length).toBe(2);
    expect(stars()).toBe(0);
    vi.advanceTimersByTime(300);
    for (const c of cats) {
      down(cell(ctx, c));
      vi.advanceTimersByTime(100);
    }
    expect(ctx.stage.textContent).toContain('Nghe tiếp');
    rnd.mockRestore();
    ctx.cleanup();
    expect(stars()).toBe(0);
  });
});
