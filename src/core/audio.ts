/**
 * Tiny Web Audio synthesizer. Every sound is generated, so the app ships no audio files
 * and works fully offline. All methods are silent no-ops until `unlock()` has run inside
 * a user gesture (browser autoplay policy) or when sound is disabled.
 */
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
  /** Musical note for the piano. `dur` in seconds. */
  note(freq: number, dur?: number): void;
}

type Ctx = AudioContext;

export function createAudio(): AudioEngine {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let enabled = true;

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
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      void ctx.resume().catch(() => undefined);
    } catch {
      ctx = null;
      master = null;
    }
  }

  /** Oscillator with an exponential decay envelope. */
  function tone(
    type: OscillatorType,
    freq: number,
    dur: number,
    opts: { gain?: number; at?: number; slideTo?: number; attack?: number } = {},
  ): void {
    const c = getCtx();
    if (!c || !master) return;
    try {
      const t0 = c.currentTime + (opts.at ?? 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
      const peak = opts.gain ?? 0.6;
      const attack = opts.attack ?? 0.005;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      /* closed context or unsupported node: stay silent */
    }
  }

  function noise(dur: number, opts: { gain?: number; at?: number; cutoff?: number } = {}): void {
    const c = getCtx();
    if (!c || !master) return;
    try {
      const t0 = c.currentTime + (opts.at ?? 0);
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.cutoff ?? 1200;
      const g = c.createGain();
      g.gain.value = opts.gain ?? 0.5;
      src.connect(filter).connect(g).connect(master);
      src.start(t0);
    } catch {
      /* silent */
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    unlock,
    setEnabled(on) {
      enabled = on;
      if (on) unlock();
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
      noise(0.12, { gain: 0.6, cutoff: 900 });
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
    note(freq, dur = 0.5) {
      tone('triangle', freq, dur, { gain: 0.5, attack: 0.01 });
      tone('sine', freq * 2, dur * 0.6, { gain: 0.12, attack: 0.01 });
    },
  };
}
