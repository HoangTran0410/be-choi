/**
 * Vietnamese text-to-speech via the Web Speech API. On iOS and Android a `vi-VN`
 * voice is usually available offline. When there is no Vietnamese voice we stay
 * silent instead of reading Vietnamese with an English voice.
 */
export interface SpeakOptions {
  interrupt?: boolean;
  rate?: number;
}

export interface SpeechPart {
  text: string;
  /** Speaking speed; default {@link SEQ_RATE}. */
  rate?: number;
  /** Silence after this part, ms; default {@link SEQ_PAUSE_MS}. */
  pauseAfterMs?: number;
  /** Called once, when this part starts being spoken. */
  onStart?: () => void;
}

export interface Speech {
  /** Speak an empty utterance inside a user gesture so iOS allows later speech. */
  warm(): void;
  setEnabled(on: boolean): void;
  /** True when a Vietnamese voice exists. */
  available(): boolean;
  /** `interrupt` (default true) cancels whatever is currently being spoken. `rate` defaults to 0.95. */
  speak(text: string, opts?: SpeakOptions): void;
  /**
   * Say several parts one after another, slowly, with a quiet gap after each
   * (waits for the utterance to end, with a timeout in case the engine never
   * reports it). Starting another `speak` / `speakSeq` / `cancel` drops what is
   * left of the old sequence, so voices never pile up. Resolves `true` when the
   * last part was done, `false` if it was cut short. Parts still "play"
   * (silently, at a reading pace) when the voice is off or missing, so whatever
   * a game shows in step with them keeps moving.
   */
  speakSeq(parts: SpeechPart[]): Promise<boolean>;
  cancel(): void;
}

export const SEQ_RATE = 0.75;
export const SEQ_PAUSE_MS = 450;

/** Longest we wait for an utterance to report its end: a guess at its length plus slack. */
function endTimeoutMs(text: string, rate: number): number {
  return 1500 + (text.length * 160) / Math.max(0.3, rate);
}
/** How long a part takes when nothing is actually spoken. */
function silentMs(text: string): number {
  return text ? 500 + text.length * 70 : 0;
}

export function createSpeech(synth: SpeechSynthesis | null = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null): Speech {
  let enabled = true;
  let voice: SpeechSynthesisVoice | null = null;
  /** Bumped by anything that cancels; a running sequence stops when its token is stale. */
  let token = 0;
  let stopSeq: (() => void) | null = null;

  function findVoice(): void {
    if (!synth) return;
    try {
      const voices = synth.getVoices();
      voice =
        voices.find((v) => v.lang.toLowerCase().startsWith('vi') && v.localService) ??
        voices.find((v) => v.lang.toLowerCase().startsWith('vi')) ??
        null;
    } catch {
      voice = null;
    }
  }

  findVoice();
  try {
    synth?.addEventListener('voiceschanged', findVoice);
  } catch {
    /* older engines expose onvoiceschanged only */
  }

  function abortSeq(): void {
    token++;
    const stop = stopSeq;
    stopSeq = null;
    stop?.();
  }

  function makeUtterance(text: string, rate = 0.95): SpeechSynthesisUtterance | null {
    const Ctor = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
    if (!Ctor) return null;
    const u = new Ctor(text);
    u.lang = 'vi-VN';
    u.rate = Number.isFinite(rate) ? Math.min(2, Math.max(0.3, rate)) : 0.95;
    u.pitch = 1.1;
    if (voice) u.voice = voice;
    return u;
  }

  return {
    warm() {
      if (!synth) return;
      try {
        const u = makeUtterance('');
        if (u) synth.speak(u);
      } catch {
        /* ignore */
      }
    },
    setEnabled(on) {
      enabled = on;
      if (!on) this.cancel();
    },
    available() {
      if (!voice) findVoice();
      return voice !== null;
    },
    speak(text, opts = {}) {
      if (!synth || !enabled) return;
      if (!voice) findVoice();
      if (!voice) return;
      try {
        if (opts.interrupt ?? true) {
          abortSeq();
          synth.cancel();
        }
        const u = makeUtterance(text, opts.rate);
        if (u) synth.speak(u);
      } catch {
        /* ignore */
      }
    },
    speakSeq(parts) {
      abortSeq();
      const mine = token;
      const live = (): boolean => token === mine;
      if (synth && enabled && !voice) findVoice();
      const engine = synth && enabled && voice ? synth : null;
      if (engine) {
        try {
          engine.cancel();
        } catch {
          /* ignore */
        }
      }
      return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const clear = (): void => {
          if (timer) clearTimeout(timer);
          timer = null;
        };
        const later = (ms: number, fn: () => void): void => {
          clear();
          timer = setTimeout(() => {
            timer = null;
            if (live()) fn();
          }, ms);
        };
        stopSeq = () => {
          clear();
          resolve(false);
        };
        const step = (i: number): void => {
          if (!live()) return;
          const part = parts[i];
          if (!part) {
            stopSeq = null;
            resolve(true);
            return;
          }
          const rate = part.rate ?? SEQ_RATE;
          const pause = part.pauseAfterMs ?? SEQ_PAUSE_MS;
          let finished = false;
          const next = (): void => {
            if (finished || !live()) return;
            finished = true;
            later(pause, () => step(i + 1));
          };
          try {
            part.onStart?.();
          } catch {
            /* a game's callback must not break the voice */
          }
          let spoken = false;
          if (engine && part.text) {
            try {
              const u = makeUtterance(part.text, rate);
              if (u) {
                u.onend = next;
                u.onerror = next;
                engine.speak(u);
                spoken = true;
              }
            } catch {
              spoken = false;
            }
          }
          // If the engine never says "ended", the timeout moves us on anyway.
          later(spoken ? endTimeoutMs(part.text, rate) : silentMs(part.text), next);
        };
        step(0);
      });
    },
    cancel() {
      abortSeq();
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}
