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
  /** Child's age (2, 3 or 4) used to hide games that are too hard yet; 0 shows everything. */
  age: 0 | 2 | 3 | 4;
  /** Gentle "time for a rest" reminder after this many minutes of play; 0 = off. */
  breakMinutes: number;
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
}

interface State {
  stars: Record<string, number>;
  stickers: string[];
  settings: Settings;
  favorites: string[];
  lastPlayed: string | null;
}

const KEY = 'be-choi:v1';
const DEFAULTS: Settings = { sound: true, voice: true, theme: 'auto', stickerPopup: true, confetti: true, age: 0, breakMinutes: 0 };

/**
 * Stars per game and parent settings, persisted in localStorage. Every storage
 * access is guarded so private browsing or a blocked storage still lets the
 * app run with in-memory state.
 */
export function createStore(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): Store {
  let state: State = load();

  function load(): State {
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>;
        return {
          stars: { ...(parsed.stars ?? {}) },
          stickers: [...(parsed.stickers ?? [])],
          settings: { ...DEFAULTS, ...(parsed.settings ?? {}) },
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((id) => typeof id === 'string') : [],
          lastPlayed: typeof parsed.lastPlayed === 'string' ? parsed.lastPlayed : null,
        };
      }
    } catch {
      /* fall through to defaults */
    }
    return { stars: {}, stickers: [], settings: { ...DEFAULTS }, favorites: [], lastPlayed: null };
  }

  function save(): void {
    try {
      storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota or blocked: keep in-memory */
    }
  }

  return {
    stars(id) {
      return state.stars[id] ?? 0;
    },
    addStar(id) {
      const n = (state.stars[id] ?? 0) + 1;
      state.stars[id] = n;
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
    setSettings(patch) {
      state = { ...state, settings: { ...state.settings, ...patch } };
      save();
      return { ...state.settings };
    },
  };
}
