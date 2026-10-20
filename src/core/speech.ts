/**
 * Vietnamese text-to-speech via the Web Speech API. On iOS and Android a `vi-VN`
 * voice is usually available offline. When there is no Vietnamese voice we stay
 * silent instead of reading Vietnamese with an English voice.
 */
export interface Speech {
  /** Speak an empty utterance inside a user gesture so iOS allows later speech. */
  warm(): void;
  setEnabled(on: boolean): void;
  /** True when a Vietnamese voice exists. */
  available(): boolean;
  /**
   * `interrupt` (default true) cancels whatever is currently being spoken.
   * `rate` is the speed (default 0.95); games that teach a name or a count go slower.
   */
  speak(text: string, opts?: { interrupt?: boolean; rate?: number }): void;
  cancel(): void;
}

export function createSpeech(synth: SpeechSynthesis | null = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null): Speech {
  let enabled = true;
  let voice: SpeechSynthesisVoice | null = null;

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

  function makeUtterance(text: string, rate = 0.95): SpeechSynthesisUtterance | null {
    const Ctor = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
    if (!Ctor) return null;
    const u = new Ctor(text);
    u.lang = 'vi-VN';
    u.rate = Math.min(1.2, Math.max(0.4, Number.isFinite(rate) ? rate : 0.95));
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
        if (opts.interrupt ?? true) synth.cancel();
        const u = makeUtterance(text, opts.rate);
        if (u) synth.speak(u);
      } catch {
        /* ignore */
      }
    },
    cancel() {
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}
