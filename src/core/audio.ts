/**
 * Tiny Web Audio synthesizer. Every sound is generated, so the app ships no audio files
 * and works fully offline. All methods are silent no-ops until `unlock()` has run inside
 * a user gesture (browser autoplay policy) or when sound is disabled.
 */
import { LOUDNESS } from './loudness';
import { SFX_TAKES, sfxUrl } from './sfx';

export type Timbre = 'piano' | 'xylo' | 'bell' | 'guitar' | 'flute' | 'trumpet' | 'violin' | 'sax' | 'bass';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'tom' | 'clap' | 'cowbell' | 'shaker' | 'wood' | 'ride' | 'triangle' | 'crash';
/** Sound effects and (very) approximate animal voices, all synthesized. */
export type FxKind =
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
  | `fx:${FxKind}`
  /**
   * The recorded animal voices share one level: `scripts/sfx.mjs` already
   * normalises them against each other, so they only need bringing to the
   * house level as a group.
   */
  | 'sample';

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
  /** Musical note. `dur` in seconds. `timbre` picks the instrument (default piano). */
  note(freq: number, dur?: number, timbre?: Timbre): void;
  /** Percussion hit. */
  drum(kind: DrumKind): void;
  /** A soft breath of air (blowing out a candle). */
  puff(): void;
  /** Sound effect / animal voice. */
  fx(kind: FxKind): void;
  /** Resolves once the recorded animal voices are decoded (or known to be missing). */
  ready(): Promise<void>;
}

type Ctx = AudioContext;

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
  let loaded: Promise<void> | null = null;

  /**
   * Fetch and decode the recordings in the background. Nothing waits on this:
   * the first tap plays the synth, and the real voices take over once they land
   * — usually well before a two-year-old has found the animal.
   */
  function loadTakes(c: Ctx): Promise<void> {
    if (loaded) return loaded;
    const base = import.meta.env.BASE_URL;
    const jobs: Promise<void>[] = [];
    for (const [kind, count] of Object.entries(SFX_TAKES) as [FxKind, number][]) {
      for (let i = 0; i < count; i++) {
        jobs.push(
          fetch(`${base}${sfxUrl(kind, i)}`)
            .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
            .then((raw) => c.decodeAudioData(raw))
            .then((buf) => {
              const list = takes.get(kind);
              if (list) list.push(buf);
              else takes.set(kind, [buf]);
            })
            .catch(() => undefined),
        );
      }
    }
    loaded = Promise.all(jobs).then(() => undefined);
    return loaded;
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
        comp.connect(ctx.destination);
        tone.connect(comp);
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
      void loadTakes(ctx).catch(() => undefined);
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

  function at<T>(id: SoundId, play: () => T): T {
    trim = LOUDNESS[id] ?? 1;
    try {
      return play();
    } finally {
      trim = 1;
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
      const t0 = c.currentTime + (opts.at ?? 0);
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
      const t0 = c.currentTime + (opts.at ?? 0);
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
      src.start(c.currentTime);
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
        tone('sine', 1100, 0.07, { gain: 0.9, attack: 0.001, slideTo: 700 });
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
          gain: 0.3,
          attack: 0.02,
          sustain: true,
          release: 0.1,
          filter: { type: 'lowpass', freq: 900 },
          vibrato: { hz: 7, depth: 6 },
        });
        tone('sawtooth', 345, 0.4, { gain: 0.12, attack: 0.02, sustain: true, release: 0.1, filter: { type: 'lowpass', freq: 1200 } });
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
    }
  }

  function note(freq: number, dur = 0.5, timbre: Timbre = 'piano'): void {
    at(`note:${timbre}`, () => playNote(freq, dur, timbre));
  }

  function drum(kind: DrumKind): void {
    at(`drum:${kind}`, () => playDrum(kind));
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
      g.gain.value = LOUDNESS.sample;
      src.connect(g).connect(master);
      src.start(c.currentTime);
      return true;
    } catch {
      return false;
    }
  }

  function fx(kind: FxKind): void {
    at(`fx:${kind}`, () => {
      if (!playTake(kind)) playFx(kind);
    });
  }

  return {
    get enabled() {
      return enabled;
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
    fx,
    ready() {
      return loaded ?? Promise.resolve();
    },
    puff() {
      at('puff', () => noise(0.35, { gain: 0.8, filter: { type: 'lowpass', freq: 500 } }));
    },
  };
}
