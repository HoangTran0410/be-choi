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
import { INSTRUMENT_IDS, type InstrumentId } from '../../core/instruments';

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

export type SongId = 'fun' | 'disco' | 'calm' | 'latin' | 'east';
export type DrumStyle = 'pop' | 'disco' | 'soft' | 'latin' | 'east';
/** A robot's voice for tonal hits: one of the synth timbres or a world instrument. */
export const DRUM_STYLES: readonly DrumStyle[] = ['pop', 'disco', 'soft', 'latin', 'east'];
export type Voice = Timbre | InstrumentId;
const INSTRUMENT_SET: ReadonlySet<string> = new Set(INSTRUMENT_IDS);
export const isInstrument = (v: Voice): v is InstrumentId => INSTRUMENT_SET.has(v);
export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];

export interface Chord {
  /** Pitch class of the root, 0 = C … 11 = B. */
  root: number;
  /** `sus` is the open sus-2 chord (root, second, fifth) the eastern song leans on. */
  quality: 'maj' | 'min' | 'sus';
  /**
   * The colour tone above the triad, in semitones over the root (9 = sixth, 10 = minor seventh,
   * 11 = major seventh). Defaults to the seventh that suits the quality.
   */
  ext?: number;
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
  /**
   * Swing, in steps: how far the off-beat eighths (and half-way the sixteenths round them) are
   * pushed late. 0 is straight, about 0.67 a full triplet shuffle. Only the sound moves; the
   * picture and the tempo stay on the grid.
   */
  swing: number;
}

const maj = (root: number, ext?: number): Chord => ({ root, quality: 'maj', ext });
const min = (root: number, ext?: number): Chord => ({ root, quality: 'min', ext });
const sus = (root: number, ext?: number): Chord => ({ root, quality: 'sus', ext });

export const SONGS: readonly Song[] = [
  // I(6) – vi7 – IV(6) – V7: the classic pop loop
  { id: 'fun', icon: '🎈', bpm: 112, tonic: 0, chords: [maj(0, 9), min(9, 10), maj(5, 9), maj(7, 10)], style: 'pop', swing: 0 },
  // vi – IV – I – V in D with a four-on-the-floor kick
  { id: 'disco', icon: '🪩', bpm: 120, tonic: 2, chords: [min(11, 10), maj(7, 9), maj(2, 9), maj(9, 10)], style: 'disco', swing: 0 },
  // a lazy lo-fi / lullaby loop: I – V – vi – IV with sixths and a lilt
  { id: 'calm', icon: '🌙', bpm: 78, tonic: 5, chords: [maj(5, 9), maj(0, 9), min(2, 10), maj(10, 9)], style: 'soft', swing: 0.42 },
  // ii7 – V7 – I(6) – iii7 in G: the bossa / samba turnaround
  { id: 'latin', icon: '💃', bpm: 104, tonic: 7, chords: [min(9, 10), maj(2, 10), maj(7, 9), min(4, 10)], style: 'latin', swing: 0 },
  // five-note (ngũ cung) tune over open sus-2 chords in A
  { id: 'east', icon: '🏮', bpm: 92, tonic: 9, chords: [maj(9, 9), min(6, 10), sus(2, 9), sus(4, 9)], style: 'east', swing: 0 },
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

/** Semitones from the root to the chord's third (or its open second). */
function thirdOf(c: Chord): number {
  return c.quality === 'maj' ? 4 : c.quality === 'min' ? 3 : 2;
}

/** Semitones from the root to the colour tone. */
export function extOf(c: Chord): number {
  return c.ext ?? (c.quality === 'maj' ? 11 : 10);
}

/** Pitch classes of the chord's triad. */
export function chordPcs(c: Chord): number[] {
  return [c.root % 12, (c.root + thirdOf(c)) % 12, (c.root + 7) % 12];
}

/** The triad plus its colour tone (the seventh or sixth). */
export function chordTones(c: Chord): number[] {
  return [...chordPcs(c), (c.root + extOf(c)) % 12];
}

/** Pitch classes of the song's major pentatonic scale. */
export function scalePcs(song: Song): number[] {
  return PENT.map((i) => (song.tonic + i) % 12);
}

/** Every pitch class that is safe over this bar: the chord's own notes (with its colour tone) plus the key's pentatonic. */
export function safePcs(song: Song, bar: number): Set<number> {
  const chord = song.chords[((bar % BARS) + BARS) % BARS] as Chord;
  return new Set([...chordTones(chord), ...scalePcs(song)]);
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
 *  - `bass`: 0 root, 1 fifth, 2 octave, 3 third, 4 colour tone — down in the bass register,
 *  - `ext`: the chord's colour tone (seventh / sixth) above the root,
 *  - `voice`: the i-th note (low to high) of a voice-led chord: the voicing of each bar is
 *    chosen so the notes move as little as possible from the bar before (`sev` adds the colour tone).
 * `oct` shifts whole octaves.
 */
export type Pitch =
  | { k: 'chord'; i: number; oct: number }
  | { k: 'scale'; d: number; oct: number }
  | { k: 'bass'; n: 0 | 1 | 2 | 3 | 4; oct: number }
  | { k: 'ext'; oct: number }
  | { k: 'voice'; i: number; sev: boolean; oct: number };

export interface Hit {
  /** Step in the bar, 0 … 15. */
  s: number;
  /** Length in steps (tonal hits). */
  d: number;
  drum?: DrumKind;
  p?: Pitch;
  /** How hard it is played, 0 … 1 (a missing value means the default mezzo-forte). */
  v?: number;
}

/** Velocity of a hit that does not say. */
export const DEFAULT_VEL = 0.78;

// ---- voice-led chords -------------------------------------------------------------------------

const VOICE_LO = 52;
const VOICE_HI = 76;
const VOICE_CENTER = 63;
const voicingCache = new WeakMap<Song, number[][][]>();

/** Every way to stack these pitch classes upward in a compact, close-position voicing. */
function candidates(pcs: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < pcs.length; r++) {
    const order = [...pcs.slice(r), ...pcs.slice(0, r)];
    for (let low = VOICE_LO; low < VOICE_LO + 12; low++) {
      if (low % 12 !== order[0]) continue;
      const notes = [low];
      for (let k = 1; k < order.length; k++) {
        let n = (notes[k - 1] as number) + 1;
        while (n % 12 !== order[k]) n++;
        notes.push(n);
      }
      if ((notes[notes.length - 1] as number) <= VOICE_HI) out.push(notes);
    }
  }
  return out;
}

/** The voicings of the four bars (low to high), each leading smoothly into the next, round the loop. */
function voicings(song: Song, sev: boolean): number[][] {
  let all = voicingCache.get(song);
  if (!all) {
    all = [];
    voicingCache.set(song, all);
  }
  const slot = sev ? 1 : 0;
  if (all[slot]) return all[slot] as number[][];
  const cands = song.chords.map((c) => candidates(sev ? chordTones(c) : chordPcs(c)));
  const cost = (a: number[], b: number[]): number => a.reduce((t, n, i) => t + Math.abs(n - (b[i] as number)), 0);
  const mean = (a: number[]): number => a.reduce((t, n) => t + n, 0) / a.length;
  let cur: number[][] = cands.map(
    (cs) => [...cs].sort((a, b) => Math.abs(mean(a) - VOICE_CENTER) - Math.abs(mean(b) - VOICE_CENTER))[0] as number[],
  );
  // Go round the loop a few times so the last bar also leads back into the first.
  for (let pass = 0; pass < 3; pass++) {
    cur = cur.map((_, b) => {
      const prev = cur[(b + BARS - 1) % BARS] as number[];
      const next = cur[(b + 1) % BARS] as number[];
      return [...(cands[b] as number[][])].sort(
        (x, y) =>
          cost(x, prev) +
          0.7 * cost(x, next) +
          0.25 * Math.abs(mean(x) - VOICE_CENTER) -
          (cost(y, prev) + 0.7 * cost(y, next) + 0.25 * Math.abs(mean(y) - VOICE_CENTER)),
      )[0] as number[];
    });
  }
  all[slot] = cur;
  return cur;
}

/** The notes (low to high) of the chord voicing for this bar of the song. */
export function voicingOf(song: Song, bar: number, sev = false): readonly number[] {
  return voicings(song, sev)[((bar % BARS) + BARS) % BARS] as number[];
}

/** The MIDI note a pitch means in this bar of this song. */
export function pitchOf(song: Song, bar: number, p: Pitch): number {
  const chord = song.chords[((bar % BARS) + BARS) % BARS] as Chord;
  switch (p.k) {
    case 'chord': {
      const base = midBase(chord.root);
      const tones = [base, base + thirdOf(chord), base + 7];
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
      const add = [0, 7, 12, thirdOf(chord), extOf(chord)][p.n] as number;
      return base + add + 12 * p.oct;
    }
    case 'ext': {
      const e = extOf(chord);
      return midBase(chord.root) + (e < 3 ? e + 12 : e) + 12 * p.oct;
    }
    case 'voice': {
      const v = voicingOf(song, bar, p.sev);
      const i = Math.round(p.i);
      const wrap = Math.floor(i / v.length);
      return (v[((i % v.length) + v.length) % v.length] as number) + 12 * (wrap + p.oct);
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

const TOKEN = /^(\d{1,2})([KSHMPWBXRAC]|[csb]-?\d|[vj]\d|[tuwye])(?::(\d+(?:\.\d+)?))?([\^_]*)(?:@([1-9]))?$/;

/**
 * Parse a pattern. Bars are separated by `|` (1, 2 or 4 of them: bar n of the loop plays
 * bars[n mod length]). A hit is `<step><what>[:<steps long>][^ or _ for octaves][@<1-9 velocity>]`:
 *   `4S`  snare at step 4          `0c2:4^`  chord tone 2, 4 steps long, an octave up
 *   `8s3:2`  pentatonic note 3     `0b1:6`   bass: the fifth (b3 the third, b4 the colour tone)
 *   `0t:8`  the whole triad        `0e:4`    the colour tone (seventh / sixth)
 *   `0w:8`  voice-led triad        `0y:8`    voice-led chord with its colour tone
 *   `2v1:2` one voice of that triad (`j0`…`j3` of the four-note chord)
 *   `4S@9`  a loud hit, `@2` a ghost note (the default is 7)
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
      const v = m[5] ? Math.round((Number(m[5]) / 9) * 100) / 100 : undefined;
      const add = (h: Hit): void => {
        if (v !== undefined) h.v = v;
        hits.push(h);
      };
      const drum = DRUM_LETTER[what];
      if (drum) {
        add({ s, d: 1, drum });
      } else if (what === 't' || what === 'u') {
        for (let i = 0; i < 3; i++) add({ s, d, p: { k: 'chord', i, oct: ups } });
      } else if (what === 'w' || what === 'y') {
        const n = what === 'w' ? 3 : 4;
        for (let i = 0; i < n; i++) add({ s, d, p: { k: 'voice', i, sev: what === 'y', oct: ups } });
      } else if (what === 'e') {
        add({ s, d, p: { k: 'ext', oct: ups } });
      } else {
        const n = Number(what.slice(1));
        if (what[0] === 'c') add({ s, d, p: { k: 'chord', i: n, oct: ups } });
        else if (what[0] === 's') add({ s, d, p: { k: 'scale', d: n, oct: ups } });
        else if (what[0] === 'v' || what[0] === 'j') add({ s, d, p: { k: 'voice', i: n, sev: what[0] === 'j', oct: ups } });
        else {
          if (n < 0 || n > 4) throw new Error(`bass note must be 0 … 4 in "${tok}"`);
          add({ s, d, p: { k: 'bass', n: n as 0 | 1 | 2 | 3 | 4, oct: ups } });
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
  /** Voice for tonal hits (unless `voice` picks another for the song). */
  timbre: Timbre;
  /** Patterns for this robot, by drum style and level. */
  bars(style: DrumStyle, level: Level): Bars;
  /** The instrument this robot plays in a given song (its palette), if not `timbre`. */
  voice?(song: SongId): Voice;
  /** A world instrument that stands in for a drum in a given song (shaker → maracas …). */
  perc?(song: SongId, kind: DrumKind): InstrumentId | undefined;
  /** This robot's place in the mix (default 1), perhaps different in every song. */
  vol?: number | ((song: SongId) => number);
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
  note(freq: number, dur?: number, timbre?: Timbre, delay?: number, vel?: number): void;
  drum(kind: DrumKind, delay?: number, vel?: number): void;
  inst?(id: InstrumentId, freq?: number, vel?: number, dur?: number, delay?: number, damp?: boolean, gain?: number): unknown;
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
/** A struck instrument is never damped sooner than this (it would sound choked). */
const MIN_STRUCK_S = 0.45;
/**
 * Headroom for a full stage: eight robots at once must not clip the master. Chosen by rendering
 * every song with eight busy robots through the real audio chain and keeping the peak below 0.9.
 */
export const BAND_GAIN = 0.4;
/** Seconds between the notes of one chord. */
const STRUM_S = 0.011;

/** How late a step sounds because of swing, in steps. */
export function swingOffset(song: Song, step: number): number {
  const k = step % 4;
  return k === 2 ? song.swing : k === 1 || k === 3 ? song.swing / 2 : 0;
}

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
      // The notes of one chord roll a hair apart, like a hand across strings, instead of a block.
      let rolled = 0;
      const bars = sp.player.bars(song.style, sp.level);
      const list = bars[bar % bars.length] ?? [];
      for (const h of list) {
        if (h.s !== inBar) continue;
        const hard = h.v ?? DEFAULT_VEL;
        const vol = typeof sp.player.vol === 'function' ? sp.player.vol(song.id) : (sp.player.vol ?? 1);
        // Where this hit sits in the mix: its strength, its robot's level and the band's headroom.
        const mix = hard * vol * BAND_GAIN;
        const late0 = delayS + (swingOffset(song, inBar) * ms) / 1000;
        let late = late0;
        if (h.drum) {
          const world = deps.audio.inst ? sp.player.perc?.(song.id, h.drum) : undefined;
          if (world) deps.audio.inst?.(world, undefined, hard, undefined, late, false, vol * BAND_GAIN);
          else deps.audio.drum(h.drum, late, mix);
          hits.push({ slot, drum: h.drum });
        } else if (h.p) {
          const midi = pitchOf(song, bar, h.p);
          late = late0 + Math.min(rolled++, 3) * STRUM_S;
          const voice: Voice = sp.player.voice?.(song.id) ?? sp.player.timbre;
          const freq = midiFreq(midi);
          const len = Math.max(MIN_NOTE_S, ((h.d * ms) / 1000) * RING);
          if (isInstrument(voice) && deps.audio.inst)
            deps.audio.inst(voice, freq, hard, Math.max(len, MIN_STRUCK_S), late, true, vol * BAND_GAIN);
          else deps.audio.note(freq, len, isInstrument(voice) ? sp.player.timbre : voice, late, mix);
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
      return { beat: ((((last.step + frac) / 4) % 4) + 4) % 4, bar: last.bar, song: last.song, idx: last.idx };
    },
    tick,
  };
}
