/**
 * The recorded instruments (public/instruments/, built by scripts/instrument-samples.mjs): fetched
 * and decoded the first time an instrument is wanted, or ahead of time by `request`, and played
 * from the nearest recorded note. Until a set has landed, or if it cannot (offline and never
 * cached, a bad file, no decoder), `play` returns null and the engine plays the synth instead, so
 * a tap is never silent and nothing here can throw into the game.
 */
import { SAMPLE_SETS } from './samplesManifest';
import { pickHit, pickPitched, roundRobin, velocityGain, type SampleSet } from './samples';

export interface SamplePlay {
  /** Linear level for this note, on top of the files' own levelling (the caller's gain and the touch). */
  level: number;
  /** Start time on the audio clock. */
  t0: number;
  /** Strike hardness 0…1; moves the level a little (a soft touch is quieter). Default 1. */
  vel?: number;
  /** Written length in seconds: when a held note is let go, and with `damp` when a struck one is. */
  dur?: number;
  /** Fade a struck note out when `dur` is up, so chords stay clean. */
  damp?: boolean;
  /** Reference pitch of an unpitched set (Hz), for the hits that follow the asked-for pitch a little. */
  refFreq?: number;
}

export interface SampleVoice {
  /** Fade it out over a few tens of milliseconds. */
  stop(): void;
}

export interface SampleBank {
  /** Start fetching these sets (`inst:marimba`, `drum:kick`, `note:piano`). Does nothing until there is a context. */
  request(keys: readonly string[]): void;
  /** Start any request that came before there was a context. Call when the context is created. */
  flush(): void;
  /** Play a note from a set, or null when the set is not ready (the caller plays the synth). */
  play(key: string, freq: number, opts: SamplePlay): SampleVoice | null;
}

export interface BankEnv {
  ctx(): AudioContext | null;
  master(): AudioNode | null;
  /** URL prefix of the app (import.meta.env.BASE_URL). */
  base: string;
  /** Where to look the sets up; the generated manifest unless a test passes its own. */
  sets?: Readonly<Record<string, SampleSet>>;
  now?(): number;
}

type Entry = { state: 'loading' } | { state: 'ready'; buffers: AudioBuffer[]; next: () => number } | { state: 'failed'; at: number };

/** A set that failed to load is tried again after this long (ms): offline for a minute is not offline forever. */
const RETRY_MS = 30_000;
/** Held notes are let go over this many seconds. */
const RELEASE_S = 0.12;
/** A struck note damped at the end of its length. */
const DAMP_S = 0.3;
const HELD_DEFAULT_S = 0.9;

export function createSampleBank(env: BankEnv): SampleBank {
  const sets = env.sets ?? SAMPLE_SETS;
  const now = env.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();
  const waiting = new Set<string>();

  function load(key: string, c: AudioContext): void {
    const set = sets[key];
    if (!set || typeof fetch !== 'function') return;
    entries.set(key, { state: 'loading' });
    const jobs = set.files.map((file) =>
      fetch(`${env.base}instruments/${file.f}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((raw) => c.decodeAudioData(raw)),
    );
    Promise.all(jobs).then(
      (buffers) => entries.set(key, { state: 'ready', buffers, next: roundRobin(buffers.length) }),
      () => entries.set(key, { state: 'failed', at: now() }),
    );
  }

  function request(keys: readonly string[]): void {
    const c = env.ctx();
    for (const key of keys) {
      if (!sets[key]) continue;
      if (!c) {
        waiting.add(key);
        continue;
      }
      const e = entries.get(key);
      if (!e || (e.state === 'failed' && now() - e.at > RETRY_MS)) load(key, c);
    }
  }

  function flush(): void {
    if (!waiting.size) return;
    const keys = [...waiting];
    waiting.clear();
    request(keys);
  }

  function play(key: string, freq: number, o: SamplePlay): SampleVoice | null {
    const set = sets[key];
    const c = env.ctx();
    const master = env.master();
    if (!set || !c || !master) return null;
    const e = entries.get(key);
    if (!e) {
      request([key]); // the first tap is the synth's; the recording takes over once it lands
      return null;
    }
    if (e.state !== 'ready') {
      if (e.state === 'failed') request([key]);
      return null;
    }
    try {
      const pick = set.kind === 'pitched' ? pickPitched(set, freq) : pickHit(set, e.next, freq, o.refFreq);
      if (!pick) return null;
      const buf = e.buffers[pick.index];
      const file = set.files[pick.index];
      if (!buf || !file) return null;
      const src = c.createBufferSource();
      src.buffer = buf;
      // A hair of random pitch, so ten taps are not one sample ten times.
      src.playbackRate.value = pick.rate * (1 + (Math.random() - 0.5) * 0.004);
      const peak = o.level * (set.kind === 'pitched' ? velocityGain(o.vel ?? 1) : 1);
      const g = c.createGain();
      g.gain.value = peak;
      src.connect(g).connect(master);
      const t0 = o.t0;
      const dur = o.dur && o.dur > 0 ? o.dur : set.held ? HELD_DEFAULT_S : 0;
      if (set.held && file.loop) {
        src.loop = true;
        src.loopStart = file.loop[0];
        src.loopEnd = file.loop[1];
      }
      src.start(t0);
      if (set.held && dur > 0) {
        // Held: sounds as long as the note is, then lets go cleanly.
        g.gain.setValueAtTime(peak, t0 + dur);
        g.gain.linearRampToValueAtTime(0, t0 + dur + RELEASE_S);
        src.stop(t0 + dur + RELEASE_S + 0.02);
      } else if (o.damp && dur > 0) {
        g.gain.setValueAtTime(peak, t0 + dur);
        g.gain.linearRampToValueAtTime(0, t0 + dur + DAMP_S);
        src.stop(t0 + dur + DAMP_S + 0.05);
      }
      src.onended = () => {
        try {
          src.disconnect();
          g.disconnect();
        } catch {
          /* already gone */
        }
      };
      let stopped = false;
      return {
        stop() {
          if (stopped) return;
          stopped = true;
          try {
            const t = Math.max(c.currentTime, 0);
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(g.gain.value, t);
            g.gain.linearRampToValueAtTime(0, t + 0.06);
            src.stop(t + 0.08);
          } catch {
            /* already over */
          }
        },
      };
    } catch {
      return null;
    }
  }

  return { request, flush, play };
}
