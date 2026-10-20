/**
 * The groove engine of "Ban nhạc robot": one tempo, one key, one chord loop that every robot
 * plays against, so whatever the child puts on the stage always sounds good together.
 *
 * Two halves, both free of the DOM:
 *  - the *music*: songs (tempo + key + four chords + drum feel), the pattern language the robots
 *    are written in, and `pitchOf`, which turns "the third of the chord" into a note;
 *  - the *scheduler*: a look-ahead sequencer. A short timer wakes every ~25 ms and queues the
 *    next few steps on the audio clock (`note(…, delay)`), so the beat is exact even when the
 *    main thread is busy drawing. Robots join on the next bar so they always land on the beat.
 */
import type { DrumKind, Timbre } from '../../core/audio';

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

export type SongId = 'fun' | 'disco' | 'calm';
export type DrumStyle = 'pop' | 'disco' | 'soft';
export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];

export interface Chord {
  /** Pitch class of the root, 0 = C … 11 = B. */
  root: number;
  quality: 'maj' | 'min';
}

export interface Song {
  id: SongId;
  icon: string;
  bpm: number;
  /** Pitch class of the key note. */
  tonic: number;
  /** One chord per bar; the loop is these four, round and round. */
  chords: readonly [Chord, Chord, Chord, Chord];
  style: DrumStyle;
}

const maj = (root: number): Chord => ({ root, quality: 'maj' });
const min = (root: number): Chord => ({ root, quality: 'min' });

export const SONGS: readonly Song[] = [
  { id: 'fun', icon: '🎈', bpm: 108, tonic: 0, chords: [maj(0), min(9), maj(5), maj(7)], style: 'pop' },
  { id: 'disco', icon: '🪩', bpm: 120, tonic: 2, chords: [min(11), maj(7), maj(2), maj(9)], style: 'disco' },
  { id: 'calm', icon: '🌙', bpm: 80, tonic: 5, chords: [maj(5), maj(0), min(2), maj(10)], style: 'soft' },
];

export function findSong(id: SongId): Song {
  return SONGS.find((s) => s.id === id) ?? (SONGS[0] as Song);
}

/** Ms in one 16th-note step. */
export function stepMs(song: Song): number {
  return 60000 / song.bpm / 4;
}

// ---------------------------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------------------------

/** The notes of a major pentatonic scale, as semitones above the tonic. */
const PENT = [0, 2, 4, 7, 9] as const;

/** Pitch classes of the chord's triad. */
export function chordPcs(c: Chord): number[] {
  const third = c.quality === 'maj' ? 4 : 3;
  return [c.root % 12, (c.root + third) % 12, (c.root + 7) % 12];
}

/** Pitch classes of the song's major pentatonic scale. */
export function scalePcs(song: Song): number[] {
  return PENT.map((i) => (song.tonic + i) % 12);
}

/** Every pitch class that is safe over this bar: the chord's own notes plus the key's pentatonic. */
export function safePcs(song: Song, bar: number): Set<number> {
  const chord = song.chords[((bar % BARS) + BARS) % BARS] as Chord;
  return new Set([...chordPcs(chord), ...scalePcs(song)]);
}

/** A root pitch class placed in the octave starting a little below middle C (G3 … F#4 → 55 … 66). */
function midBase(pc: number): number {
  return 60 + ((pc + 5) % 12) - 5;
}

/** Where a bass note sits: E2 … D#3 (40 … 51). */
function bassBase(pc: number): number {
  return 40 + ((pc - 4 + 12) % 12);
}

/**
 * What a hit plays, written relative to the bar's chord or the key so it can never be wrong:
 *  - `chord`: the i-th chord tone (0 root, 1 third, 2 fifth, 3 root an octave up, 4 …),
 *  - `scale`: the d-th note of the pentatonic scale (0 tonic … 4 sixth, 5 tonic an octave up, −1 below),
 *  - `bass`: 0 root, 1 fifth, 2 octave — down in the bass register.
 * `oct` shifts whole octaves.
 */
export type Pitch =
  | { k: 'chord'; i: number; oct: number }
  | { k: 'scale'; d: number; oct: number }
  | { k: 'bass'; n: 0 | 1 | 2; oct: number };

export interface Hit {
  /** Step in the bar, 0 … 15. */
  s: number;
  /** Length in steps (tonal hits). */
  d: number;
  drum?: DrumKind;
  p?: Pitch;
}

/** The MIDI note a pitch means in this bar of this song. */
export function pitchOf(song: Song, bar: number, p: Pitch): number {
  const chord = song.chords[((bar % BARS) + BARS) % BARS] as Chord;
  switch (p.k) {
    case 'chord': {
      const base = midBase(chord.root);
      const third = chord.quality === 'maj' ? 4 : 3;
      const tones = [base, base + third, base + 7];
      const i = Math.round(p.i);
      const wrap = Math.floor(i / 3);
      return (tones[((i % 3) + 3) % 3] as number) + 12 * (wrap + p.oct);
    }
    case 'scale': {
      const d = Math.round(p.d);
      const wrap = Math.floor(d / PENT.length);
      const idx = ((d % PENT.length) + PENT.length) % PENT.length;
      return midBase(song.tonic) + (PENT[idx] as number) + 12 * (wrap + p.oct);
    }
    case 'bass': {
      const base = bassBase(chord.root);
      const add = p.n === 0 ? 0 : p.n === 1 ? 7 : 12;
      return base + add + 12 * p.oct;
    }
  }
}

export function midiFreq(midi: number): number {
  return Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// The pattern language
// ---------------------------------------------------------------------------------------------

export type Bars = readonly (readonly Hit[])[];

const DRUM_LETTER: Record<string, DrumKind> = {
  K: 'kick',
  S: 'snare',
  H: 'hat',
  M: 'tom',
  P: 'clap',
  W: 'wood',
  B: 'cowbell',
  X: 'shaker',
  R: 'ride',
  A: 'triangle',
  C: 'crash',
};

const TOKEN = /^(\d{1,2})([KSHMPWBXRAC]|[csb]-?\d|[tu])(?::(\d+(?:\.\d+)?))?([\^_]*)$/;

/**
 * Parse a pattern. Bars are separated by `|` (1, 2 or 4 of them: bar n of the loop plays
 * bars[n mod length]). A hit is `<step><what>[:<steps long>][^ or _ for octaves]`:
 *   `4S`  snare at step 4          `0c2:4^`  chord tone 2, 4 steps long, an octave up
 *   `8s3:2`  pentatonic note 3     `0b1:6`   bass: the fifth       `0t:8`  the whole triad
 * Throws on anything it cannot read, so a typo shows up in the tests rather than as silence.
 */
export function parseBars(text: string): Bars {
  const bars: Hit[][] = [];
  for (const barText of text.split('|')) {
    const hits: Hit[] = [];
    for (const tok of barText.trim().split(/\s+/).filter(Boolean)) {
      const m = TOKEN.exec(tok);
      if (!m) throw new Error(`bad groove token "${tok}" in "${text}"`);
      const s = Number(m[1]);
      if (s < 0 || s >= STEPS_PER_BAR) throw new Error(`step out of range in "${tok}"`);
      const what = m[2] as string;
      const d = m[3] ? Number(m[3]) : 1;
      const ups = (m[4] ?? '').split('').reduce((n, c) => n + (c === '^' ? 1 : -1), 0);
      const drum = DRUM_LETTER[what];
      if (drum) {
        hits.push({ s, d: 1, drum });
      } else if (what === 't' || what === 'u') {
        for (let i = 0; i < 3; i++) hits.push({ s, d, p: { k: 'chord', i, oct: ups } });
      } else {
        const n = Number(what.slice(1));
        if (what[0] === 'c') hits.push({ s, d, p: { k: 'chord', i: n, oct: ups } });
        else if (what[0] === 's') hits.push({ s, d, p: { k: 'scale', d: n, oct: ups } });
        else {
          if (n < 0 || n > 2) throw new Error(`bass note must be 0, 1 or 2 in "${tok}"`);
          hits.push({ s, d, p: { k: 'bass', n: n as 0 | 1 | 2, oct: ups } });
        }
      }
    }
    bars.push(hits);
  }
  if (![1, 2, 4].includes(bars.length)) throw new Error(`a pattern has 1, 2 or 4 bars, not ${bars.length}: "${text}"`);
  return bars;
}

// ---------------------------------------------------------------------------------------------
// The sequencer
// ---------------------------------------------------------------------------------------------

/** What the sequencer needs to know about a robot on the stage. */
export interface Player {
  /** Voice for tonal hits. */
  timbre: Timbre;
  /** Patterns for this robot, by drum style and level. */
  bars(style: DrumStyle, level: Level): Bars;
}

export interface PlayedHit {
  slot: number;
  drum?: DrumKind;
  midi?: number;
}

/** One 16th-note step as it was queued: what the visuals draw when the clock reaches `t`. */
export interface StepEvent {
  /** Steps since the groove started (or since the song last restarted). */
  idx: number;
  /** When the step sounds, on the `now()` clock (ms). */
  t: number;
  /** Length of the step (ms). */
  ms: number;
  /** Step within the bar, 0 … 15. */
  step: number;
  /** Bar within the 4-bar loop, 0 … 3. */
  bar: number;
  song: SongId;
  hits: PlayedHit[];
  /** The step is the first of a new song (the loop was restarted). */
  restart: boolean;
}

export interface Phase {
  /** Position in the bar in beats, 0 ≤ beat < 4 (continuous). */
  beat: number;
  /** Bar of the loop, 0 … 3. */
  bar: number;
  song: SongId;
  /** The latest step that has sounded. */
  idx: number;
}

export interface GrooveAudio {
  note(freq: number, dur?: number, timbre?: Timbre, delay?: number): void;
  drum(kind: DrumKind, delay?: number): void;
}

export interface GrooveDeps {
  audio: GrooveAudio;
  /** A steady clock in ms. */
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** How far ahead steps are queued (ms). */
  lookaheadMs?: number;
  /** How often the timer wakes (ms). */
  tickMs?: number;
}

export interface Groove {
  readonly running: boolean;
  readonly song: Song;
  start(): void;
  stop(): void;
  /** Switch song; it starts from its first bar at the next step. */
  setSong(id: SongId): void;
  /** Put a player on the stage (`null` takes it off). A new player starts at the next bar. */
  setPlayer(slot: number, player: Player | null, level?: Level): void;
  setLevel(slot: number, level: Level): void;
  /** Swap whatever stands in two slots (either may be empty) without restarting anybody. */
  swap(a: number, b: number): void;
  /** The step (in `idx` terms) at which this slot starts to sound, or null if empty. */
  startsAt(slot: number): number | null;
  /** The step events whose time has come, oldest first. */
  drain(now: number): StepEvent[];
  /** Where in the bar the music is at `now`, or null before the first step. */
  phase(now: number): Phase | null;
  /** The next step to be queued (test hook and used for quantising). */
  readonly nextIdx: number;
  /** Queue whatever falls inside the look-ahead window. The timer calls this; tests may too. */
  tick(): void;
}

interface Slot {
  player: Player;
  level: Level;
  from: number;
}

/** Tonal notes ring a little shorter than their written length so repeated notes stay distinct. */
const RING = 0.92;
/** Seconds a tonal hit lasts, at least. */
const MIN_NOTE_S = 0.12;

export function createGroove(deps: GrooveDeps): Groove {
  const lookahead = deps.lookaheadMs ?? 140;
  const tickMs = deps.tickMs ?? 25;
  const slots = new Map<number, Slot>();
  let song: Song = SONGS[0] as Song;
  let pendingSong: SongId | null = null;
  let running = false;
  let timer: unknown = null;
  let nextIdx = 0;
  let nextTime = 0;
  let queue: StepEvent[] = [];
  let last: StepEvent | null = null;

  function playStep(idx: number, t: number, restart: boolean): StepEvent {
    const ms = stepMs(song);
    const inBar = idx % STEPS_PER_BAR;
    const bar = Math.floor(idx / STEPS_PER_BAR) % BARS;
    const delayS = Math.max(0, (t - deps.now()) / 1000);
    const hits: PlayedHit[] = [];
    for (const [slot, sp] of slots) {
      if (idx < sp.from) continue;
      const bars = sp.player.bars(song.style, sp.level);
      const list = bars[bar % bars.length] ?? [];
      for (const h of list) {
        if (h.s !== inBar) continue;
        if (h.drum) {
          deps.audio.drum(h.drum, delayS);
          hits.push({ slot, drum: h.drum });
        } else if (h.p) {
          const midi = pitchOf(song, bar, h.p);
          deps.audio.note(midiFreq(midi), Math.max(MIN_NOTE_S, ((h.d * ms) / 1000) * RING), sp.player.timbre, delayS);
          hits.push({ slot, midi });
        }
      }
    }
    return { idx, t, ms, step: inBar, bar, song: song.id, hits, restart };
  }

  function tick(): void {
    if (!running) return;
    const now = deps.now();
    // The page was frozen for a while (a background tab): skip ahead rather than burst-play.
    if (nextTime < now - 300) {
      const missed = Math.floor((now - nextTime) / stepMs(song));
      nextIdx += missed;
      nextTime += missed * stepMs(song);
    }
    while (nextTime < now + lookahead) {
      let restart = false;
      if (pendingSong) {
        song = findSong(pendingSong);
        pendingSong = null;
        nextIdx = 0;
        for (const sp of slots.values()) sp.from = 0;
        restart = true;
      }
      const ev = playStep(nextIdx, nextTime, restart);
      queue.push(ev);
      // A page nobody is drawing (hidden tab) must not pile up events for the visuals.
      if (queue.length > 400) queue.splice(0, queue.length - 400);
      nextTime += ev.ms;
      nextIdx++;
    }
    timer = deps.setTimer(tick, tickMs);
  }

  return {
    get running() {
      return running;
    },
    get song() {
      return song;
    },
    get nextIdx() {
      return nextIdx;
    },
    start() {
      if (running) return;
      running = true;
      nextIdx = 0;
      nextTime = deps.now() + 60;
      queue = [];
      last = null;
      for (const sp of slots.values()) sp.from = 0;
      tick();
    },
    stop() {
      running = false;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      queue = [];
      last = null;
    },
    setSong(id) {
      if (id === song.id && !pendingSong) return;
      pendingSong = id;
    },
    setPlayer(slot, player, level = 2) {
      if (!player) {
        slots.delete(slot);
        return;
      }
      const from = running ? Math.ceil(nextIdx / STEPS_PER_BAR) * STEPS_PER_BAR : 0;
      slots.set(slot, { player, level, from });
    },
    setLevel(slot, level) {
      const sp = slots.get(slot);
      if (sp) sp.level = level;
    },
    swap(a, b) {
      const x = slots.get(a);
      const y = slots.get(b);
      slots.delete(a);
      slots.delete(b);
      if (x) slots.set(b, x);
      if (y) slots.set(a, y);
    },
    startsAt(slot) {
      return slots.get(slot)?.from ?? null;
    },
    drain(now) {
      const due: StepEvent[] = [];
      while (queue.length && (queue[0] as StepEvent).t <= now) {
        const ev = queue.shift() as StepEvent;
        due.push(ev);
        last = ev;
      }
      return due;
    },
    phase(now) {
      if (!last) return null;
      const frac = Math.min(1.5, Math.max(0, (now - last.t) / last.ms));
      return { beat: (((last.step + frac) / 4) % 4 + 4) % 4, bar: last.bar, song: last.song, idx: last.idx };
    },
    tick,
  };
}
