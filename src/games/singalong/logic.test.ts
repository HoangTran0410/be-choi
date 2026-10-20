import { describe, it, expect } from 'vitest';
import { hasLyrics } from '../../core/music';
import {
  CHOIR,
  choirSize,
  FANS,
  fanCount,
  FREE_SONGS,
  giftsBetween,
  HATS,
  nextGift,
  REPERTOIRE,
  songOpen,
  songUnlockAt,
  STAGES,
} from './catalog';
import { createProgress, freshProgress, readProgress, SAVE_KEY } from './progress';
import { createTracker, rateShow, THREE_STARS, TWO_STARS } from './show';
import { bandOf, createAutoStop, createOnset, heightOf, HOLD_LEVEL, HIT_LEVEL, stepTap } from './signal';
import { pacing, sentences } from './narrator';
import { beatMsOf, TEMPO, wordsOf, wordTiming } from './modes/lyrics';
import { answerLength, ENTRY_GAP_MS, planEntries, relativeRhythm, rhythmLength } from './modes/choir';
import { inRing, makeRing, nextRingY, RING_GOAL_S, RING_MAX_Y, RING_MIN_Y, stepRing } from './modes/ring';
import { beatOffsets } from './modes/perform';

function memory(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
    removeItem: () => {
      value = null;
    },
    read: () => value,
  };
}

describe('catalog', () => {
  it('opens a few songs at once and the rest one by one', () => {
    expect(songUnlockAt(0)).toBe(0);
    expect(songUnlockAt(FREE_SONGS - 1)).toBe(0);
    expect(songUnlockAt(FREE_SONGS)).toBeGreaterThan(0);
    const ats = REPERTOIRE.map((_, i) => songUnlockAt(i));
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });
  it('puts the songs with words first', () => {
    const n = REPERTOIRE.filter(hasLyrics).length;
    expect(n).toBeGreaterThan(0);
    expect(REPERTOIRE.slice(0, n).every(hasLyrics)).toBe(true);
    expect(REPERTOIRE.slice(n).some(hasLyrics)).toBe(false);
  });
  it('knows which songs are open', () => {
    const first = REPERTOIRE[0]!.id;
    const late = REPERTOIRE[REPERTOIRE.length - 1]!.id;
    expect(songOpen(first, 0)).toBe(true);
    expect(songOpen(late, 0)).toBe(false);
    expect(songOpen(late, 1000)).toBe(true);
    expect(songOpen('nope', 1000)).toBe(false);
  });
  it('starts with something to unlock at every step and runs out of nothing before the end', () => {
    expect(HATS[0]?.at).toBe(0);
    expect(STAGES[0]?.at).toBe(0);
    expect(CHOIR.filter((c) => c.at === 0).length).toBeGreaterThanOrEqual(2);
    expect(nextGift(0)).not.toBeNull();
    expect(nextGift(10000)).toBeNull();
  });
  it('seats more animals as tickets grow, never more than there are', () => {
    expect(fanCount(0)).toBeGreaterThanOrEqual(1);
    expect(fanCount(0)).toBeLessThanOrEqual(fanCount(40));
    expect(fanCount(100000)).toBe(FANS.length);
    expect(choirSize(0)).toBe(CHOIR.filter((c) => c.at === 0).length);
    expect(choirSize(100)).toBe(CHOIR.length);
  });
  it('lists exactly what a show opened', () => {
    expect(giftsBetween(0, 0)).toEqual([]);
    const hat = HATS.find((h) => h.at === 1)!;
    expect(giftsBetween(0, 1).map((g) => g.emoji)).toContain(hat.emoji);
    expect(giftsBetween(1, 1)).toEqual([]);
    // Every gift is announced once across any path of ticket counts.
    const all = giftsBetween(0, 100000);
    const stepwise = Array.from({ length: 60 }, (_, i) => giftsBetween(i, i + 1)).flat();
    expect(stepwise.length).toBeLessThanOrEqual(all.length);
    expect(giftsBetween(0, 100000).length).toBe(giftsBetween(0, 30).length + giftsBetween(30, 100000).length);
  });
});

describe('progress', () => {
  it('starts afresh and counts shows and tickets', () => {
    const p = createProgress(memory());
    expect(p.get()).toEqual(freshProgress());
    const r = p.addShow(2);
    expect(r).toMatchObject({ before: 0, after: 2 });
    expect(p.get().tickets).toBe(2);
    expect(p.get().shows).toBe(1);
  });
  it('keeps what the child earned and how the singer is dressed', () => {
    const store = memory();
    const a = createProgress(store);
    a.addShow(5);
    a.setHat('top');
    a.setFace('photo:abc');
    a.setStage('night');
    const b = createProgress(store);
    expect(b.get()).toMatchObject({ tickets: 5, shows: 1, hat: 'top', face: 'photo:abc', stage: 'night' });
    expect(JSON.parse(store.read() ?? '{}').v).toBe(1);
  });
  it('refuses a hat or stage that is not yet won', () => {
    const p = createProgress(memory());
    p.setHat('crown');
    p.setStage('space');
    expect(p.get().hat).toBe('none');
    expect(p.get().stage).toBe('theatre');
  });
  it('shrugs off a broken or foreign save', () => {
    expect(readProgress('nonsense')).toBeNull();
    expect(readProgress(JSON.stringify({ v: 99, tickets: 5 }))).toBeNull();
    const p = readProgress(JSON.stringify({ v: 1, tickets: -5, hat: 'crown', stage: 'space', face: 7 }));
    expect(p).toMatchObject({ tickets: 0, hat: 'none', stage: 'theatre' });
    expect(p?.face).toBe(freshProgress().face);
    expect(createProgress(memory('{{{')).get()).toEqual(freshProgress());
  });
  it('does not throw when storage refuses', () => {
    const angry = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
      removeItem: () => undefined,
    };
    const p = createProgress(angry);
    expect(() => p.addShow(3)).not.toThrow();
    expect(p.get().tickets).toBe(3);
    expect(SAVE_KEY).toContain('singalong');
  });
});

describe('the show', () => {
  const run = (activeFrames: number, quietFrames: number, bands: Array<0 | 1 | 2> = []) => {
    const t = createTracker();
    for (let i = 0; i < activeFrames; i++)
      t.feed({ active: true, onset: i % 5 === 0, band: bands[i % Math.max(1, bands.length)] ?? null }, 100);
    for (let i = 0; i < quietFrames; i++) t.feed({ active: false, onset: false, band: null }, 100);
    return t.stats();
  };
  it('always earns a star and a ticket, even for a child who only listened', () => {
    const r = rateShow(run(0, 100));
    expect(r.stars).toBe(1);
    expect(r.tickets).toBeGreaterThanOrEqual(1);
    expect(rateShow(run(0, 0)).stars).toBe(1);
  });
  it('gives more for more singing', () => {
    expect(rateShow(run(25, 75)).stars).toBe(2);
    expect(rateShow(run(60, 40)).stars).toBe(3);
    expect(TWO_STARS).toBeLessThan(THREE_STARS);
  });
  it('rewards a voice that goes both low and high, and a mode bonus, within limits', () => {
    const flat = rateShow(run(60, 40, [1]));
    const wide = rateShow(run(60, 40, [0, 2]));
    expect(wide.tickets).toBe(flat.tickets + 1);
    const t = createTracker();
    t.addBonus(50);
    expect(rateShow(t.stats()).tickets).toBe(1 + 2);
  });
  it('ignores a frame that claims an absurd length', () => {
    const t = createTracker();
    t.feed({ active: true, onset: false, band: null }, 60000);
    expect(t.stats().durationMs).toBeLessThanOrEqual(500);
  });
});

describe('signal', () => {
  it('sorts voices into low, middle and high', () => {
    expect(bandOf(null)).toBeNull();
    expect(bandOf(NaN)).toBeNull();
    expect(bandOf(200)).toBe(0);
    expect(bandOf(330)).toBe(1);
    expect(bandOf(600)).toBe(2);
  });
  it('measures height on a musical scale', () => {
    expect(heightOf(null)).toBeNull();
    expect(heightOf(100)).toBe(0);
    expect(heightOf(2000)).toBe(1);
    // An octave is the same distance whether it is low or high.
    expect((heightOf(400) ?? 0) - (heightOf(200) ?? 0)).toBeCloseTo((heightOf(600) ?? 0) - (heightOf(300) ?? 0), 5);
    expect(heightOf(220)).toBeLessThan(heightOf(440) ?? 0);
  });
  it('sees one hit per sound, not one per frame', () => {
    const on = createOnset();
    const hits = [0, 0.6, 0.6, 0.6, 0, 0, 0, 0.7, 0.7].map((l) => on.step(l, 100)).filter(Boolean);
    expect(hits.length).toBe(2);
  });
  it('holds a finger steadily and lets it fade', () => {
    let l = HIT_LEVEL;
    for (let i = 0; i < 20; i++) l = stepTap(l, true, 33);
    expect(l).toBe(HOLD_LEVEL);
    for (let i = 0; i < 20; i++) l = stepTap(l, false, 33);
    expect(l).toBe(0);
  });
  it('stops a recording once the singing has stopped', () => {
    const s = createAutoStop({ silenceMs: 1000, minVoiceMs: 300, startTimeoutMs: 3000, maxMs: 8000 });
    let state = s.feed(0, 100);
    expect(state).toBe('waiting');
    for (let i = 0; i < 5; i++) state = s.feed(0.5, 100);
    expect(state).toBe('voice');
    for (let i = 0; i < 9; i++) state = s.feed(0, 100);
    expect(state).toBe('voice');
    state = s.feed(0, 200);
    expect(state).toBe('done');
    expect(s.feed(0.9, 100)).toBe('done');
  });
  it('gives up gently when nothing is sung, and ignores a cough', () => {
    const quiet = createAutoStop({ startTimeoutMs: 2000 });
    let state = quiet.feed(0, 100);
    for (let i = 0; i < 25; i++) state = quiet.feed(0, 100);
    expect(state).toBe('gaveup');
    const cough = createAutoStop({ startTimeoutMs: 2000, minVoiceMs: 300 });
    cough.feed(0.9, 100);
    let s2 = cough.feed(0, 100);
    for (let i = 0; i < 25; i++) s2 = cough.feed(0, 100);
    expect(s2).toBe('gaveup');
  });
  it('stops a recording at the longest allowed', () => {
    const s = createAutoStop({ maxMs: 2000, minVoiceMs: 100 });
    let state = s.feed(0.5, 100);
    for (let i = 0; i < 25; i++) state = s.feed(0.5, 100);
    expect(state).toBe('done');
  });
});

describe('narrator', () => {
  it('splits a speech into short sentences and keeps the marks', () => {
    expect(sentences('Chọn một bài. Bé hát nhé!')).toEqual(['Chọn một bài.', 'Bé hát nhé!']);
    expect(sentences('')).toEqual([]);
    expect(sentences('Không có dấu chấm')).toEqual(['Không có dấu chấm']);
  });
  it('leaves a longer pause after a longer sentence', () => {
    expect(pacing('Hát nào')).toBeLessThan(pacing('Bé hát thật to cho cả nhà nghe nhé'));
    expect(pacing('')).toBeGreaterThan(0);
  });
});

describe('lyrics timing', () => {
  it('lights the words evenly across the line', () => {
    const t = wordTiming('Kìa con bướm vàng', 4, 500);
    expect(t.words).toEqual(['Kìa', 'con', 'bướm', 'vàng']);
    expect(t.perMs).toBe(Math.round((4 * 500 * 0.85) / 4));
    expect(wordTiming('', 4, 500)).toEqual({ words: [], perMs: 0 });
    expect(wordsOf('  a   b ')).toEqual(['a', 'b']);
  });
  it('sings slower than the written tempo', () => {
    expect(beatMsOf(100)).toBeGreaterThan(600);
    expect(beatMsOf(100)).toBeCloseTo(600 / TEMPO, 5);
    expect(Number.isFinite(beatMsOf(0))).toBe(true);
  });
});

describe('choir plan', () => {
  it('brings the animals in one after another', () => {
    const e = planEntries(3);
    expect(e.map((x) => x.startMs)).toEqual([0, ENTRY_GAP_MS, 2 * ENTRY_GAP_MS]);
    expect(planEntries(0)).toEqual([]);
  });
  it('turns taps into a rhythm from the first hit', () => {
    expect(relativeRhythm([1200, 1500, 2100])).toEqual([0, 300, 900]);
    expect(relativeRhythm([])).toEqual([]);
  });
  it('lasts as long as the slowest animal needs', () => {
    const entries = planEntries(2);
    const len = answerLength(entries, 2000, [1.5, 0.5]);
    expect(len).toBe(ENTRY_GAP_MS + 4000);
    expect(rhythmLength(entries, [0, 300, 900], 500)).toBe(ENTRY_GAP_MS + 900 + 500);
    expect(rhythmLength([], [], 500)).toBe(500);
  });
});

describe('the bird ring', () => {
  it('fills while the bird is inside and drains slower while outside', () => {
    const ring = makeRing(0.4);
    expect(inRing(ring, 0.45)).toBe(true);
    expect(inRing(ring, 0.8)).toBe(false);
    stepRing(ring, 0.4, 1);
    expect(ring.held).toBe(1);
    stepRing(ring, 0.9, 1);
    expect(ring.held).toBeGreaterThan(0.5);
    expect(ring.held).toBeLessThan(1);
    stepRing(ring, 0.9, 100);
    expect(ring.held).toBe(0);
  });
  it('completes after enough time and moves somewhere else', () => {
    const ring = makeRing(0.4);
    let done = false;
    for (let i = 0; i < 100 && !done; i++) done = stepRing(ring, 0.4, 0.1, () => 0.99).completed;
    expect(done).toBe(true);
    expect(ring.done).toBe(1);
    expect(ring.held).toBe(0);
    expect(Math.abs(ring.y - 0.4)).toBeGreaterThanOrEqual(0.15);
    expect(RING_GOAL_S).toBeGreaterThan(1);
  });
  it('always picks a height inside the sky, far enough from the last', () => {
    for (const prev of [RING_MIN_Y, 0.4, RING_MAX_Y]) {
      for (const r of [0, 0.3, 0.5, 0.99]) {
        const y = nextRingY(prev, () => r);
        expect(y).toBeGreaterThanOrEqual(RING_MIN_Y - 0.2);
        expect(y).toBeLessThanOrEqual(RING_MAX_Y + 0.2);
        expect(Math.abs(y - prev)).toBeGreaterThanOrEqual(0.15);
      }
    }
  });
});

describe('the band', () => {
  it('finds the beats inside a note', () => {
    expect(beatOffsets(0, 2, 500)).toEqual([
      { beat: 0, atMs: 0 },
      { beat: 1, atMs: 500 },
    ]);
    expect(beatOffsets(0.5, 1, 500)).toEqual([{ beat: 1, atMs: 250 }]);
    expect(beatOffsets(0.25, 0.5, 500)).toEqual([]);
    expect(beatOffsets(2, 0.5, 500)).toEqual([{ beat: 2, atMs: 0 }]);
  });
});
