/**
 * Tiny Web Audio synthesizer. Every sound is generated, so the app ships no audio files
 * and works fully offline. All methods are silent no-ops until `unlock()` has run inside
 * a user gesture (browser autoplay policy) or when sound is disabled.
 */
import { LOUDNESS } from './loudness';
import { FILE_TRIM } from './loudness-files';
import { SFX_TAKES, sfxUrl } from './sfx';
import { VOICE_HZ } from './voicepitch';
import { renderCatNote } from './catvoice';
import { SCALE_C, noteFreq } from './music';
import type { RenderReply, RenderRequest } from './renderWorker';
import { HELD, INSTRUMENT_IDS, INSTRUMENT_REF, renderInstrument, type InstrumentId } from './instruments';

export type { InstrumentId };
/** World instruments the synth can render (see instruments.ts). */
export const INSTRUMENTS: readonly InstrumentId[] = INSTRUMENT_IDS;

export type Timbre = 'piano' | 'xylo' | 'bell' | 'guitar' | 'flute' | 'trumpet' | 'violin' | 'sax' | 'bass';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'tom' | 'clap' | 'cowbell' | 'shaker' | 'wood' | 'ride' | 'triangle' | 'crash';
/** Effects and voices the synth can make by itself. */
type SynthFx =
  | 'laser'
  | 'honk'
  | 'siren'
  | 'whistle'
  | 'slide'
  | 'zap'
  | 'sparkle'
  | 'kazoo'
  | 'roll'
  | 'cheer'
  | 'meow'
  | 'bark'
  | 'quack'
  | 'moo'
  | 'chirp'
  | 'roar'
  | 'frog'
  | 'pig'
  | 'owl'
  | 'elephant'
  | 'sheep'
  | 'cricket';
/**
 * Sound effects and voices. The animals and machines are recorded (see
 * src/core/sfx.ts) and the synth only stands in until the file has loaded; the
 * kinds after SynthFx exist only as recordings and borrow a neighbour's synth
 * voice (STAND_IN) meanwhile.
 */
export type FxKind =
  SynthFx | 'cluck' | 'horse' | 'goat' | 'monkey' | 'growl' | 'squeak' | 'parrot' | 'penguin' | 'horn' | 'train' | 'tractor';

export const TIMBRES: readonly Timbre[] = ['piano', 'xylo', 'bell', 'guitar', 'flute', 'trumpet', 'violin', 'sax', 'bass'];
export const DRUMS: readonly DrumKind[] = ['kick', 'snare', 'hat', 'tom', 'clap', 'cowbell', 'shaker', 'wood', 'ride', 'triangle', 'crash'];
export const FX: readonly FxKind[] = [
  'laser',
  'honk',
  'siren',
  'whistle',
  'slide',
  'zap',
  'sparkle',
  'kazoo',
  'roll',
  'cheer',
  'meow',
  'bark',
  'quack',
  'moo',
  'chirp',
  'roar',
  'frog',
  'pig',
  'owl',
  'elephant',
  'sheep',
  'cricket',
  'cluck',
  'horse',
  'goat',
  'monkey',
  'growl',
  'squeak',
  'parrot',
  'penguin',
  'horn',
  'train',
  'tractor',
];

/**
 * Every sound the engine can make, as one flat name. This is what the loudness
 * table is keyed on, so a new sound cannot be added without giving it a level.
 */
export type SoundId =
  | 'pop'
  | 'ding'
  | 'boing'
  | 'chomp'
  | 'tick'
  | 'jingle'
  | 'puff'
  | `note:${Timbre}`
  | `drum:${DrumKind}`
  | `inst:${InstrumentId}`
  | `fx:${FxKind}`
  /**
   * The recorded animal voices share one level: `scripts/sfx.mjs` already
   * normalises them against each other, so they only need bringing to the
   * house level as a group.
   */
  | 'sample'
  /** The cat that sings a note (catvoice.ts): synthesized, so it has a trim of its own. */
  | 'cat';

export interface AudioEngine {
  readonly enabled: boolean;
  /** Create/resume the AudioContext. Call from the first pointerdown. */
  unlock(): void;
  setEnabled(on: boolean): void;
  /** Short blip. `pitch` scales the base frequency (0.5 … 2). */
  pop(pitch?: number): void;
  /** Success bell. */
  ding(): void;
  /** Gentle "spring back" sound for a miss. Never harsh. */
  boing(): void;
  /** Eating sound. */
  chomp(): void;
  /** UI click. */
  tick(): void;
  /** Celebration arpeggio. */
  jingle(): void;
  /**
   * Musical note. `dur` in seconds. `timbre` picks the instrument (default piano).
   * `delay` (seconds, default 0) starts it that long from now on the audio clock, so a
   * sequencer can queue notes a little ahead and keep exact time.
   */
  note(freq: number, dur?: number, timbre?: Timbre, delay?: number, vel?: number): void;
  /** Percussion hit. `delay` (seconds, default 0) starts it that long from now. `vel` 0…1 scales the level. */
  drum(kind: DrumKind, delay?: number, vel?: number): void;
  /**
   * A world instrument (marimba, kalimba, gong…) at `freq` Hz, struck with `vel` 0…1.
   * `dur` only matters for the held ones (organ, accordion, harmonica, pan flute).
   * `delay` (seconds) starts it that long from now on the audio clock; with `damp`, a struck
   * instrument is also faded out over ~0.3 s once `dur` is up, so a sequencer can keep chords clean;
   * `gain` (default 1) sets its place in a mix without changing how hard it is struck.
   * Returns a handle that can damp it early (a hand on a gong), or null when silent.
   */
  inst(id: InstrumentId, freq?: number, vel?: number, dur?: number, delay?: number, damp?: boolean, gain?: number): InstVoice | null;
  /**
   * The audio clock in seconds, as every `delay` given in this task is measured from (0 when
   * silent). A sequencer that keeps its grid on this clock and passes `delay = target - clock()`
   * gets every note exactly on the grid, however the clock steps or the main thread stalls.
   */
  clock?(): number;
  /** A soft breath of air (blowing out a candle). */
  puff(): void;
  /** Sound effect / animal voice. */
  fx(kind: FxKind): void;
  /**
   * A voice singing the note `hz`. The meow is a cat voice built to hold one steady
   * pitch (src/core/catvoice.ts), so a tune can be heard in the cats. Any other voice
   * with a measured pitch (src/core/voicepitch.ts) is a recorded take retuned by playing
   * it faster or slower, and plays untuned when it has none. `gain` scales the level
   * (default 1); `maxDur` caps the length in seconds.
   */
  pitched(kind: FxKind, hz: number, opts?: { gain?: number; maxDur?: number }): void;
  /** Resolves once the voices requested so far are decoded (or known to be missing). */
  ready(): Promise<void>;
  /**
   * Play one of the app's own recordings (`public/…`, relative to the app root).
   * Fetched and decoded on first use and kept, so `preload` it ahead of the tap.
   * Resolves to a handle that can cut it short, or null when sound is off or the
   * file cannot play.
   */
  clip(url: string): Promise<Clip | null>;
  /** Fetch and decode recordings in the background so the first tap is instant. */
  preload(urls: readonly string[]): void;
  /**
   * Fetch and decode the recorded takes of these voices in the background.
   * Voices are otherwise loaded on first use (the first tap plays the synth),
   * so a game that leans on a few calls this from `start` to have them ready.
   */
  preloadFx(kinds: readonly FxKind[]): void;
  /**
   * Play a recording round and round until stopped, fading in — a background
   * (rain, birds, the sea) under everything else. Null when sound is off or the
   * file cannot play.
   */
  loop(url: string, volume?: number): Promise<Loop | null>;
}

export interface InstVoice {
  /** Fade it out over a few tens of milliseconds. */
  stop(): void;
}

export interface Loop {
  /** Glide to a new level (0…1) over a moment, so the mix never jumps. */
  setVolume(v: number): void;
  /** Fade out and let go. */
  stop(): void;
}

export interface Clip {
  /** Seconds. */
  readonly duration: number;
  /** Fade it out over a few milliseconds (a hard stop clicks). */
  stop(): void;
}

type Ctx = AudioContext;

/** The synthesized voice each recorded-only kind falls back to. */
const STAND_IN: Readonly<Record<Exclude<FxKind, SynthFx>, SynthFx>> = {
  cluck: 'chirp',
  horse: 'kazoo',
  goat: 'sheep',
  monkey: 'kazoo',
  growl: 'roar',
  squeak: 'chirp',
  parrot: 'chirp',
  penguin: 'chirp',
  horn: 'honk',
  train: 'whistle',
  tractor: 'honk',
};

/**
 * The bass exciter, which is what makes a kick or a distant boom exist at all on
 * a phone. A speaker that small cannot move air much below 400 Hz, so the deep
 * half of the sound never leaves the device and the child hears only the bells on
 * top of it. Rather than turn the low end up — which just eats headroom and
 * rattles the case — the low band is driven into a soft clipper and only the
 * harmonics it invents are mixed back in. The ear hears 200-600 Hz and puts the
 * missing fundamental back by itself; the untouched low end still goes out to the
 * dry path, so a real speaker still thumps.
 */
/** Gain after the compressor and exciter that brings the levelled sounds up to the house level (+3 dB). */
const MAKEUP = 1.4125;
/** The dip at the master that takes the sting out of 2-5 kHz: where, and how deep (dB). */
const SOFTEN_HZ = 3400;
const SOFTEN_DB = -2.5;
/** Everything below this is what a small speaker cannot play. */
const BASS_SPLIT_HZ = 160;
/** How hard that band is driven into the clipper. Higher = richer, grittier. */
const BASS_DRIVE = 6;
/** Only harmonics above this come back: below it we would be adding mud, not pitch. */
const BASS_HARMONICS_HZ = 200;
/** How much of the invented signal is mixed in. */
const BASS_MIX = 0.5;

/**
 * Asymmetric on purpose. A symmetric curve folds a sine into odd harmonics only
 * (3f, 5f, 7f), and for a 45 Hz kick the first of those is 135 Hz — still under
 * what a phone can play. Clipping harder on one side adds the even harmonics too,
 * so the series climbs into the band where a small speaker is actually working.
 * The DC offset that asymmetry leaves behind is removed by the highpass after it.
 */
function saturationCurve(n = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x >= 0 ? x : x * 0.5);
  }
  return curve;
}

/** What a recording is multiplied by: the shared sample trim, then its own (see loudness-files.ts). */
function fileGain(url: string | undefined): number {
  return LOUDNESS.sample * (url ? (FILE_TRIM[url] ?? 1) : 1);
}

/** iPhone/iPad, including iPadOS reporting itself as a Mac. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** A 0.2 s silent 8-bit mono WAV as a blob URL (built at runtime, no asset). */
function silentWavUrl(): string {
  const rate = 8000;
  const samples = rate / 5;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function createAudio(): AudioEngine {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  /**
   * iOS treats Web Audio as quiet "ambient" sound (muted by the silent switch, ducked
   * under speech). Looping a silent <audio> element inside the first gesture moves the
   * page to the "playback" session, so the synth plays at media volume. (The "unmute" trick.)
   */
  let keepAlive: HTMLAudioElement | null = null;

  function startKeepAlive(): void {
    if (keepAlive || !isIOS() || typeof Audio === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
    try {
      const el = new Audio(silentWavUrl());
      el.loop = true;
      el.setAttribute('playsinline', '');
      keepAlive = el;
      void el.play().catch(() => {
        keepAlive = null;
      });
    } catch {
      keepAlive = null;
    }
  }

  function getCtx(): Ctx | null {
    if (!enabled || !ctx) return null;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  }

  /**
   * Recorded animal voices, decoded and ready to play. A voice with none here
   * keeps its synthesized version, so a missing or unplayable file is a
   * downgrade rather than silence.
   */
  const takes = new Map<FxKind, AudioBuffer[]>();
  /** The measured pitch of a decoded take, when it has one (see voicepitch.ts). */
  const takeHz = new WeakMap<AudioBuffer, number>();
  /** Which file a decoded take came from, for its trim (see loudness-files.ts). */
  const takeUrl = new WeakMap<AudioBuffer, string>();
  /** One load per voice, started the first time it is asked for. */
  const loading = new Map<FxKind, Promise<void>>();

  /**
   * Fetch and decode one voice's takes in the background. Nothing waits on this:
   * a tap on a voice that has not landed plays the synth, and the recording takes
   * over from the next tap. Nothing is fetched until a voice is wanted, so the
   * Home screen costs no audio at all.
   */
  function loadVoice(kind: FxKind): Promise<void> {
    const started = loading.get(kind);
    if (started) return started;
    const c = ctx;
    const count = SFX_TAKES[kind] ?? 0;
    if (!c || count === 0 || typeof fetch !== 'function') return Promise.resolve();
    const base = import.meta.env.BASE_URL;
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      jobs.push(
        fetch(`${base}${sfxUrl(kind, i)}`)
          .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
          .then((raw) => c.decodeAudioData(raw))
          .then((buf) => {
            const list = takes.get(kind);
            if (list) list.push(buf);
            else takes.set(kind, [buf]);
            const hz = VOICE_HZ[kind]?.[i];
            if (hz) takeHz.set(buf, hz);
            takeUrl.set(buf, sfxUrl(kind, i));
          })
          .catch(() => undefined),
      );
    }
    const job = Promise.all(jobs).then(() => undefined);
    loading.set(kind, job);
    return job;
  }

  function unlock(): void {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      return;
    }
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.85;
      // Every sound is levelled at source (see loudness.ts), so the compressor only has
      // to catch chords and drum rolls stacking up — not to rescue a 30 dB spread.
      let sink: AudioNode = ctx.destination;
      try {
        // Tame hiss from noise-based sounds on small tablet speakers (and little ears).
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 9000;
        tone.Q.value = 0.5;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 10;
        comp.ratio.value = 3;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        // The house level (scripts/lib/loudness-common.mjs) is reached here, after the compressor
        // and the bass exciter, not by trimming every sound hotter before them: driven 3 dB harder,
        // the exciter's saturation and the compressor thickened the kick into a dull thump that
        // ducked the band (measured: a held chord dipped 4.7 dB under each kick, and 2-5 kHz rose
        // 1.5 dB with it), and that is what made a guitar sound harsh.
        const makeup = ctx.createGain();
        makeup.gain.value = MAKEUP;
        // A safety ceiling at the very end, for the rare stack of hits that would clip a speaker.
        // Hard knee and a slow release so it neither pumps nor rasps; the sounds are levelled with
        // headroom under it (BY_EAR_DB), so it only acts on the rare stack of hits.
        const limit = ctx.createDynamicsCompressor();
        limit.threshold.value = -1.5;
        limit.knee.value = 0;
        limit.ratio.value = 20;
        limit.attack.value = 0.001;
        limit.release.value = 0.25;
        limit.connect(ctx.destination);
        makeup.connect(limit);
        comp.connect(makeup);
        // Small speakers are sharpest at 2-5 kHz and a child's ear is most tender there.
        // A broad dip of a couple of dB keeps whistles, chirps and cymbals from stinging
        // without taking the top off them (the lowpass above already trims the hiss).
        const soften = ctx.createBiquadFilter();
        soften.type = 'peaking';
        soften.frequency.value = SOFTEN_HZ;
        soften.Q.value = 0.8;
        soften.gain.value = SOFTEN_DB;
        soften.connect(comp);
        tone.connect(soften);
        sink = tone;
      } catch {
        /* no compressor: connect straight to the destination */
      }
      master.connect(sink);
      try {
        // The exciter runs beside the dry path, not in it: nothing is taken away,
        // the harmonics are added on top. See BASS_SPLIT_HZ above.
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = BASS_SPLIT_HZ;
        low.Q.value = 0.7;
        const drive = ctx.createGain();
        drive.gain.value = BASS_DRIVE;
        const shaper = ctx.createWaveShaper();
        shaper.curve = saturationCurve();
        const keep = ctx.createBiquadFilter();
        keep.type = 'highpass';
        keep.frequency.value = BASS_HARMONICS_HZ;
        keep.Q.value = 0.7;
        const mix = ctx.createGain();
        mix.gain.value = BASS_MIX;
        master.connect(low).connect(drive).connect(shaper).connect(keep).connect(mix).connect(sink);
      } catch {
        /* no wave shaper: the dry path alone, as before */
      }
      void ctx.resume().catch(() => undefined);
      startKeepAlive();
    } catch {
      ctx = null;
      master = null;
    }
  }

  /**
   * Loudness trim of the sound being built right now. Set for the whole of one
   * public call, so every oscillator and burst of noise inside it is scaled
   * together and the sound keeps its internal balance.
   */
  let trim = 1;
  /** Seconds to push the sound being built into the future (see `note`/`drum`'s `delay`). */
  let shift = 0;

  /**
   * The audio clock moves in steps (a render quantum: 2.7 ms in Chrome, often more on
   * iOS). Reading `currentTime` afresh for each note let two notes meant for the same
   * instant land a step apart (measured in the robot band: notes asked for 0.1 ms apart
   * started 2.7-5.3 ms apart). So one read serves a whole task: every note a game
   * schedules in one go is measured from the same instant. See also `clock()`.
   */
  let taskNow = -1;
  function nowOf(c: Ctx): number {
    if (taskNow < 0) {
      taskNow = c.currentTime;
      queueMicrotask(() => {
        taskNow = -1;
      });
    }
    return taskNow;
  }

  /** When the sound being built starts: now, or `shift` seconds after the instant this task began measuring from. */
  function startTime(c: Ctx): number {
    return shift > 0 ? Math.max(c.currentTime, nowOf(c) + shift) : c.currentTime;
  }

  function at<T>(id: SoundId, play: () => T, delay = 0, vel = 1): T {
    trim = (LOUDNESS[id] ?? 1) * (Number.isFinite(vel) ? Math.min(1.5, Math.max(0, vel)) : 1);
    shift = Number.isFinite(delay) && delay > 0 ? delay : 0;
    try {
      return play();
    } finally {
      trim = 1;
      shift = 0;
    }
  }

  interface ToneOpts {
    gain?: number;
    at?: number;
    slideTo?: number;
    attack?: number;
    /** Hold at peak until `dur - release` instead of decaying immediately. */
    sustain?: boolean;
    release?: number;
    detune?: number;
    filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
    vibrato?: { hz: number; depth: number };
  }

  /** Oscillator with an envelope, optional filter and vibrato. */
  function tone(type: OscillatorType, freq: number, dur: number, opts: ToneOpts = {}): void {
    const c = getCtx();
    if (!c || !master || freq <= 0) return;
    try {
      const t0 = startTime(c) + (opts.at ?? 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.detune) osc.detune.value = opts.detune;
      if (opts.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      const peak = (opts.gain ?? 0.6) * trim;
      const attack = opts.attack ?? 0.005;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      if (opts.sustain) {
        const rel = Math.min(opts.release ?? 0.1, dur);
        g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - rel));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else {
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      }
      let head: AudioNode = osc;
      if (opts.filter) {
        const f = c.createBiquadFilter();
        f.type = opts.filter.type;
        f.frequency.setValueAtTime(opts.filter.freq, t0);
        if (opts.filter.to) f.frequency.exponentialRampToValueAtTime(opts.filter.to, t0 + dur);
        if (opts.filter.q) f.Q.value = opts.filter.q;
        head.connect(f);
        head = f;
      }
      if (opts.vibrato) {
        const lfo = c.createOscillator();
        const lfoGain = c.createGain();
        lfo.frequency.value = opts.vibrato.hz;
        lfoGain.gain.value = opts.vibrato.depth;
        lfo.connect(lfoGain).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.05);
      }
      head.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      /* closed context or unsupported node: stay silent */
    }
  }

  function noise(
    dur: number,
    opts: {
      gain?: number;
      at?: number;
      /** `to` sweeps the cutoff over `dur` — a mouth closing, a bucket emptying. */
      filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
      decay?: boolean;
    } = {},
  ): void {
    const c = getCtx();
    if (!c || !master) return;
    try {
      const t0 = startTime(c) + (opts.at ?? 0);
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      const decay = opts.decay ?? true;
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (decay ? 1 - i / len : 1);
      const src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = opts.filter?.type ?? 'lowpass';
      filter.frequency.setValueAtTime(opts.filter?.freq ?? 1200, t0);
      if (opts.filter?.to) filter.frequency.exponentialRampToValueAtTime(opts.filter.to, t0 + dur);
      if (opts.filter?.q) filter.Q.value = opts.filter.q;
      const g = c.createGain();
      g.gain.value = (opts.gain ?? 0.5) * trim;
      src.connect(filter).connect(g).connect(master);
      src.start(t0);
    } catch {
      /* silent */
    }
  }

  /** Karplus-Strong plucked string rendered offline into a buffer. */
  function pluck(freq: number, dur: number, gain = 0.7): void {
    const c = getCtx();
    if (!c || !master || freq <= 0) return;
    try {
      const sr = c.sampleRate;
      const n = Math.max(2, Math.round(sr / freq));
      const len = Math.floor(sr * dur);
      const buf = c.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      const ring = new Float32Array(n);
      for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const cur = ring[idx] ?? 0;
        const next = ring[(idx + 1) % n] ?? 0;
        out[i] = cur;
        ring[idx] = 0.996 * 0.5 * (cur + next);
        idx = (idx + 1) % n;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain * trim;
      src.connect(g).connect(master);
      src.start(startTime(c));
    } catch {
      /* silent */
    }
  }

  function playNote(freq: number, dur: number, timbre: Timbre): void {
    switch (timbre) {
      case 'xylo':
        tone('sine', freq, Math.min(dur, 0.7), { gain: 0.6, attack: 0.002 });
        tone('sine', freq * 2.76, Math.min(dur, 0.25), { gain: 0.18, attack: 0.002 });
        tone('triangle', freq * 4, 0.08, { gain: 0.1, attack: 0.001 });
        return;
      case 'bell':
        tone('sine', freq, dur * 1.6, { gain: 0.5, attack: 0.003 });
        tone('sine', freq * 2, dur * 1.1, { gain: 0.25, attack: 0.003 });
        tone('sine', freq * 3, dur * 0.7, { gain: 0.12, attack: 0.003 });
        tone('sine', freq * 4.2, dur * 0.4, { gain: 0.08, attack: 0.003 });
        return;
      case 'guitar':
        pluck(freq, Math.max(dur, 0.8), 0.45);
        return;
      case 'bass':
        // Soft, round bass: no Karplus-Strong buzz at low frequencies (it hurt little ears).
        tone('sine', freq, dur, { gain: 0.5, attack: 0.01, sustain: true, release: 0.12 });
        tone('triangle', freq, dur * 0.7, { gain: 0.18, attack: 0.01, filter: { type: 'lowpass', freq: 600 } });
        return;
      case 'flute':
        tone('sine', freq, dur, { gain: 0.5, attack: 0.06, sustain: true, release: 0.12, vibrato: { hz: 5.5, depth: freq * 0.012 } });
        tone('triangle', freq * 2, dur, { gain: 0.06, attack: 0.08, sustain: true, release: 0.12 });
        noise(Math.min(dur, 0.15), { gain: 0.05, filter: { type: 'bandpass', freq: freq * 2, q: 2 } });
        return;
      case 'trumpet':
        tone('sawtooth', freq, dur, {
          gain: 0.35,
          attack: 0.03,
          sustain: true,
          release: 0.08,
          filter: { type: 'lowpass', freq: 2400, to: 1400, q: 1.2 },
        });
        tone('square', freq, dur, { gain: 0.08, attack: 0.03, sustain: true, release: 0.08, filter: { type: 'lowpass', freq: 1200 } });
        return;
      case 'sax':
        tone('sawtooth', freq, dur, {
          gain: 0.3,
          attack: 0.05,
          sustain: true,
          release: 0.12,
          filter: { type: 'lowpass', freq: 1500, q: 3 },
          vibrato: { hz: 5, depth: freq * 0.01 },
        });
        tone('square', freq / 2, dur, { gain: 0.08, attack: 0.05, sustain: true, release: 0.12, filter: { type: 'lowpass', freq: 800 } });
        return;
      case 'violin':
        tone('sawtooth', freq, dur, {
          gain: 0.22,
          attack: 0.12,
          sustain: true,
          release: 0.18,
          detune: -5,
          filter: { type: 'lowpass', freq: 2600, q: 0.8 },
          vibrato: { hz: 6, depth: freq * 0.008 },
        });
        tone('sawtooth', freq, dur, {
          gain: 0.22,
          attack: 0.12,
          sustain: true,
          release: 0.18,
          detune: 5,
          filter: { type: 'lowpass', freq: 2600, q: 0.8 },
        });
        return;
      case 'piano':
      default:
        tone('triangle', freq, dur, { gain: 0.5, attack: 0.01 });
        tone('sine', freq * 2, dur * 0.6, { gain: 0.12, attack: 0.01 });
        return;
    }
  }

  /**
   * The six inharmonic square oscillators a TR-808 uses for its cymbals. A cluster
   * like this rings like metal; broadband noise on its own just hisses, which is
   * what made the old crash and ride so tiring to listen to.
   */
  const METAL_HZ: readonly number[] = [205.3, 304.4, 369.6, 522.7, 540, 800];

  function metal(pitch: number, dur: number, gain: number, hp: number, at = 0): void {
    const each = gain / METAL_HZ.length;
    for (const f of METAL_HZ) {
      tone('square', f * pitch, dur, { gain: each, at, attack: 0.001, filter: { type: 'highpass', freq: hp, q: 0.7 } });
    }
  }

  function playDrum(kind: DrumKind): void {
    switch (kind) {
      case 'kick':
        // The deep half of a kick is the half a phone throws away, so it does not
        // get to eat all the headroom either: enough for a real speaker to thump
        // with, and the rest spent on the beater, which every speaker can play.
        tone('sine', 150, 0.4, { gain: 0.85, attack: 0.002, slideTo: 40 });
        noise(0.03, { gain: 0.35, filter: { type: 'lowpass', freq: 700 } });
        return;
      case 'snare':
        noise(0.22, { gain: 1.0, filter: { type: 'bandpass', freq: 1800, q: 0.8 } });
        tone('triangle', 200, 0.12, { gain: 0.6, attack: 0.002, slideTo: 120 });
        return;
      case 'hat':
        noise(0.07, { gain: 0.4, filter: { type: 'highpass', freq: 6000 } });
        return;
      case 'tom':
        tone('sine', 220, 0.35, { gain: 0.85, attack: 0.002, slideTo: 90 });
        // The stick landing on the skin. Without it a tom is a bare low sine, which
        // a small speaker turns into silence and a big one into a hum.
        noise(0.025, { gain: 0.28, filter: { type: 'bandpass', freq: 700, q: 0.8 } });
        return;
      case 'clap':
        noise(0.03, { gain: 0.8, filter: { type: 'bandpass', freq: 1200, q: 1 } });
        noise(0.03, { gain: 0.8, at: 0.012, filter: { type: 'bandpass', freq: 1200, q: 1 } });
        noise(0.2, { gain: 0.75, at: 0.024, filter: { type: 'bandpass', freq: 1200, q: 1 } });
        return;
      case 'cowbell':
        tone('square', 560, 0.25, { gain: 0.45, attack: 0.002, filter: { type: 'bandpass', freq: 700, q: 3 } });
        tone('square', 845, 0.25, { gain: 0.45, attack: 0.002, filter: { type: 'bandpass', freq: 850, q: 3 } });
        return;
      case 'shaker':
        noise(0.09, { gain: 0.35, filter: { type: 'highpass', freq: 4500 } });
        noise(0.06, { gain: 0.2, at: 0.05, filter: { type: 'highpass', freq: 5000 } });
        return;
      case 'wood':
        // Long enough to carry some energy: at 70 ms it was so short that reaching the house
        // level took a trim that put its peak against the master's ceiling.
        tone('sine', 1100, 0.14, { gain: 0.7, attack: 0.001, slideTo: 700 });
        tone('sine', 1650, 0.05, { gain: 0.2, attack: 0.001, slideTo: 1050 });
        return;
      case 'ride':
        // A ride is mostly the stick: a defined ping, then a short shimmer of metal.
        noise(0.025, { gain: 0.3, filter: { type: 'bandpass', freq: 3200, q: 2.5 } });
        metal(1.7, 0.85, 0.55, 3600);
        noise(0.14, { gain: 0.07, filter: { type: 'bandpass', freq: 4200, to: 2600, q: 0.9 } });
        return;
      case 'triangle':
        tone('sine', 2900, 0.9, { gain: 0.35, attack: 0.002 });
        tone('sine', 4300, 0.6, { gain: 0.15, attack: 0.002 });
        return;
      case 'crash':
        // Metal ringing down, with just a breath of air behind it instead of a wall of hiss.
        metal(1, 1.5, 0.62, 2600);
        noise(0.4, { gain: 0.12, filter: { type: 'bandpass', freq: 4200, to: 1600, q: 0.5 } });
        return;
    }
  }

  function playFx(kind: FxKind): void {
    switch (kind) {
      case 'laser':
        tone('sawtooth', 1400, 0.28, { gain: 0.35, attack: 0.002, slideTo: 180, filter: { type: 'lowpass', freq: 3000 } });
        return;
      case 'honk':
        tone('square', 230, 0.4, {
          gain: 0.18,
          attack: 0.02,
          sustain: true,
          release: 0.1,
          filter: { type: 'lowpass', freq: 900 },
          vibrato: { hz: 7, depth: 6 },
        });
        tone('sawtooth', 345, 0.4, { gain: 0.07, attack: 0.02, sustain: true, release: 0.1, filter: { type: 'lowpass', freq: 1200 } });
        return;
      case 'siren': {
        // Two-tone fire engine: a fourth apart, four swaps, kept soft by a lowpass
        // so it reads as "xe cứu hoả" rather than a real emergency in the room.
        const swap = 0.22;
        [740, 988, 740, 988].forEach((f, i) => {
          tone('square', f, swap, {
            gain: 0.14,
            attack: 0.012,
            at: i * swap,
            sustain: true,
            release: 0.05,
            filter: { type: 'lowpass', freq: 1400 },
          });
          tone('sine', f * 2, swap, { gain: 0.05, attack: 0.012, at: i * swap, sustain: true, release: 0.05 });
        });
        return;
      }
      case 'whistle':
        // Moved down a fifth, out of the 2–5 kHz band where an ear — a child's
        // most of all — is at its most sensitive. The loudness pass can level a
        // 2.4 kHz sine against a kick, but levelling is not the same as taking
        // the edge off: a pure tone at the top of the ear's response stays sharp
        // however far it is turned down. A person whistling lives around 1 kHz
        // anyway, so this is the more honest whistle as well as the kinder one.
        tone('sine', 1000, 0.25, { gain: 0.4, attack: 0.02, slideTo: 1600 });
        tone('sine', 1600, 0.35, { gain: 0.4, attack: 0.01, at: 0.25, slideTo: 950 });
        return;
      case 'slide':
        tone('sine', 2200, 0.6, { gain: 0.4, attack: 0.02, sustain: true, release: 0.1, slideTo: 500 });
        return;
      case 'zap':
        tone('square', 90, 0.18, { gain: 0.35, attack: 0.002, slideTo: 900, filter: { type: 'lowpass', freq: 2500 } });
        return;
      case 'sparkle':
        // The same chord an octave down — G major and its octave, note for note,
        // just no longer sitting on top of the ear. Four pure sines held half a
        // second each, stacked, with the top one at 3.1 kHz, was the sharpest
        // thing in the set: sparkle is triggered by a tap on a star, a butterfly,
        // a pad, over and over, and the loudness pass can only make it sit at the
        // house level, not stop it stinging there. Down here it reads as a music
        // box rather than a smoke alarm, and it still climbs.
        [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, 0.5, { gain: 0.3, attack: 0.005, at: i * 0.06 }));
        return;
      case 'kazoo':
        tone('sawtooth', 330, 0.5, {
          gain: 0.25,
          attack: 0.03,
          sustain: true,
          release: 0.1,
          filter: { type: 'bandpass', freq: 1200, q: 2 },
          vibrato: { hz: 9, depth: 12 },
        });
        return;
      case 'roll': {
        // A snare roll, not a machine gun: uneven strokes that speed up and swell,
        // the drum body only every other stroke, and one accent to finish.
        let at = 0;
        let gap = 0.055;
        for (let i = 0; i < 22; i++) {
          const swell = 0.08 + (0.24 * i) / 21;
          noise(0.038, { at, gain: swell * (0.75 + Math.random() * 0.5), filter: { type: 'bandpass', freq: 2000, to: 1200, q: 0.7 } });
          if (i % 2 === 0) tone('triangle', 185, 0.05, { gain: swell * 0.5, attack: 0.002, at, slideTo: 150 });
          at += gap;
          gap = Math.max(0.028, gap * 0.955);
        }
        noise(0.2, { at, gain: 0.24, filter: { type: 'bandpass', freq: 1800, q: 0.8 } });
        tone('triangle', 200, 0.12, { gain: 0.2, attack: 0.002, at, slideTo: 120 });
        return;
      }
      case 'cheer':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('triangle', f, 0.35, { gain: 0.45, at: i * 0.08 }));
        noise(0.6, { gain: 0.15, at: 0.3, filter: { type: 'bandpass', freq: 2500, q: 0.4 } });
        return;
      case 'meow':
        // "mee-ow": nasal sawtooth through a moving vowel formant
        tone('sawtooth', 520, 0.28, {
          gain: 0.22,
          attack: 0.04,
          slideTo: 880,
          filter: { type: 'bandpass', freq: 1500, to: 2400, q: 2.5 },
          vibrato: { hz: 6, depth: 14 },
        });
        tone('sawtooth', 880, 0.4, {
          gain: 0.22,
          attack: 0.01,
          at: 0.28,
          slideTo: 420,
          filter: { type: 'bandpass', freq: 2400, to: 900, q: 2.5 },
          vibrato: { hz: 6, depth: 14 },
        });
        tone('sine', 520, 0.28, { gain: 0.12, attack: 0.04, slideTo: 880 });
        tone('sine', 880, 0.4, { gain: 0.12, attack: 0.01, at: 0.28, slideTo: 420 });
        return;
      case 'bark':
        // "woof woof": two short growly bursts with a throat formant
        [0, 0.22].forEach((t) => {
          noise(0.05, { gain: 0.35, at: t, filter: { type: 'bandpass', freq: 800, q: 1 } });
          tone('sawtooth', 240, 0.16, {
            gain: 0.32,
            attack: 0.004,
            at: t,
            slideTo: 120,
            filter: { type: 'bandpass', freq: 700, to: 400, q: 1.5 },
          });
          tone('square', 120, 0.14, { gain: 0.12, attack: 0.004, at: t, slideTo: 80, filter: { type: 'lowpass', freq: 500 } });
        });
        return;
      case 'quack':
        // "quack quack": buzzy reed with a "wa" formant sweep
        [0, 0.2].forEach((t) => {
          tone('sawtooth', 300, 0.16, {
            gain: 0.3,
            attack: 0.006,
            at: t,
            slideTo: 230,
            filter: { type: 'bandpass', freq: 1400, to: 700, q: 3 },
            vibrato: { hz: 25, depth: 12 },
          });
          tone('square', 150, 0.16, { gain: 0.1, attack: 0.006, at: t, slideTo: 115, filter: { type: 'lowpass', freq: 900 } });
        });
        return;
      case 'moo':
        // "m-oooo": starts closed (dark), opens up, then falls
        tone('sawtooth', 110, 1.0, {
          gain: 0.32,
          attack: 0.15,
          sustain: true,
          release: 0.3,
          slideTo: 90,
          filter: { type: 'lowpass', freq: 300, to: 700 },
          vibrato: { hz: 4.5, depth: 3 },
        });
        tone('sawtooth', 165, 0.9, {
          gain: 0.12,
          attack: 0.2,
          sustain: true,
          release: 0.3,
          slideTo: 135,
          filter: { type: 'lowpass', freq: 600 },
        });
        return;
      case 'chirp':
        // Three tweets that are not the same tweet: up, down, up.
        [
          { at: 0, from: 2400, to: 3500 },
          { at: 0.1, from: 3500, to: 2500 },
          { at: 0.2, from: 2600, to: 3900 },
        ].forEach((c) => {
          tone('sine', c.from, 0.07, { gain: 0.3, attack: 0.004, at: c.at, slideTo: c.to });
          tone('triangle', c.from * 2, 0.05, { gain: 0.05, attack: 0.004, at: c.at, slideTo: c.to * 2 });
        });
        return;
      case 'roar':
        // A growl that opens out and dies back: a rasping throat over moving air.
        tone('sawtooth', 88, 0.9, {
          gain: 0.3,
          attack: 0.09,
          sustain: true,
          release: 0.32,
          slideTo: 62,
          filter: { type: 'lowpass', freq: 240, to: 720, q: 2 },
          vibrato: { hz: 26, depth: 11 },
        });
        tone('sawtooth', 132, 0.85, {
          gain: 0.1,
          attack: 0.13,
          sustain: true,
          release: 0.3,
          slideTo: 95,
          filter: { type: 'lowpass', freq: 900 },
        });
        noise(0.8, { gain: 0.2, filter: { type: 'lowpass', freq: 800, to: 260 } });
        return;
      case 'frog':
        // "ộp ộp": a rasping croak — a reed shaken hard, closing as it ends.
        [0, 0.27].forEach((t) => {
          tone('sawtooth', 150, 0.2, {
            gain: 0.9,
            attack: 0.012,
            at: t,
            slideTo: 112,
            filter: { type: 'bandpass', freq: 720, to: 420, q: 2.5 },
            vibrato: { hz: 38, depth: 55 },
          });
          noise(0.13, { at: t + 0.02, gain: 0.22, filter: { type: 'bandpass', freq: 900, to: 480, q: 2 } });
        });
        return;
      case 'pig':
        // "oink": fast throat trill plus a snorty puff
        tone('sawtooth', 170, 0.22, {
          gain: 0.3,
          attack: 0.01,
          slideTo: 130,
          filter: { type: 'bandpass', freq: 650, q: 2 },
          vibrato: { hz: 22, depth: 45 },
        });
        noise(0.12, { gain: 0.3, at: 0.05, filter: { type: 'bandpass', freq: 450, q: 1.5 } });
        return;
      case 'owl':
        // "hu… huuu": breathy hoots that scoop up into the note and settle.
        [
          { at: 0, dur: 0.3, hz: 470 },
          { at: 0.38, dur: 0.5, hz: 440 },
        ].forEach((hoot) => {
          tone('sine', hoot.hz * 0.9, hoot.dur, {
            gain: 0.1,
            attack: 0.07,
            at: hoot.at,
            sustain: true,
            release: 0.16,
            slideTo: hoot.hz,
            filter: { type: 'lowpass', freq: 900 },
            vibrato: { hz: 5, depth: 4 },
          });
          tone('sine', hoot.hz * 2, hoot.dur, { gain: 0.025, attack: 0.09, at: hoot.at, sustain: true, release: 0.16 });
          noise(hoot.dur * 0.45, { at: hoot.at, gain: 0.035, filter: { type: 'bandpass', freq: 700, q: 1.5 } });
        });
        return;
      case 'elephant':
        // A trumpet blare: up fast, held bright, then falling away.
        tone('sawtooth', 220, 0.45, {
          gain: 0.36,
          attack: 0.04,
          sustain: true,
          release: 0.06,
          slideTo: 620,
          filter: { type: 'bandpass', freq: 900, to: 2000, q: 1.5 },
          vibrato: { hz: 6, depth: 10 },
        });
        tone('sawtooth', 620, 0.4, {
          gain: 0.3,
          attack: 0.02,
          at: 0.45,
          sustain: true,
          release: 0.22,
          slideTo: 300,
          filter: { type: 'bandpass', freq: 2000, to: 800, q: 1.5 },
        });
        tone('square', 110, 0.7, { gain: 0.08, attack: 0.05, sustain: true, release: 0.2, filter: { type: 'lowpass', freq: 400 } });
        return;
      case 'sheep':
        // "beeee": the bleat wobbles harder and drops as the breath runs out.
        tone('sawtooth', 330, 0.55, {
          gain: 0.24,
          attack: 0.03,
          sustain: true,
          release: 0.2,
          slideTo: 250,
          filter: { type: 'bandpass', freq: 1100, to: 700, q: 2 },
          vibrato: { hz: 13, depth: 26 },
        });
        tone('sawtooth', 330, 0.5, {
          gain: 0.07,
          attack: 0.05,
          sustain: true,
          release: 0.2,
          slideTo: 250,
          detune: 12,
          filter: { type: 'lowpass', freq: 1600 },
        });
        return;
      case 'cricket':
        // Three bursts of three: a dry little trill, high up and quiet.
        for (let burst = 0; burst < 3; burst++) {
          for (let i = 0; i < 3; i++) {
            const at = burst * 0.22 + i * 0.035;
            tone('sine', 4400, 0.022, { gain: 0.17, attack: 0.002, at });
            noise(0.02, { at, gain: 0.05, filter: { type: 'bandpass', freq: 4600, q: 6 } });
          }
        }
        return;
      default:
        // Recorded-only voices borrow the nearest synth until their file lands.
        playFx(STAND_IN[kind]);
    }
  }

  function note(freq: number, dur = 0.5, timbre: Timbre = 'piano', delay = 0, vel = 1): void {
    at(`note:${timbre}`, () => playNote(freq, dur, timbre), delay, vel);
  }

  /**
   * A worker that renders the computed notes (sung cats, world instruments) so that the
   * first time each is played costs the main thread a message, not tens to hundreds of
   * milliseconds of arithmetic in the middle of a game. Null where there are no workers
   * (tests, very old browsers) or once one has failed: those render in place, as before.
   */
  let worker: Worker | null | undefined;
  let nextJob = 1;
  const waiting = new Map<number, (data: Float32Array | null) => void>();

  type Job = Omit<Extract<RenderRequest, { kind: 'cat' }>, 'id'> | Omit<Extract<RenderRequest, { kind: 'inst' }>, 'id'>;

  function giveUpWorker(): void {
    worker?.terminate();
    worker = null;
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
  }

  /** Resolves with the samples, or null if the worker could not make them; null at once when there is no worker. */
  function renderOffThread(job: Job): Promise<Float32Array | null> | null {
    if (worker === undefined) {
      worker = null;
      if (typeof Worker !== 'undefined') {
        try {
          const w = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });
          w.onmessage = (e: MessageEvent<RenderReply>) => {
            const resolve = waiting.get(e.data.id);
            waiting.delete(e.data.id);
            resolve?.(e.data.data);
          };
          w.onerror = giveUpWorker;
          worker = w;
        } catch {
          worker = null;
        }
      }
    }
    const w = worker;
    if (!w) return null;
    const id = nextJob++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      try {
        w.postMessage({ ...job, id } as RenderRequest);
      } catch {
        waiting.delete(id);
        resolve(null);
      }
    });
  }

  /** How long after a tap its sound may still come, when it had to be loaded or rendered first (s). */
  const LATE_TAP_S = 0.25;
  /** The same for a recording still being fetched: a cow that moos a second late is still the cow (s). */
  const LATE_LOAD_S = 1.5;
  /** How late a note rendered off the main thread may still start (s). */
  const LATE_NOTE_S = 0.03;
  /** OfflineAudioContext where it exists: offline renders (the level scripts) render notes in place. */
  const OfflineAudioContextCtor = (): typeof OfflineAudioContext =>
    (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ?? (class {} as unknown as typeof OfflineAudioContext);

  /** Rendered notes, most recently used last: a repeated tap costs no DSP. */
  const instCache = new Map<string, AudioBuffer>();
  const INST_KEPT = 128;


  function keepInst(key: string, c: Ctx, data: Float32Array): AudioBuffer {
    const buf = c.createBuffer(1, data.length, c.sampleRate);
    buf.getChannelData(0).set(data);
    instCache.set(key, buf);
    while (instCache.size > INST_KEPT) instCache.delete(instCache.keys().next().value as string);
    return buf;
  }

  function playInst(id: InstrumentId, freq: number, vel: number, dur?: number, damp = false): InstVoice | null {
    const c = getCtx();
    if (!c || !master) return null;
    try {
      const v = Math.round(Math.min(1, Math.max(0, vel)) * 5) / 5;
      const f = freq > 0 ? freq : INSTRUMENT_REF[id];
      // Only the held instruments (organ, reeds, pan flute) render differently for a different length.
      const key = `${id}|${Math.round(f * 10)}|${v}|${dur && HELD.has(id) ? (Math.round(dur * 20) / 20).toFixed(2) : ''}`;
      const level = trim * (0.95 + Math.random() * 0.1);
      const t0 = startTime(c);
      const cached = instCache.get(key);
      if (cached) {
        instCache.delete(key);
        instCache.set(key, cached);
        return strike(c, cached, level, t0, dur, damp);
      }
      // A note asked for ahead of time (a sequencer's) is rendered off the main thread and
      // started at its time when ready; one for right now (a tap) is rendered here, so the
      // child hears the instrument and not a stand-in.
      const job = shift > 0 && !(c instanceof OfflineAudioContextCtor()) ? renderInst(key, c, id, f, v, dur) : null;
      if (!job) return strike(c, keepInst(key, c, renderInstrument(id, f, v, c.sampleRate, { dur })), level, t0, dur, damp);
      let voice: InstVoice | null = null;
      let stopped = false;
      void job.then((buf) => {
        // Too late to be in time: a missing note is better than one out of time.
        if (!buf || stopped || c.currentTime > t0 + LATE_NOTE_S) return;
        try {
          voice = strike(c, buf, level, Math.max(t0, c.currentTime), dur, damp);
        } catch {
          /* the context went away while it rendered */
        }
      });
      return {
        stop() {
          stopped = true;
          voice?.stop();
        },
      };
    } catch {
      return null;
    }
  }

  /** One rendered note into the mix at `t0`. */
  function strike(c: Ctx, buf: AudioBuffer, level: number, t0: number, dur: number | undefined, damp: boolean): InstVoice | null {
    if (!master) return null;
    const src = c.createBufferSource();
    src.buffer = buf;
    // A hair of random pitch and level, so ten taps are not one sample ten times.
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.006;
    const g = c.createGain();
    g.gain.value = level;
    src.connect(g).connect(master);
    src.start(t0);
    if (damp && dur && dur > 0) {
      // A struck note rings on; let it go when its written length is up so chords stay clean.
      g.gain.setValueAtTime(level, t0 + dur);
      g.gain.linearRampToValueAtTime(0, t0 + dur + 0.3);
      src.stop(t0 + dur + 0.35);
    }
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          const now = c.currentTime;
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + 0.06);
          src.stop(now + 0.08);
        } catch {
          /* already over */
        }
      },
    };
  }

  /** The same note asked for twice while it renders shares one job. */
  const instJobs = new Map<string, Promise<AudioBuffer | null>>();
  function renderInst(key: string, c: Ctx, id: InstrumentId, freq: number, vel: number, dur?: number): Promise<AudioBuffer | null> | null {
    const running = instJobs.get(key);
    if (running) return running;
    const job = renderOffThread({ kind: 'inst', inst: id, freq, vel, sampleRate: c.sampleRate, dur });
    if (!job) return null;
    const done = job.then((data) => {
      instJobs.delete(key);
      return data ? keepInst(key, c, data) : null;
    });
    instJobs.set(key, done);
    return done;
  }

  function inst(id: InstrumentId, freq?: number, vel = 1, dur?: number, delay = 0, damp = false, gain = 1): InstVoice | null {
    return at(`inst:${id}`, () => playInst(id, freq ?? INSTRUMENT_REF[id], vel, dur, damp), delay, gain);
  }

  function drum(kind: DrumKind, delay = 0, vel = 1): void {
    at(`drum:${kind}`, () => playDrum(kind), delay, vel);
  }

  /**
   * One of the recorded takes of this animal, picked at random so that twenty
   * taps are twenty slightly different cats. False when there are none.
   */
  function playTake(kind: FxKind): boolean {
    const list = takes.get(kind);
    const c = getCtx();
    if (!list || list.length === 0 || !c || !master) return false;
    const buf = list[Math.floor(Math.random() * list.length)];
    if (!buf) return false;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = fileGain(takeUrl.get(buf));
      src.connect(g).connect(master);
      src.start(c.currentTime);
      return true;
    } catch {
      return false;
    }
  }

  /** Sung cat notes already rendered, by pitch and length (a handful of notes in a tune, so a small cache). */
  const sung = new Map<string, AudioBuffer>();
  const SUNG_KEPT = 48;

  let catScaleWarmed = false;

  function catKey(hz: number, dur: number): string {
    return `${Math.round(hz * 10)}|${dur.toFixed(2)}`;
  }

  function keepCat(key: string, c: Ctx, data: Float32Array): AudioBuffer {
    const buf = c.createBuffer(1, data.length, c.sampleRate);
    buf.getChannelData(0).set(data);
    sung.set(key, buf);
    while (sung.size > SUNG_KEPT) sung.delete(sung.keys().next().value as string);
    return buf;
  }

  /** The cat notes being rendered on the worker, so a note asked for twice shares one job. */
  const catJobs = new Map<string, Promise<AudioBuffer | null>>();
  /** Start rendering a cat note on the worker. Null when there is no worker (the caller renders it). */
  function requestCat(c: Ctx, hz: number, dur: number): Promise<AudioBuffer | null> | null {
    const key = catKey(hz, dur);
    const running = catJobs.get(key);
    if (running) return running;
    const job = renderOffThread({ kind: 'cat', hz, sampleRate: c.sampleRate, dur });
    if (!job) return null;
    const done = job.then((data) => {
      catJobs.delete(key);
      return data ? keepCat(key, c, data) : null;
    });
    catJobs.set(key, done);
    return done;
  }

  /**
   * The first cat note is a request to the worker; so are the rest of the scale, queued
   * behind it, because a tune is about to want them all.
   */
  function warmCatScale(c: Ctx): void {
    if (catScaleWarmed || worker === null) return;
    catScaleWarmed = true;
    for (const name of SCALE_C) requestCat(c, noteFreq(name) * 2, 0.7);
  }

  /**
   * A cat singing ONE steady note (see catvoice.ts). Not a retuned recording: a real
   * meow glides by a couple of semitones, so shifting it gives no note to hear.
   */
  function singCat(hz: number, gain: number, dur: number): void {
    const c = getCtx();
    if (!c || !master) return;
    try {
      const key = catKey(hz, dur);
      let buf = sung.get(key);
      if (buf) sung.delete(key);
      else {
        warmCatScale(c);
        // Already on its way from the worker (the scale is rendered ahead): sing it as soon as it lands,
        // if that is still close enough to the tap to feel like its answer. Never a stand-in voice.
        const pending = catJobs.get(key);
        if (pending) {
          const asked = c.currentTime;
          void pending.then((ready) => {
            if (ready && c.currentTime - asked < LATE_TAP_S) playCat(c, ready, gain);
          });
          return;
        }
        buf = keepCat(key, c, renderCatNote(hz, { sampleRate: c.sampleRate, dur }));
      }
      sung.set(key, buf);
      while (sung.size > SUNG_KEPT) sung.delete(sung.keys().next().value as string);
      playCat(c, buf, gain);
    } catch {
      /* closed context: stay silent */
    }
  }

  function playCat(c: Ctx, buf: AudioBuffer, gain: number): void {
    if (!master) return;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = LOUDNESS.cat * gain;
      src.connect(g).connect(master);
      src.start(c.currentTime);
    } catch {
      /* closed context: stay silent */
    }
  }

  function pitched(kind: FxKind, hz: number, opts: { gain?: number; maxDur?: number } = {}): void {
    const gain = opts.gain ?? 1;
    const maxDur = opts.maxDur ?? 1.1;
    if (kind === 'meow') {
      if (hz > 0 && Number.isFinite(hz)) singCat(hz, gain, Math.min(maxDur, 0.7));
      return;
    }
    const list = takes.get(kind)?.filter((b) => takeHz.has(b)) ?? [];
    const c = getCtx();
    if (!c || !master || !(hz > 0)) return;
    const buf = list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
    const base = buf ? takeHz.get(buf) : undefined;
    if (!buf || !base) {
      void loadVoice(kind);
      // A voice that cannot be retuned just plays.
      fx(kind);
      return;
    }
    try {
      const rate = Math.min(4, Math.max(0.25, hz / base));
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = c.createGain();
      const level = fileGain(takeUrl.get(buf)) * gain;
      const len = Math.min(maxDur, buf.duration / rate);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(level, t0);
      if (len < buf.duration / rate) {
        g.gain.setValueAtTime(level, t0 + len - 0.12);
        g.gain.linearRampToValueAtTime(0, t0 + len);
      }
      src.connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + len + 0.02);
    } catch {
      /* closed context: stay silent */
    }
  }

  /** Decoded recordings by URL. A failed decode stays failed: no refetch per tap. */
  const clips = new Map<string, Promise<AudioBuffer | null>>();

  function loadClip(url: string): Promise<AudioBuffer | null> {
    const c = ctx;
    if (!c) return Promise.resolve(null);
    let job = clips.get(url);
    if (!job) {
      job = fetch(`${import.meta.env.BASE_URL}${url}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((raw) => c.decodeAudioData(raw))
        .catch(() => null);
      clips.set(url, job);
    }
    return job;
  }

  /**
   * Decoded loops, most recently used last. A 30 s loop is several megabytes once
   * decoded, so only a handful are kept: a phone with every background ever
   * toggled held in memory is a phone that reloads the page.
   */
  const loops = new Map<string, Promise<AudioBuffer | null>>();
  const LOOPS_KEPT = 8;

  function loadLoop(c: Ctx, url: string): Promise<AudioBuffer | null> {
    let job = loops.get(url);
    if (job) loops.delete(url);
    else
      job = fetch(`${import.meta.env.BASE_URL}${url}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((raw) => c.decodeAudioData(raw))
        .catch(() => null);
    loops.set(url, job);
    while (loops.size > LOOPS_KEPT) loops.delete(loops.keys().next().value as string);
    return job;
  }

  async function loop(url: string, volume = 1): Promise<Loop | null> {
    const first = getCtx();
    if (!first) return null;
    const buf = await loadLoop(first, url);
    const c = getCtx();
    if (!buf || !c || !master) return null;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = c.createGain();
      const level = (v: number) => Math.max(0, v) * fileGain(url);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(level(volume), c.currentTime + 0.8);
      src.connect(g).connect(master);
      // Start somewhere in the middle, so two visits do not open on the same bird.
      src.start(c.currentTime, Math.random() * buf.duration);
      let stopped = false;
      return {
        setVolume(v) {
          if (stopped) return;
          const now = c.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(level(v), now + 0.4);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          try {
            const now = c.currentTime;
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(g.gain.value, now);
            g.gain.linearRampToValueAtTime(0, now + 0.6);
            src.stop(now + 0.65);
          } catch {
            /* already stopped */
          }
        },
      };
    } catch {
      return null;
    }
  }

  async function clip(url: string): Promise<Clip | null> {
    if (!getCtx()) return null;
    const buf = await loadClip(url);
    const c = getCtx();
    if (!buf || !c || !master) return null;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = fileGain(url);
      src.connect(g).connect(master);
      src.start(c.currentTime);
      return {
        duration: buf.duration,
        stop() {
          try {
            const now = c.currentTime;
            g.gain.setValueAtTime(g.gain.value, now);
            g.gain.linearRampToValueAtTime(0, now + 0.04);
            src.stop(now + 0.05);
          } catch {
            /* already stopped */
          }
        },
      };
    } catch {
      return null;
    }
  }

  function fx(kind: FxKind): void {
    at(`fx:${kind}`, () => {
      if (playTake(kind)) return;
      // Kinds with no recording are the synth's own; so is every voice where nothing can be fetched.
      if (!(SFX_TAKES[kind] ?? 0) || typeof fetch !== 'function') {
        playFx(kind);
        return;
      }
      // Not landed yet: the real voice answers as soon as it is decoded, if that is still soon
      // enough to belong to the tap. A synth stand-in sounded like a different animal. Only a
      // recording that cannot load at all (offline, missing) falls back to the synth.
      const c = getCtx();
      const asked = c?.currentTime ?? 0;
      void loadVoice(kind).then(() => {
        if ((c?.currentTime ?? 0) - asked > LATE_LOAD_S) return;
        at(`fx:${kind}`, () => {
          if (!playTake(kind)) playFx(kind);
        });
      });
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    clock() {
      const c = getCtx();
      return c ? nowOf(c) : 0;
    },
    unlock,
    setEnabled(on) {
      enabled = on;
      if (on) {
        unlock();
        void keepAlive?.play().catch(() => undefined);
      } else {
        keepAlive?.pause();
      }
    },
    pop(pitch = 1) {
      at('pop', () => tone('sine', 600 * pitch, 0.09, { gain: 0.5, slideTo: 300 * pitch }));
    },
    ding() {
      at('ding', () => {
        tone('sine', 880, 0.18, { gain: 0.5 });
        tone('sine', 1320, 0.25, { gain: 0.4, at: 0.09 });
      });
    },
    boing() {
      at('boing', () => tone('triangle', 300, 0.25, { gain: 0.3, slideTo: 120 }));
    },
    chomp() {
      // Soft mouthfuls, not crunching gravel.
      //
      // Eating is heard in the *grain* — a mouth closing more than once — but the
      // grain has to stay low and round. The bright band this used to lead with
      // sat at 3 kHz, which is where a phone speaker is sharpest and small ears
      // are most tender, so however quietly it was mixed it arrived as a handful
      // of static. Nothing here now reaches above a voice: two soft closes, each
      // with a round pitch under it so the ear reads a mouth rather than a hiss,
      // and a gentle slide down for the swallow.
      const v = 0.9 + Math.random() * 0.2;
      at('chomp', () => {
        for (let i = 0; i < 2; i++) {
          const t = i * 0.095;
          const fade = 1 - i * 0.32;
          noise(0.05, { at: t, gain: 0.23 * fade, filter: { type: 'lowpass', freq: 760 * v, to: 190 * v, q: 1 } });
          tone('sine', 248 * v, 0.075, { gain: 0.104 * fade, slideTo: 142 * v, attack: 0.014, at: t });
        }
        // …and the mouthful goes somewhere.
        tone('sine', 168 * v, 0.13, { gain: 0.085, slideTo: 94 * v, attack: 0.02, at: 0.2 });
      });
    },
    tick() {
      at('tick', () => {
        // A finger tapping wood, not a beep. The old click was 20 ms of a 1200 Hz
        // square wave: nothing but upper harmonics, which a tablet speaker turns
        // into a thin sting, and far too short to hear without turning everything
        // else up. This is the contact (a snip of filtered noise) over a little
        // body that drops away at once — short enough to fire forty times a
        // minute, warm enough to live next to a child's ear all afternoon.
        noise(0.014, { gain: 0.3, filter: { type: 'bandpass', freq: 2400, to: 1400, q: 1.1 } });
        tone('sine', 760, 0.055, { gain: 0.55, attack: 0.001, slideTo: 400 });
        tone('triangle', 1520, 0.028, { gain: 0.1, attack: 0.001, slideTo: 900 });
      });
    },
    jingle() {
      at('jingle', () => {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => tone('triangle', f, 0.35, { gain: 0.45, at: i * 0.08 }));
        tone('sine', 1567.98, 0.5, { gain: 0.25, at: notes.length * 0.08 });
      });
    },
    note,
    drum,
    inst,
    fx,
    pitched,
    ready() {
      return Promise.all([...loading.values()]).then(() => undefined);
    },
    preloadFx(kinds) {
      for (const kind of kinds) {
        if (kind === 'meow') {
          const c = getCtx();
          if (c) warmCatScale(c);
        } else void loadVoice(kind);
      }
    },
    clip,
    loop,
    preload(urls) {
      for (const url of urls) void loadClip(url);
    },
    puff() {
      at('puff', () => noise(0.35, { gain: 0.8, filter: { type: 'lowpass', freq: 500 } }));
    },
  };
}
