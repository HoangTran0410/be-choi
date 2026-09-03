/**
 * Microphone input shared by the singing games: a smoothed loudness level, an
 * optional pitch, and a small recorder that hands back an AudioBuffer so the
 * child's voice can be played again faster or slower.
 *
 * Everything degrades quietly to "no microphone" instead of throwing — a game
 * that cannot listen must still be playable with a finger.
 */
type AudioCtor = new () => AudioContext;

export interface MicFrame {
  /** 0 … 1 with the room's own noise removed, smoothed (rises fast, falls slowly). */
  level: number;
  /** Fundamental frequency in Hz while someone sings, else null. Only with `pitch: true`. */
  pitch: number | null;
}

export interface MicOptions {
  /** Also detect pitch on every frame (costs a little CPU). */
  pitch?: boolean;
  /** Frames per second (default 30). */
  fps?: number;
}

export interface PlayOptions {
  /** Playback speed, which also shifts the pitch: 2 = chipmunk, 0.5 = giant. */
  rate?: number;
  gain?: number;
  onEnd?: () => void;
}

export interface Mic {
  /** True once `start()` has succeeded and frames are flowing. */
  readonly listening: boolean;
  /** Ask for the microphone. Must be called from a user gesture (iOS). Never throws. */
  start(): Promise<boolean>;
  /** Listen to level/pitch frames. Returns an unsubscribe function. */
  onFrame(fn: (frame: MicFrame) => void): () => void;
  /** Start collecting samples; stops collecting on its own after `maxMs`. */
  record(maxMs?: number): void;
  /** Stop collecting and return the voice, or null when it was too short or silent. */
  stopRecord(): AudioBuffer | null;
  /** Play a recorded voice. Returns a stop function. */
  play(buffer: AudioBuffer, opts?: PlayOptions): () => void;
  /** Release the microphone: the device's recording light goes out. */
  stop(): void;
}

/** Frames averaged at the start to learn how noisy the room is. */
const NOISE_FRAMES = 15;
/** Loudness below this much above the noise floor still counts as silence. */
const LEVEL_GATE = 0.008;
/** How much louder than the floor a full-strength voice is. */
const LEVEL_SPAN = 0.16;
/** Below this level pitch detection is not even attempted. */
const PITCH_MIN_LEVEL = 0.08;
/** Pitch is only worth a fifth of the frames: it costs far more than the level and changes slowly. */
const PITCH_EVERY = 5;
/** A recording shorter than this is treated as an accidental tap. */
const MIN_RECORD_S = 0.25;
const REC_CHUNK = 4096;

/** RMS loudness, 0 … 1. Accepts AnalyserNode byte data (128 = silence) or raw floats. */
export function rms(samples: Uint8Array | Float32Array): number {
  const n = samples.length;
  if (n === 0) return 0;
  const byte = samples instanceof Uint8Array;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const raw = samples[i] ?? (byte ? 128 : 0);
    const v = byte ? (raw - 128) / 128 : raw;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / n));
}

/** Loudness above the room's own noise, mapped so an ordinary child's voice fills 0 … 1. */
export function normalizeLevel(raw: number, floor: number, span = LEVEL_SPAN): number {
  const v = (raw - floor - LEVEL_GATE) / span;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** Follow a jumpy level: jump up quickly so lights react, fade down slowly so they do not flicker. */
export function smooth(prev: number, next: number, rise = 0.5, fall = 0.12): number {
  return prev + (next - prev) * (next > prev ? rise : fall);
}

/**
 * Fundamental frequency by normalized autocorrelation, or null when the sound is
 * too quiet or too noisy to have a clear pitch (speech consonants, room hum).
 */
export function detectPitch(buf: Float32Array, sampleRate: number, minHz = 110, maxHz = 1000, clarity = 0.9): number | null {
  const n = buf.length;
  if (n < 128 || sampleRate <= 0) return null;
  if (rms(buf) < 0.01) return null;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(n - 2, Math.floor(sampleRate / minHz));
  if (maxLag <= minLag) return null;
  const corr = new Float32Array(maxLag - minLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e1 = 0;
    let e2 = 0;
    // Stride 2: half the work, same peak for voices in this range.
    for (let i = 0; i + lag < n; i += 2) {
      const a = buf[i] ?? 0;
      const b = buf[i + lag] ?? 0;
      sum += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const norm = Math.sqrt(e1 * e2);
    const c = norm > 0 ? sum / norm : 0;
    corr[lag - minLag] = c;
    if (c > best) best = c;
  }
  if (best < clarity) return null;
  // The *first* strong peak is the period: a lag of two periods correlates just as
  // well, so taking the tallest peak would report the note an octave too low.
  const cut = best * 0.93;
  for (let k = 0; k < corr.length; k++) {
    const c = corr[k] ?? 0;
    if (c >= cut && c >= (corr[k - 1] ?? 0) && c >= (corr[k + 1] ?? 0)) return sampleRate / (k + minLag);
  }
  return null;
}

export function concatChunks(chunks: readonly Float32Array[]): Float32Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Drop the silence before and after the voice, keeping a short pad on each side. */
export function trimSilence(samples: Float32Array, threshold = 0.02, pad = 1024): Float32Array {
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i] ?? 0) >= threshold) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return new Float32Array(0);
  return samples.slice(Math.max(0, first - pad), Math.min(samples.length, last + 1 + pad));
}

/** `n` peak values in 0 … 1, one per slice of the recording, for drawing a waveform. */
export function waveformBars(samples: Float32Array, n: number): number[] {
  if (n <= 0) return [];
  if (samples.length === 0) return new Array<number>(n).fill(0);
  const size = samples.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let peak = 0;
    for (let j = from; j < to && j < samples.length; j++) peak = Math.max(peak, Math.abs(samples[j] ?? 0));
    out.push(Math.min(1, peak));
  }
  return out;
}

function stopTracks(stream: MediaStream): void {
  try {
    for (const t of stream.getTracks()) t.stop();
  } catch {
    /* already gone */
  }
}

function quietly(fn: () => void): void {
  try {
    fn();
  } catch {
    /* nodes may already be disconnected */
  }
}

export function createMic(opts: MicOptions = {}): Mic {
  const fps = opts.fps ?? 30;
  const wantPitch = opts.pitch === true;
  const listeners = new Set<(frame: MicFrame) => void>();

  let stream: MediaStream | null = null;
  let actx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let starting: Promise<boolean> | null = null;
  let bytes = new Uint8Array(0);
  let floats = new Float32Array(0);
  let level = 0;
  let floor = 0;
  let floorSeen = 0;
  let pitch: number | null = null;
  let pitchAge = 0;

  let proc: ScriptProcessorNode | null = null;
  let sink: GainNode | null = null;
  let chunks: Float32Array[] = [];
  let recording = false;
  let recTimer: ReturnType<typeof setTimeout> | null = null;

  function tick(): void {
    if (!analyser) return;
    analyser.getByteTimeDomainData(bytes);
    const raw = rms(bytes);
    if (floorSeen < NOISE_FRAMES) {
      floorSeen++;
      floor += (raw - floor) / floorSeen;
    }
    level = smooth(level, normalizeLevel(raw, floor));
    if (!wantPitch || level <= PITCH_MIN_LEVEL) {
      pitch = null;
    } else if (pitchAge++ % PITCH_EVERY === 0) {
      analyser.getFloatTimeDomainData(floats);
      pitch = detectPitch(floats, actx?.sampleRate ?? 44100);
    }
    const frame: MicFrame = { level, pitch };
    for (const fn of [...listeners]) fn(frame);
  }

  async function open(): Promise<boolean> {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') return false;
    const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) return false;
    let media: MediaStream;
    try {
      // Echo cancellation keeps the game's own backing track from lighting up the meter.
      media = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return false;
    }
    try {
      actx = new Ctor();
      stream = media;
      analyser = actx.createAnalyser();
      analyser.fftSize = wantPitch ? 2048 : 1024;
      source = actx.createMediaStreamSource(media);
      source.connect(analyser);
      if (actx.state === 'suspended') void actx.resume().catch(() => undefined);
    } catch {
      stopTracks(media);
      stream = null;
      source = null;
      analyser = null;
      actx = null;
      return false;
    }
    bytes = new Uint8Array(analyser.fftSize);
    floats = new Float32Array(analyser.fftSize);
    level = 0;
    floor = 0;
    floorSeen = 0;
    pitch = null;
    pitchAge = 0;
    timer = setInterval(tick, Math.max(16, Math.round(1000 / fps)));
    return true;
  }

  const mic: Mic = {
    get listening() {
      return timer !== null;
    },
    async start() {
      if (timer !== null) return true;
      if (!starting) starting = open();
      const ok = await starting;
      starting = null;
      return ok;
    },
    onFrame(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    record(maxMs = 5000) {
      if (!actx || !source || recording) return;
      chunks = [];
      try {
        proc = actx.createScriptProcessor(REC_CHUNK, 1, 1);
        sink = actx.createGain();
        // A muted sink: some browsers only run the processor while it reaches the destination.
        sink.gain.value = 0;
        proc.onaudioprocess = (e) => {
          if (recording) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        source.connect(proc);
        proc.connect(sink);
        sink.connect(actx.destination);
      } catch {
        proc = null;
        sink = null;
        return;
      }
      recording = true;
      if (maxMs > 0) {
        recTimer = setTimeout(() => {
          recTimer = null;
          recording = false;
        }, maxMs);
      }
    },
    stopRecord() {
      if (recTimer !== null) {
        clearTimeout(recTimer);
        recTimer = null;
      }
      recording = false;
      if (proc) {
        proc.onaudioprocess = null;
        if (source) quietly(() => source?.disconnect(proc as ScriptProcessorNode));
        quietly(() => proc?.disconnect());
      }
      if (sink) quietly(() => sink?.disconnect());
      proc = null;
      sink = null;
      const voice = trimSilence(concatChunks(chunks));
      chunks = [];
      if (!actx || voice.length < Math.floor(actx.sampleRate * MIN_RECORD_S)) return null;
      try {
        const buffer = actx.createBuffer(1, voice.length, actx.sampleRate);
        buffer.getChannelData(0).set(voice);
        return buffer;
      } catch {
        return null;
      }
    },
    play(buffer, o = {}) {
      if (!actx) return () => undefined;
      try {
        const src = actx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = o.rate ?? 1;
        const gain = actx.createGain();
        gain.gain.value = o.gain ?? 1;
        src.connect(gain);
        gain.connect(actx.destination);
        src.onended = () => o.onEnd?.();
        src.start();
        return () => {
          src.onended = null;
          quietly(() => src.stop());
        };
      } catch {
        return () => undefined;
      }
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      mic.stopRecord();
      if (source) {
        quietly(() => source?.disconnect());
        source = null;
      }
      analyser = null;
      if (stream) {
        stopTracks(stream);
        stream = null;
      }
      if (actx) {
        quietly(() => void actx?.close().catch(() => undefined));
        actx = null;
      }
      level = 0;
      floor = 0;
      floorSeen = 0;
    },
  };
  return mic;
}
