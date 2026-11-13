import type { VoicePitch } from '../core/speech';
import { normalizeAge, type AgeFilter } from './ages';
import { readRaw, writeRaw } from '../core/save';

export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  sound: boolean;
  voice: boolean;
  theme: Theme;
  /**
   * Announce a new sticker with the full-screen moment. Stickers are collected
   * either way; this is only whether the game stops to say so. In a long game
   * the stars come thick and fast, and being interrupted every third one is
   * more of an interruption than a reward.
   */
  stickerPopup: boolean;
  /**
   * Throw confetti over the stage when a round is won. Separate from the
   * sticker announcement above because it fires three times as often: the
   * jingle and the praise still say "well done", this is only the paper.
   */
  confetti: boolean;
  /** Child's age (2 to 6) used to hide games that are too hard yet; 0 shows everything. */
  age: AgeFilter;
  /** Gentle "time for a rest" reminder after this many minutes of play; 0 = off. */
  breakMinutes: number;
  /** Show the "Hôm nay chơi gì" row of three suggestions on the home screen. */
  todayPick: boolean;
  /** Chosen Vietnamese voice (the engine's voiceURI); '' lets the app pick. */
  voiceId: string;
  voicePitch: VoicePitch;
}

export interface DayReport {
  /** Local date, YYYY-MM-DD. */
  key: string;
  ms: number;
  stars: number;
  games: Record<string, number>;
}

export interface Store {
  stars(id: string): number;
  addStar(id: string): number;
  /** Sum of stars over all games. */
  totalStars(): number;
  resetStars(): void;
  stickers(): string[];
  addSticker(emoji: string): void;
  settings(): Settings;
  setSettings(patch: Partial<Settings>): Settings;
  /** Games the child likes best, in the order they were picked; shown first on the home screen. */
  favorites(): string[];
  /** Add or remove one. Returns whether it is now a favourite. */
  toggleFavorite(id: string): boolean;
  /** The game opened most recently, for the "Chơi tiếp" tile; null before the first one. */
  lastPlayed(): string | null;
  setLastPlayed(id: string): void;
  /** Note that a game was opened. Only the latest few are kept. */
  recordPlay(id: string): void;
  /** Recent plays, oldest first, one id per play. */
  recentPlays(): string[];
  /** The suggestions fixed for one day, so they hold still while the child plays them. */
  /**
   * Play-time tracking for the parent report. `recordPlay` starts a session; `tickPlay` adds the
   * time since the last tick to that game (called every few seconds while a game is open);
   * `endPlay` closes the session. A gap longer than a minute between ticks (device asleep) is not counted.
   */
  tickPlay(): void;
  endPlay(): void;
  /** Last `days` days (oldest first, today last): time played, stars earned, per-game ms. */
  playReport(days?: number): DayReport[];
  todayPicks(): { key: string; ids: string[] } | null;
  setTodayPicks(key: string, ids: string[]): void;
}

interface State {
  stars: Record<string, number>;
  stickers: string[];
  settings: Settings;
  favorites: string[];
  lastPlayed: string | null;
  recent: string[];
  today: { key: string; ids: string[] } | null;
  daily: Record<string, { ms: number; stars: number; games: Record<string, number> }>;
}

const RECENT_MAX = 30;
const DAILY_KEEP = 21;
const MAX_TICK_MS = 60_000;
const KEY = 'be-choi:v1';
const DEFAULTS: Settings = {
  sound: true,
  voice: true,
  theme: 'auto',
  stickerPopup: true,
  confetti: true,
  age: 0,
  breakMinutes: 0,
  todayPick: true,
  voiceId: '',
  voicePitch: 'normal',
};

/**
 * Stars per game and parent settings, persisted in localStorage. Every storage
 * access is guarded so private browsing or a blocked storage still lets the
 * app run with in-memory state.
 */
export function dayKey(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createStore(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
  now: () => number = Date.now,
): Store {
  let state: State = load();
  let session: { id: string; last: number } | null = null;

  function day(key: string) {
    return (state.daily[key] ??= { ms: 0, stars: 0, games: {} });
  }
  function prune() {
    const keys = Object.keys(state.daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - DAILY_KEEP))) delete state.daily[k];
  }
  function cleanDaily(raw: unknown): State['daily'] {
    const out: State['daily'] = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
      const games: Record<string, number> = {};
      for (const [id, ms] of Object.entries(v.games ?? {})) if (typeof ms === 'number' && ms > 0) games[id] = ms;
      out[k] = { ms: Number(v.ms) > 0 ? Number(v.ms) : 0, stars: Number(v.stars) > 0 ? Number(v.stars) : 0, games };
    }
    return out;
  }

  function load(): State {
    try {
      const raw = readRaw(KEY, storage);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>;
        return {
          stars: { ...(parsed.stars ?? {}) },
          stickers: [...(parsed.stickers ?? [])],
          settings: { ...DEFAULTS, ...(parsed.settings ?? {}), age: normalizeAge(parsed.settings?.age ?? 0) },
          daily: cleanDaily(parsed.daily),
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((id) => typeof id === 'string') : [],
          lastPlayed: typeof parsed.lastPlayed === 'string' ? parsed.lastPlayed : null,
          recent: Array.isArray(parsed.recent) ? parsed.recent.filter((id) => typeof id === 'string').slice(-RECENT_MAX) : [],
          today:
            parsed.today && typeof parsed.today.key === 'string' && Array.isArray(parsed.today.ids)
              ? { key: parsed.today.key, ids: parsed.today.ids.filter((id) => typeof id === 'string') }
              : null,
        };
      }
    } catch {
      /* fall through to defaults */
    }
    return { stars: {}, stickers: [], settings: { ...DEFAULTS }, favorites: [], lastPlayed: null, recent: [], today: null, daily: {} };
  }

  function save(): void {
    // Quota or blocked: keep in-memory.
    writeRaw(KEY, JSON.stringify(state), storage);
  }

  return {
    stars(id) {
      return state.stars[id] ?? 0;
    },
    addStar(id) {
      const n = (state.stars[id] ?? 0) + 1;
      state.stars[id] = n;
      day(dayKey(now())).stars++;
      prune();
      save();
      return n;
    },
    totalStars() {
      return Object.values(state.stars).reduce((a, b) => a + b, 0);
    },
    resetStars() {
      state.stars = {};
      state.stickers = [];
      save();
    },
    stickers() {
      return [...state.stickers];
    },
    addSticker(emoji) {
      if (!state.stickers.includes(emoji)) state.stickers.push(emoji);
      save();
    },
    settings() {
      return { ...state.settings };
    },
    favorites() {
      return [...state.favorites];
    },
    toggleFavorite(id) {
      const on = !state.favorites.includes(id);
      state.favorites = on ? [...state.favorites, id] : state.favorites.filter((x) => x !== id);
      save();
      return on;
    },
    lastPlayed() {
      return state.lastPlayed;
    },
    setLastPlayed(id) {
      if (state.lastPlayed === id) return;
      state.lastPlayed = id;
      save();
    },
    recordPlay(id) {
      session = { id, last: now() };
      state.recent = [...state.recent, id].slice(-RECENT_MAX);
      save();
    },
    tickPlay() {
      if (!session) return;
      const t = now();
      const ms = t - session.last;
      session.last = t;
      if (ms <= 0 || ms > MAX_TICK_MS) return;
      const d = day(dayKey(t));
      d.ms += ms;
      d.games[session.id] = (d.games[session.id] ?? 0) + ms;
      prune();
      save();
    },
    endPlay() {
      this.tickPlay();
      session = null;
    },
    playReport(days = 7) {
      const out: DayReport[] = [];
      const t = new Date(now());
      for (let i = days - 1; i >= 0; i--) {
        const key = dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - i, 12).getTime());
        const d = state.daily[key];
        out.push({ key, ms: d?.ms ?? 0, stars: d?.stars ?? 0, games: { ...(d?.games ?? {}) } });
      }
      return out;
    },
    recentPlays() {
      return [...state.recent];
    },
    todayPicks() {
      return state.today ? { key: state.today.key, ids: [...state.today.ids] } : null;
    },
    setTodayPicks(key, ids) {
      state.today = { key, ids: [...ids] };
      save();
    },
    setSettings(patch) {
      state = { ...state, settings: { ...state.settings, ...patch } };
      save();
      return { ...state.settings };
    },
  };
}
