/**
 * Pre-recorded Vietnamese voice clips, played instead of the device's text-to-speech
 * whenever one exists for a line. Device voices (above all the iPad's) read Vietnamese
 * flat and sometimes with the wrong tone; a recorded voice says every line the same,
 * natural way on every device. Lines without a clip still go to text-to-speech.
 *
 * `public/voice/manifest.json` lists the clips by the hash of their {@link voiceKey};
 * each clip is `public/voice/<hash>.m4a`. `scripts/voice-clips.mjs` builds both.
 */
import { voiceKey } from './voiceKey';

export interface VoiceManifest {
  v: 1;
  /** Clip hash → length in ms. */
  clips: Record<string, number>;
}

/** FNV-1a, 32-bit, as 8 hex digits. The build script uses the same function. */
export function clipHash(key: string): string {
  let h = 0x811c9dc5;
  for (const ch of key) {
    const cp = ch.codePointAt(0)!;
    // Feed the code point as up to 3 bytes so every Vietnamese letter counts in full.
    for (const b of cp > 0xffff ? [cp >> 16, (cp >> 8) & 0xff, cp & 0xff] : cp > 0xff ? [cp >> 8, cp & 0xff] : [cp]) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai', 'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín', 'hai mươi'];
/** Most pieces a stitched line may have: more than this sounds like a robot reading a list. */
export const MAX_PIECES = 4;
/** Silence between stitched pieces, ms. */
export const PIECE_GAP_MS = 60;

/**
 * The clips that say this line: its own clip, or else the fewest recorded pieces that cover
 * it word for word ("Có ba quả chuối" → "có" + "ba" + "quả chuối"). Null when it can't be
 * covered by {@link MAX_PIECES} or fewer. Numbers 0–20 written as digits are read as words.
 */
export function planClips(text: string, has: (hash: string) => boolean, maxPieces = MAX_PIECES): string[] | null {
  const whole = clipHash(voiceKey(text));
  if (has(whole)) return [whole];
  const words = text
    .normalize('NFC')
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .flatMap((w) => (/^\d+$/.test(w) && Number(w) <= 20 ? DIGIT_WORDS[Number(w)]!.split(' ') : [w]));
  const n = words.length;
  if (n < 2) return null;
  // best[i]: fewest pieces covering words[i..]; next[i]: where the first of them ends.
  const best = new Array<number>(n + 1).fill(Infinity);
  const next = new Array<number>(n + 1).fill(-1);
  const hashAt = new Map<string, string>();
  best[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = n; j > i; j--) {
      if (best[j]! + 1 >= best[i]!) continue;
      const h = clipHash(voiceKey(words.slice(i, j).join(' ')));
      if (!has(h)) continue;
      best[i] = best[j]! + 1;
      next[i] = j;
      hashAt.set(`${i}`, h);
    }
  }
  if (best[0]! > maxPieces) return null;
  const out: string[] = [];
  for (let i = 0; i < n; i = next[i]!) out.push(hashAt.get(`${i}`)!);
  return out;
}

export interface ClipHandlers {
  onEnd(): void;
  /** The clip could not play (missing, blocked, offline and uncached): say it another way. */
  onFail(): void;
}

export interface VoiceClips {
  /** Length in ms of the clip for this line, or 0 when there is none. */
  lengthOf(text: string): number;
  play(text: string, h: ClipHandlers): boolean;
  stop(): void;
  /** Start downloading these lines' clips (the service worker keeps them), so they start without a gap. */
  prefetch?(texts: readonly string[]): void;
  /** Inside a user gesture: lets iOS play the clip element later. */
  warm(): void;
  /** True once the manifest has loaded and has at least one clip. */
  ready(): boolean;
}

export function manifestFrom(data: unknown): VoiceManifest | null {
  if (typeof data !== 'object' || data === null) return null;
  const clips = (data as { clips?: unknown }).clips;
  if (typeof clips !== 'object' || clips === null || Array.isArray(clips)) return null;
  const out: Record<string, number> = {};
  for (const [k, ms] of Object.entries(clips as Record<string, unknown>)) {
    if (/^[0-9a-f]{8}$/.test(k) && typeof ms === 'number' && ms > 0) out[k] = ms;
  }
  return { v: 1, clips: out };
}

/** Silent 0.1 s WAV, played once in a gesture so iOS lets this element play later. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function createVoiceClips(base = `${import.meta.env?.BASE_URL ?? '/'}voice/`, fetcher: typeof fetch | null = typeof fetch !== 'undefined' ? fetch : null): VoiceClips {
  let manifest: VoiceManifest | null = null;
  let el: HTMLAudioElement | null = null;
  /** Bumped by stop(): the handlers of an older clip go quiet. */
  let gen = 0;
  const fetched = new Set<string>();
  const plans = new Map<string, string[] | null>();
  const plan = (text: string): string[] | null => {
    if (!manifest) return null;
    const m = manifest;
    let p = plans.get(text);
    if (p === undefined) {
      p = planClips(text, (h) => (m.clips[h] ?? 0) > 0);
      if (plans.size > 2000) plans.clear();
      plans.set(text, p);
    }
    return p;
  };

  if (fetcher) {
    fetcher(`${base}manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        manifest = manifestFrom(d);
      })
      .catch(() => {
        manifest = null;
      });
  }

  const audio = (): HTMLAudioElement | null => {
    if (el) return el;
    try {
      el = typeof Audio !== 'undefined' ? new Audio() : null;
      if (el) el.preload = 'auto';
    } catch {
      el = null;
    }
    return el;
  };

  return {
    lengthOf(text) {
      const p = plan(text);
      return p ? p.reduce((ms, h) => ms + (manifest?.clips[h] ?? 0) + PIECE_GAP_MS, 0) : 0;
    },
    play(text, h) {
      const pieces = plan(text);
      const a = pieces ? audio() : null;
      if (!a || !pieces) return false;
      const mine = ++gen;
      const live = (): boolean => mine === gen;
      const start = (k: number): void => {
        if (!live()) return;
        if (k >= pieces.length) {
          h.onEnd();
          return;
        }
        a.onended = () => {
          if (k + 1 < pieces.length) setTimeout(() => start(k + 1), PIECE_GAP_MS);
          else start(k + 1);
        };
        a.onerror = () => live() && h.onFail();
        try {
          a.src = `${base}${pieces[k]}.m4a`;
          a.play()?.catch?.(() => live() && h.onFail());
        } catch {
          if (live()) h.onFail();
        }
      };
      try {
        start(0);
      } catch {
        return false;
      }
      return true;
    },
    prefetch(texts) {
      if (!fetcher || !manifest) return;
      for (const t of texts) {
        for (const h of plan(t) ?? []) {
          if (fetched.has(h)) continue;
          fetched.add(h);
          fetcher(`${base}${h}.m4a`).catch(() => fetched.delete(h));
        }
      }
    },
    stop() {
      gen++;
      if (!el) return;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    },
    warm() {
      const a = audio();
      if (!a || a.src) return;
      try {
        a.src = SILENCE;
        a.play()?.catch?.(() => undefined);
      } catch {
        /* ignore */
      }
    },
    ready() {
      return manifest !== null && Object.keys(manifest.clips).length > 0;
    },
  };
}
