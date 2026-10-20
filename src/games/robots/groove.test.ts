import { describe, it, expect, vi } from 'vitest';
import {
  BARS,
  BAND_GAIN,
  SONGS,
  chordTones,
  extOf,
  swingOffset,
  voicingOf,
  STEPS_PER_BAR,
  chordPcs,
  createGroove,
  findSong,
  midiFreq,
  parseBars,
  pitchOf,
  safePcs,
  scalePcs,
  stepMs,
  type GrooveDeps,
  type SongId,
  type Player,
  type StepEvent,
} from './groove';

const song = (id: SongId) => findSong(id);

describe('harmony', () => {
  it('builds the chords and scales of each song', () => {
    expect(chordPcs({ root: 0, quality: 'maj' })).toEqual([0, 4, 7]);
    expect(chordPcs({ root: 9, quality: 'min' })).toEqual([9, 0, 4]);
    expect(scalePcs(song('fun'))).toEqual([0, 2, 4, 7, 9]);
    expect(scalePcs(song('disco'))).toEqual([2, 4, 6, 9, 11]);
    expect(scalePcs(song('calm'))).toEqual([5, 7, 9, 0, 2]);
  });

  it('reads chord tones, scale degrees and bass notes as MIDI notes', () => {
    const fun = song('fun');
    const chordTone = (bar: number, i: number, oct = 0) => pitchOf(fun, bar, { k: 'chord', i, oct });
    // C, Am, F, G
    expect([0, 1, 2, 3].map((i) => chordTone(0, i))).toEqual([60, 64, 67, 72]);
    expect([0, 1, 2].map((i) => chordTone(1, i))).toEqual([57, 60, 64]);
    expect([0, 1, 2].map((i) => chordTone(2, i))).toEqual([65, 69, 72]);
    expect([0, 1, 2].map((i) => chordTone(3, i))).toEqual([55, 59, 62]);
    expect(chordTone(0, 0, 1)).toBe(72);
    expect([0, 1, 2, 3, 4, 5].map((d) => pitchOf(fun, 0, { k: 'scale', d, oct: 0 }))).toEqual([60, 62, 64, 67, 69, 72]);
    expect(pitchOf(fun, 0, { k: 'scale', d: -1, oct: 0 })).toBe(57);
    expect(pitchOf(fun, 0, { k: 'bass', n: 0, oct: 0 })).toBe(48);
    expect(pitchOf(fun, 0, { k: 'bass', n: 1, oct: 0 })).toBe(55);
    expect(pitchOf(fun, 0, { k: 'bass', n: 2, oct: 0 })).toBe(60);
    // The loop repeats: bar 4 is bar 0 again.
    expect(pitchOf(fun, 4, { k: 'chord', i: 0, oct: 0 })).toBe(60);
  });

  it('keeps bass low and chords in the middle for every song and bar', () => {
    for (const s of SONGS) {
      for (let bar = 0; bar < BARS; bar++) {
        for (const n of [0, 1, 2] as const) {
          const m = pitchOf(s, bar, { k: 'bass', n, oct: 0 });
          expect(m).toBeGreaterThanOrEqual(40);
          expect(m).toBeLessThanOrEqual(63);
        }
        for (let i = 0; i < 3; i++) {
          const m = pitchOf(s, bar, { k: 'chord', i, oct: 0 });
          expect(m).toBeGreaterThanOrEqual(55);
          expect(m).toBeLessThanOrEqual(73);
        }
      }
    }
  });

  it('safePcs is the chord plus the pentatonic scale, and always has the chord in it', () => {
    for (const s of SONGS) {
      for (let bar = 0; bar < BARS; bar++) {
        const safe = safePcs(s, bar);
        for (const pc of chordPcs(s.chords[bar]!)) expect(safe.has(pc)).toBe(true);
        for (const pc of scalePcs(s)) expect(safe.has(pc)).toBe(true);
      }
    }
  });

  it('A4 is 440 Hz', () => {
    expect(midiFreq(69)).toBe(440);
    expect(midiFreq(60)).toBeCloseTo(261.63, 2);
  });

  it('has five different songs: tempo, key, chords and drum feel all differ', () => {
    expect(SONGS.map((s) => s.id)).toEqual(['fun', 'disco', 'calm', 'latin', 'east']);
    expect(new Set(SONGS.map((s) => s.bpm)).size).toBe(5);
    expect(new Set(SONGS.map((s) => s.tonic)).size).toBe(5);
    expect(new Set(SONGS.map((s) => s.style)).size).toBe(5);
    expect(new Set(SONGS.map((s) => s.icon)).size).toBe(5);
    expect(new Set(SONGS.map((s) => s.chords.map((c) => `${(c.root - s.tonic + 12) % 12}${c.quality}`).join())).size).toBe(5);
    expect(Math.min(...SONGS.map((s) => s.bpm))).toBeGreaterThanOrEqual(70);
    expect(Math.max(...SONGS.map((s) => s.bpm))).toBeLessThanOrEqual(130);
    for (const s of SONGS) {
      expect(s.chords.length).toBe(BARS);
      expect(s.swing).toBeGreaterThanOrEqual(0);
      expect(s.swing).toBeLessThanOrEqual(0.67);
    }
  });

  it('every chord has a colour tone (a seventh or sixth) that suits it', () => {
    for (const s of SONGS) {
      for (const c of s.chords) {
        const ext = extOf(c);
        expect([9, 10, 11]).toContain(ext);
        expect(chordTones(c)).toHaveLength(4);
        expect(new Set(chordTones(c)).size).toBe(4);
      }
    }
    // Dominant seventh on G in the pop loop: F natural; major seventh on C: B.
    expect(chordTones(song('fun').chords[3]!)).toEqual([7, 11, 2, 5]);
    expect(chordTones(song('fun').chords[0]!)).toEqual([0, 4, 7, 11]);
    // The sus-2 chord replaces the third with the second.
    expect(chordPcs({ root: 2, quality: 'sus' })).toEqual([2, 4, 9]);
  });

  it('reads the colour tone and the third and colour tone in the bass', () => {
    const fun = song('fun');
    expect(pitchOf(fun, 0, { k: 'ext', oct: 0 })).toBe(71); // B over C
    expect(pitchOf(fun, 3, { k: 'ext', oct: 0 })).toBe(65); // F over G
    expect(pitchOf(fun, 0, { k: 'bass', n: 3, oct: 0 })).toBe(52); // E
    expect(pitchOf(fun, 0, { k: 'bass', n: 4, oct: 0 })).toBe(59); // B
    expect(pitchOf(fun, 1, { k: 'bass', n: 3, oct: 0 })).toBe(48); // C over A minor
  });
});

describe('parseBars', () => {
  it('reads drums, chord tones, scale notes, bass notes, triads, lengths and octaves', () => {
    const [bar] = parseBars('0K 4S 8c2:4^ 10s-1:2_ 12b1:3 14t:2');
    expect(bar!.map((h) => h.s)).toEqual([0, 4, 8, 10, 12, 14, 14, 14]);
    expect(bar![0]).toEqual({ s: 0, d: 1, drum: 'kick' });
    expect(bar![1]).toEqual({ s: 4, d: 1, drum: 'snare' });
    expect(bar![2]).toEqual({ s: 8, d: 4, p: { k: 'chord', i: 2, oct: 1 } });
    expect(bar![3]).toEqual({ s: 10, d: 2, p: { k: 'scale', d: -1, oct: -1 } });
    expect(bar![4]).toEqual({ s: 12, d: 3, p: { k: 'bass', n: 1, oct: 0 } });
    expect(bar!.slice(5).map((h) => (h.p as { i: number }).i)).toEqual([0, 1, 2]);
  });

  it('reads velocities, voiced chords, colour tones and bass thirds', () => {
    const [bar] = parseBars('0K@9 1S@2 2w:4@5 6y:2 8v1:2 9j3:2^ 10e:2 12b3:2 14b4:2@8');
    expect(bar![0]).toEqual({ s: 0, d: 1, drum: 'kick', v: 1 });
    expect(bar![1]).toEqual({ s: 1, d: 1, drum: 'snare', v: 0.22 });
    const voiced = bar!.filter((h) => h.s === 2);
    expect(voiced.map((h) => (h.p as { i: number }).i)).toEqual([0, 1, 2]);
    expect(voiced.every((h) => h.v === 0.56 && h.p!.k === 'voice' && !h.p!.sev)).toBe(true);
    expect(bar!.filter((h) => h.s === 6).length).toBe(4);
    expect(bar!.find((h) => h.s === 6)!.v).toBeUndefined();
    expect(bar!.find((h) => h.s === 8)!.p).toEqual({ k: 'voice', i: 1, sev: false, oct: 0 });
    expect(bar!.find((h) => h.s === 9)!.p).toEqual({ k: 'voice', i: 3, sev: true, oct: 1 });
    expect(bar!.find((h) => h.s === 10)!.p).toEqual({ k: 'ext', oct: 0 });
    expect(bar!.find((h) => h.s === 12)!.p).toEqual({ k: 'bass', n: 3, oct: 0 });
    expect(bar!.find((h) => h.s === 14)!.v).toBe(0.89);
  });

  it('takes 1, 2 or 4 bars, with empty bars allowed', () => {
    expect(parseBars('0K').length).toBe(1);
    expect(parseBars('0K | 4S').length).toBe(2);
    expect(parseBars(' | | | 12M').map((b) => b.length)).toEqual([0, 0, 0, 1]);
  });

  it('refuses typos instead of going quiet', () => {
    expect(() => parseBars('0Z')).toThrow();
    expect(() => parseBars('16K')).toThrow();
    expect(() => parseBars('0K | 4S | 8K')).toThrow();
    expect(() => parseBars('0b5')).toThrow();
    expect(() => parseBars('0K@0')).toThrow();
    expect(() => parseBars('0v')).toThrow();
    expect(() => parseBars('K')).toThrow();
  });
});

describe('voice-led chords', () => {
  it('every voicing holds exactly the chord tones, close together, in the middle register', () => {
    for (const s of SONGS) {
      for (const sev of [false, true]) {
        for (let bar = 0; bar < BARS; bar++) {
          const v = voicingOf(s, bar, sev);
          const want = new Set(sev ? chordTones(s.chords[bar]!) : chordPcs(s.chords[bar]!));
          expect(v.length).toBe(want.size);
          expect(new Set(v.map((n) => n % 12))).toEqual(want);
          expect([...v].sort((a, b) => a - b)).toEqual([...v]);
          expect(v[0]!).toBeGreaterThanOrEqual(52);
          expect(v[v.length - 1]!).toBeLessThanOrEqual(76);
          expect(v[v.length - 1]! - v[0]!).toBeLessThanOrEqual(sev ? 14 : 12);
        }
      }
    }
  });

  it('the notes move as little as possible from chord to chord, round the loop too', () => {
    for (const s of SONGS) {
      for (const sev of [false, true]) {
        let total = 0;
        for (let bar = 0; bar < BARS; bar++) {
          const a = voicingOf(s, bar, sev);
          const b = voicingOf(s, bar + 1, sev);
          const move = a.reduce((t, n, i) => t + Math.abs(n - b[i]!), 0) / a.length;
          expect(move, `${s.id} bar ${bar} sev=${sev}`).toBeLessThanOrEqual(5);
          total += move;
        }
        expect(total / BARS, `${s.id} sev=${sev}`).toBeLessThanOrEqual(3.5);
      }
    }
  });

  it('voice tokens wrap into the next octave', () => {
    const fun = song('fun');
    const v = voicingOf(fun, 0);
    expect(pitchOf(fun, 0, { k: 'voice', i: 1, sev: false, oct: 0 })).toBe(v[1]);
    expect(pitchOf(fun, 0, { k: 'voice', i: 3, sev: false, oct: 0 })).toBe(v[0]! + 12);
  });
});

// ---- the sequencer -------------------------------------------------------------------------

interface Rig {
  deps: GrooveDeps;
  clock: { t: number };
  timers: Array<{ fn: () => void; at: number; id: number }>;
  note: ReturnType<typeof vi.fn>;
  drum: ReturnType<typeof vi.fn>;
  inst: ReturnType<typeof vi.fn>;
  /** Advance time, running due timers like a browser would. */
  advance(ms: number): void;
}

function rig(): Rig {
  const clock = { t: 1000 };
  const timers: Rig['timers'] = [];
  let nextId = 1;
  const note = vi.fn();
  const drum = vi.fn();
  const inst = vi.fn();
  const deps: GrooveDeps = {
    audio: { note, drum, inst },
    now: () => clock.t,
    setTimer(fn, ms) {
      const id = nextId++;
      timers.push({ fn, at: clock.t + ms, id });
      return id;
    },
    clearTimer(handle) {
      const i = timers.findIndex((t) => t.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  return {
    deps,
    clock,
    timers,
    note,
    drum,
    inst,
    advance(ms) {
      const end = clock.t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        clock.t = next.at;
        next.fn();
      }
      clock.t = end;
    },
  };
}

const kickPlayer = (_slot: number): Player => ({
  timbre: 'bass',
  bars: () => parseBars('0K 8K'),
});
const chordPlayer = (_slot: number): Player => ({
  timbre: 'piano',
  bars: () => parseBars('0t:8'),
});

describe('groove scheduler', () => {
  it('queues steps ahead on the audio clock with the right delays', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, kickPlayer(0));
    g.start();
    // The first step is queued straight away, a hair in the future.
    expect(r.drum).toHaveBeenCalledTimes(1);
    expect(r.drum.mock.calls[0]![0]).toBe('kick');
    expect(r.drum.mock.calls[0]![1]).toBeCloseTo(0.06, 3);
    // A kick on 0 and 8 of a 16-step bar at 108 bpm: 8 steps = 2 beats = 1111 ms apart.
    r.advance(3000);
    const kicks = r.drum.mock.calls.length;
    expect(kicks).toBeGreaterThanOrEqual(3);
    expect(g.running).toBe(true);
    g.stop();
    expect(r.timers.length).toBe(0);
    const before = r.drum.mock.calls.length;
    r.advance(5000);
    expect(r.drum.mock.calls.length).toBe(before);
  });

  it('keeps perfect time: step times are exact multiples of the step length, whatever the timer jitter', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, kickPlayer(0));
    g.start();
    const events: StepEvent[] = [];
    // A jittery main thread: uneven timer gaps.
    for (let i = 0; i < 80; i++) {
      r.advance(10 + ((i * 37) % 55));
      events.push(...g.drain(r.clock.t));
    }
    expect(events.length).toBeGreaterThanOrEqual(15);
    const ms = stepMs(song('fun'));
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.idx).toBe(events[i - 1]!.idx + 1);
      expect(events[i]!.t - events[i - 1]!.t).toBeCloseTo(ms, 6);
    }
    expect(events[0]!.t - 1000).toBeCloseTo(60, 6);
  });

  it('reports each step with its bar and position, wrapping the 4-bar loop', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.start();
    r.advance(25000);
    const events = g.drain(r.clock.t);
    const e = events.find((x) => x.idx === STEPS_PER_BAR * BARS + 5)!;
    expect(e.bar).toBe(0);
    expect(e.step).toBe(5);
    expect(events.find((x) => x.idx === 17)!.bar).toBe(1);
    expect(events.find((x) => x.idx === 17)!.step).toBe(1);
  });

  it('a robot placed mid-bar waits for the next bar, so it always lands on the beat', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, kickPlayer(0));
    g.start();
    r.advance(1500); // part-way through bar 0
    r.drum.mockClear();
    r.note.mockClear();
    g.setPlayer(1, chordPlayer(1));
    const from = g.startsAt(1)!;
    expect(from % STEPS_PER_BAR).toBe(0);
    expect(from).toBeGreaterThan(0);
    expect(from).toBeGreaterThanOrEqual(g.nextIdx);
    // Run to just before the start step: still silent.
    const ms = stepMs(g.song);
    const untilStart = (from - g.nextIdx) * ms;
    r.advance(untilStart - 300);
    expect(r.note).not.toHaveBeenCalled();
    r.advance(1000);
    expect(r.note).toHaveBeenCalled();
    // The three notes of the triad come out together at the start of a bar.
    const events = g.drain(r.clock.t);
    const first = events.find((e) => e.hits.some((h) => h.slot === 1))!;
    expect(first.step).toBe(0);
    expect(first.idx).toBe(from);
    expect(first.hits.filter((h) => h.slot === 1).length).toBe(3);
  });

  it('a robot placed exactly on a bar line starts at once; an empty stage plays from the top', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.start();
    g.setPlayer(0, kickPlayer(0));
    expect(g.startsAt(0)! % STEPS_PER_BAR).toBe(0);
    const stopped = createGroove(rig().deps);
    stopped.setPlayer(3, kickPlayer(3));
    expect(stopped.startsAt(3)).toBe(0);
  });

  it('removing a player silences it at once; levels change what is played', () => {
    const r = rig();
    const g = createGroove(r.deps);
    const lvl: number[] = [];
    g.setPlayer(0, {
      timbre: 'bass',
      bars: (_s, level) => {
        lvl.push(level);
        return parseBars(level === 1 ? '0K' : '0K 4K 8K 12K');
      },
    });
    g.start();
    r.advance(2000);
    g.setLevel(0, 3);
    r.advance(2000);
    expect(new Set(lvl)).toEqual(new Set([2, 3]));
    g.setPlayer(0, null);
    r.drum.mockClear();
    r.advance(4000);
    expect(r.drum).not.toHaveBeenCalled();
  });

  it('switching song restarts from its first bar at the next step, keeps the robots, and changes the tempo', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, kickPlayer(0));
    g.start();
    r.advance(3000);
    g.drain(r.clock.t);
    g.setSong('disco');
    r.advance(400);
    const events = g.drain(r.clock.t);
    const restart = events.find((e) => e.restart)!;
    expect(restart).toBeDefined();
    expect(restart.idx).toBe(0);
    expect(restart.song).toBe('disco');
    expect(g.song.id).toBe('disco');
    const after = events.filter((e) => e.idx >= 1 && e.song === 'disco');
    expect(after[0]!.ms).toBeCloseTo(stepMs(song('disco')), 6);
    expect(restart.hits.some((h) => h.slot === 0)).toBe(true);
  });

  it('skips ahead instead of bursting when the page was frozen', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, kickPlayer(0));
    g.start();
    r.clock.t += 60_000; // tab slept
    r.drum.mockClear();
    g.tick();
    expect(r.drum.mock.calls.length).toBeLessThan(4);
  });

  it('phase follows the clock between steps', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.start();
    expect(g.phase(r.clock.t)).toBeNull();
    r.advance(60 + stepMs(g.song) * 4); // a beat in
    g.drain(r.clock.t);
    const p = g.phase(r.clock.t)!;
    expect(p.beat).toBeGreaterThanOrEqual(1);
    expect(p.beat).toBeLessThan(2);
    expect(p.bar).toBe(0);
    const later = g.phase(r.clock.t + stepMs(g.song))!;
    expect(later.beat).toBeGreaterThan(p.beat);
  });

  it('swapping two slots moves the players without restarting them', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, kickPlayer(0));
    g.start();
    const from = g.startsAt(0);
    g.swap(0, 5);
    expect(g.startsAt(0)).toBeNull();
    expect(g.startsAt(5)).toBe(from);
    g.setPlayer(1, chordPlayer(1));
    const chordFrom = g.startsAt(1);
    g.swap(5, 1);
    expect(g.startsAt(5)).toBe(chordFrom);
    expect(g.startsAt(1)).toBe(from);
  });

  it('plays tonal notes at the song pitch with the player timbre', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, chordPlayer(0));
    g.start();
    const freqs = r.note.mock.calls.map((c) => c[0] as number);
    expect(freqs.map((f) => Math.round(f))).toEqual([262, 330, 392]); // C major triad
    expect(r.note.mock.calls[0]![2]).toBe('piano');
    expect(r.note.mock.calls[0]![3]).toBeCloseTo(0.06, 3);
  });
});

describe('the sound of the groove', () => {
  it('plays a robot with the instrument of the song, and falls back to its timbre', () => {
    for (const [songId, voice] of [['fun', 'marimba'], ['calm', 'kalimba'], ['east', 'handpan']] as const) {
      const r = rig();
      const g = createGroove(r.deps);
      g.setSong(songId);
      g.setPlayer(0, { timbre: 'xylo', bars: () => parseBars('0c0:2'), voice: (id) => (id === songId ? voice : 'xylo') });
      g.start();
      expect(r.inst).toHaveBeenCalledTimes(1);
      expect(r.inst.mock.calls[0]![0]).toBe(voice);
      expect(r.note).not.toHaveBeenCalled();
    }
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, { timbre: 'xylo', bars: () => parseBars('0c0:2'), voice: () => 'flute' });
    g.start();
    expect(r.note.mock.calls[0]![2]).toBe('flute');
    expect(r.inst).not.toHaveBeenCalled();
  });

  it('plays an instrument voice through note() when the audio has no world instruments', () => {
    const r = rig();
    const { inst: _unused, ...audio } = r.deps.audio as unknown as Record<string, unknown>;
    const g = createGroove({ ...r.deps, audio: audio as unknown as GrooveDeps['audio'] });
    g.setPlayer(0, { timbre: 'bell', bars: () => parseBars('0c0:2'), voice: () => 'harp' });
    g.start();
    expect(r.note.mock.calls[0]![2]).toBe('bell');
  });

  it('a world instrument can stand in for a drum', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, { timbre: 'bass', bars: () => parseBars('0X 4K'), perc: (_s, kind) => (kind === 'shaker' ? 'maracas' : undefined) });
    g.start();
    expect(r.inst.mock.calls[0]![0]).toBe('maracas');
    expect(r.drum).not.toHaveBeenCalled();
    r.advance(1000);
    expect(r.drum.mock.calls[0]![0]).toBe('kick');
  });

  it('velocity and the robot level set how loud a hit is', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, { timbre: 'bass', bars: () => parseBars('0K@9 4K@3 8K'), vol: 0.5 });
    g.start();
    r.advance(1500);
    const vels = r.drum.mock.calls.map((c) => c[2] as number);
    expect(vels.slice(0, 3).map((v) => Math.round((v / BAND_GAIN) * 1000) / 1000)).toEqual([0.5, 0.165, 0.39]);
  });

  it('chords roll a few milliseconds apart, and the first note is exactly on the beat', () => {
    const r = rig();
    const g = createGroove(r.deps);
    g.setPlayer(0, chordPlayer(0));
    g.start();
    const delays = r.note.mock.calls.map((c) => c[3] as number);
    expect(delays[0]).toBeCloseTo(0.06, 4);
    expect(delays[1]! - delays[0]!).toBeCloseTo(0.011, 4);
    expect(delays[2]! - delays[1]!).toBeCloseTo(0.011, 4);
  });

  it('swing pushes the off-beats late in the sound only, never moving the grid', () => {
    const calm = song('calm');
    expect(swingOffset(calm, 0)).toBe(0);
    expect(swingOffset(calm, 4)).toBe(0);
    expect(swingOffset(calm, 2)).toBeCloseTo(calm.swing, 6);
    expect(swingOffset(calm, 3)).toBeCloseTo(calm.swing / 2, 6);
    expect(swingOffset(song('fun'), 2)).toBe(0);
    const r = rig();
    const g = createGroove(r.deps);
    g.setSong('calm');
    const when: number[] = [];
    r.drum.mockImplementation((_k: string, delay: number) => when.push(r.clock.t + delay * 1000));
    g.setPlayer(0, { timbre: 'bass', bars: () => parseBars('0K 2K') });
    g.start();
    r.advance(600);
    const kick = g.drain(r.clock.t + 1000).filter((e) => e.hits.length > 0);
    // The picture's step times stay exact multiples of the step...
    expect(kick[1]!.t - kick[0]!.t).toBeCloseTo(2 * stepMs(calm), 6);
    // ...but the sound of the off-beat is late by the swing.
    expect(when[1]! - when[0]!).toBeCloseTo(2 * stepMs(calm) + calm.swing * stepMs(calm), 4);
  });
});
