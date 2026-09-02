/**
 * Tiny Web Audio synthesizer. Every sound is generated, so the app ships no audio files
 * and works fully offline. All methods are silent no-ops until `unlock()` has run inside
 * a user gesture (browser autoplay policy) or when sound is disabled.
 */
export type Timbre = 'piano' | 'xylo' | 'bell' | 'guitar' | 'flute' | 'trumpet' | 'violin' | 'sax';
export type DrumKind = 'kick' | 'snare' | 'hat' | 'tom' | 'clap' | 'cowbell';

export const TIMBRES: readonly Timbre[] = ['piano', 'xylo', 'bell', 'guitar', 'flute', 'trumpet', 'violin', 'sax'];
export const DRUMS: readonly DrumKind[] = ['kick', 'snare', 'hat', 'tom', 'clap', 'cowbell'];

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
}

type Ctx = AudioContext;

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

  function unlock(): void {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      return;
    }
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.85;
      // Gentle compressor: percussion and chords stay loud on small tablet speakers without clipping.
      let sink: AudioNode = ctx.destination;
      try {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 12;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        comp.connect(ctx.destination);
        sink = comp;
      } catch {
        /* no compressor: connect straight to the destination */
      }
      master.connect(sink);
      void ctx.resume().catch(() => undefined);
      startKeepAlive();
    } catch {
      ctx = null;
      master = null;
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
      const peak = opts.gain ?? 0.6;
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
    opts: { gain?: number; at?: number; filter?: { type: BiquadFilterType; freq: number; q?: number }; decay?: boolean } = {},
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
      filter.frequency.value = opts.filter?.freq ?? 1200;
      if (opts.filter?.q) filter.Q.value = opts.filter.q;
      const g = c.createGain();
      g.gain.value = opts.gain ?? 0.5;
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
      g.gain.value = gain;
      src.connect(g).connect(master);
      src.start(c.currentTime);
    } catch {
      /* silent */
    }
  }

  function note(freq: number, dur = 0.5, timbre: Timbre = 'piano'): void {
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
        pluck(freq, Math.max(dur, 0.8));
        return;
      case 'flute':
        tone('sine', freq, dur, { gain: 0.5, attack: 0.06, sustain: true, release: 0.12, vibrato: { hz: 5.5, depth: freq * 0.012 } });
        tone('triangle', freq * 2, dur, { gain: 0.06, attack: 0.08, sustain: true, release: 0.12 });
        noise(Math.min(dur, 0.15), { gain: 0.05, filter: { type: 'bandpass', freq: freq * 2, q: 2 } });
        return;
      case 'trumpet':
        tone('sawtooth', freq, dur, { gain: 0.35, attack: 0.03, sustain: true, release: 0.08, filter: { type: 'lowpass', freq: 2400, to: 1400, q: 1.2 } });
        tone('square', freq, dur, { gain: 0.08, attack: 0.03, sustain: true, release: 0.08, filter: { type: 'lowpass', freq: 1200 } });
        return;
      case 'sax':
        tone('sawtooth', freq, dur, { gain: 0.3, attack: 0.05, sustain: true, release: 0.12, filter: { type: 'lowpass', freq: 1500, q: 3 }, vibrato: { hz: 5, depth: freq * 0.01 } });
        tone('square', freq / 2, dur, { gain: 0.08, attack: 0.05, sustain: true, release: 0.12, filter: { type: 'lowpass', freq: 800 } });
        return;
      case 'violin':
        tone('sawtooth', freq, dur, { gain: 0.22, attack: 0.12, sustain: true, release: 0.18, detune: -5, filter: { type: 'lowpass', freq: 2600, q: 0.8 }, vibrato: { hz: 6, depth: freq * 0.008 } });
        tone('sawtooth', freq, dur, { gain: 0.22, attack: 0.12, sustain: true, release: 0.18, detune: 5, filter: { type: 'lowpass', freq: 2600, q: 0.8 } });
        return;
      case 'piano':
      default:
        tone('triangle', freq, dur, { gain: 0.5, attack: 0.01 });
        tone('sine', freq * 2, dur * 0.6, { gain: 0.12, attack: 0.01 });
        return;
    }
  }

  function drum(kind: DrumKind): void {
    switch (kind) {
      case 'kick':
        tone('sine', 150, 0.4, { gain: 1.3, attack: 0.002, slideTo: 40 });
        noise(0.03, { gain: 0.35, filter: { type: 'lowpass', freq: 600 } });
        return;
      case 'snare':
        noise(0.22, { gain: 1.0, filter: { type: 'bandpass', freq: 1800, q: 0.8 } });
        tone('triangle', 200, 0.12, { gain: 0.6, attack: 0.002, slideTo: 120 });
        return;
      case 'hat':
        noise(0.07, { gain: 0.6, filter: { type: 'highpass', freq: 7000 } });
        return;
      case 'tom':
        tone('sine', 220, 0.35, { gain: 1.2, attack: 0.002, slideTo: 90 });
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
    }
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
      tone('sine', 600 * pitch, 0.09, { gain: 0.5, slideTo: 300 * pitch });
    },
    ding() {
      tone('sine', 880, 0.18, { gain: 0.5 });
      tone('sine', 1320, 0.25, { gain: 0.4, at: 0.09 });
    },
    boing() {
      tone('triangle', 300, 0.25, { gain: 0.3, slideTo: 120 });
    },
    chomp() {
      noise(0.12, { gain: 0.6, filter: { type: 'lowpass', freq: 900 } });
      tone('square', 180, 0.08, { gain: 0.15, slideTo: 90 });
    },
    tick() {
      tone('square', 1200, 0.02, { gain: 0.15 });
    },
    jingle() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone('triangle', f, 0.35, { gain: 0.45, at: i * 0.08 }));
      tone('sine', 1567.98, 0.5, { gain: 0.25, at: notes.length * 0.08 });
    },
    note,
    drum,
    puff() {
      noise(0.35, { gain: 0.8, filter: { type: 'lowpass', freq: 500 } });
    },
  };
}
