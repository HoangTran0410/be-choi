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
}

interface State {
  stars: Record<string, number>;
  stickers: string[];
  settings: Settings;
}

const KEY = 'be-choi:v1';
const DEFAULTS: Settings = { sound: true, voice: true, theme: 'auto', stickerPopup: true, confetti: true };

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
        };
      }
    } catch {
      /* fall through to defaults */
    }
    return { stars: {}, stickers: [], settings: { ...DEFAULTS } };
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
    setSettings(patch) {
      state = { ...state, settings: { ...state.settings, ...patch } };
      save();
      return { ...state.settings };
    },
  };
}
