import { describe, it, expect } from 'vitest';
import { findSong } from '../../core/music';
import { INSTRUMENTS } from '../show/logic';
import {
  BAND_INSTS,
  BAND_SONGS,
  buildPart,
  chordsPerBar,
  dueSteps,
  emptySlots,
  loopSteps,
  placeAt,
  quantize,
  SLOTS,
  songOf,
  STEPS_PER_BAR,
  stepMs,
  toggleOnStage,
} from './logic';

describe('kidsband arrangement', () => {
  it('gives every shelf instrument a band part', () => {
    expect(BAND_INSTS.map((b) => b.id).sort()).toEqual(INSTRUMENTS.map((i) => i.id).sort());
  });
  it('uses real songs and loops whole bars', () => {
    for (const id of BAND_SONGS) {
      expect(findSong(id)).toBeTruthy();
      expect(loopSteps(songOf(id)) % STEPS_PER_BAR).toBe(0);
    }
  });
  it('quantizes the melody onto the eighth-note grid without overlapping its own start', () => {
    const q = quantize(songOf('twinkle'));
    expect(q[0]).toEqual({ at: 0, steps: 2, name: 'C4' });
    expect(q[6]).toEqual({ at: 12, steps: 4, name: 'G4' });
    for (const id of BAND_SONGS) for (const n of quantize(songOf(id))) expect(n.steps).toBeGreaterThanOrEqual(1);
  });
  it('harmonises each bar and starts and ends on C', () => {
    for (const id of BAND_SONGS) {
      const cs = chordsPerBar(songOf(id));
      expect(cs.length).toBe(loopSteps(songOf(id)) / STEPS_PER_BAR);
      expect(cs[0]?.root).toBe('C');
      expect(cs.at(-1)?.root).toBe('C');
    }
    // Twinkle: bar 3 "F F E E" sits on F, bar 5 "G G F F" on G.
    const tw = chordsPerBar(songOf('twinkle'));
    expect(tw[2]?.root).toBe('F');
    expect(tw[4]?.root).toBe('G');
  });
  it('builds a part for every instrument and every song: right length, something to play, notes in range', () => {
    for (const id of BAND_SONGS) {
      const song = songOf(id);
      for (const inst of BAND_INSTS) {
        const part = buildPart(song, inst);
        expect(part.length).toBe(loopSteps(song));
        const events = part.flat();
        expect(events.length).toBeGreaterThan(3);
        for (const e of events) {
          if (e.kind === 'note') {
            expect(e.freq).toBeGreaterThan(80);
            expect(e.freq).toBeLessThan(2500);
            expect(e.steps).toBeGreaterThan(0);
          }
        }
      }
    }
  });
  it('the drum plays drums only and the melody plays the tune notes', () => {
    const song = songOf('butterfly');
    const drum = buildPart(song, BAND_INSTS.find((b) => b.id === 'drum')!).flat();
    expect(drum.every((e) => e.kind === 'drum')).toBe(true);
    const mel = buildPart(song, BAND_INSTS.find((b) => b.id === 'xylo')!).flat();
    expect(mel.length).toBe(quantize(song).length);
  });
  it('steps are eighths at the song tempo', () => {
    expect(stepMs({ ...songOf('twinkle'), bpm: 120 })).toBe(250);
  });
  it('schedules only steps inside the lookahead, once each', () => {
    expect(dueSteps(1000, 1000, 150, 100, 0).map((s) => s.step)).toEqual([0, 1]);
    expect(dueSteps(1000, 1000, 150, 100, 2)).toEqual([]);
    expect(dueSteps(1000, 1200, 150, 100, 2).map((s) => s.atMs)).toEqual([1200, 1300]);
  });
});

describe('kidsband stage', () => {
  it('adds to the first free place, removes on a second tap, and says when full', () => {
    let s = emptySlots();
    expect(s.length).toBe(SLOTS);
    let r = toggleOnStage(s, 'piano');
    expect(r.result).toBe('added');
    expect(r.slots[0]).toBe('piano');
    s = r.slots;
    s = toggleOnStage(s, 'drum').slots;
    s = toggleOnStage(s, 'harp').slots;
    s = toggleOnStage(s, 'flute').slots;
    expect(toggleOnStage(s, 'xylo').result).toBe('full');
    r = toggleOnStage(s, 'drum');
    expect(r.result).toBe('removed');
    expect(r.slots[1]).toBeNull();
    expect(toggleOnStage(r.slots, 'xylo').slots[1]).toBe('xylo');
  });
  it('dropping on a place moves, swaps or replaces', () => {
    const s = ['piano', 'drum', null, null] as const;
    expect(placeAt(s, 'piano', 2)).toEqual([null, 'drum', 'piano', null]);
    expect(placeAt(s, 'piano', 1)).toEqual(['drum', 'piano', null, null]);
    expect(placeAt(s, 'harp', 3)).toEqual(['piano', 'drum', null, 'harp']);
    expect(placeAt(s, 'harp', 0)).toEqual(['harp', 'drum', null, null]);
    expect(placeAt(s, 'piano', 0)).toEqual([...s]);
    expect(placeAt(s, 'harp', 9)).toEqual([...s]);
  });
});
