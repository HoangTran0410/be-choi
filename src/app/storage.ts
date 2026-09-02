export interface Settings {
  sound: boolean;
  voice: boolean;
}

export interface Store {
  stars(id: string): number;
  addStar(id: string): number;
  resetStars(): void;
  settings(): Settings;
  setSettings(patch: Partial<Settings>): Settings;
}

interface State {
  stars: Record<string, number>;
  settings: Settings;
}

const KEY = 'be-choi:v1';
const DEFAULTS: Settings = { sound: true, voice: true };

/**
 * Stars per game and parent settings, persisted in localStorage. Every storage
 * access is guarded so private browsing or a blocked storage still lets the
 * app run with in-memory state.
 */
export function createStore(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): Store {
  let state: State = load();

  function load(): State {
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>;
        return {
          stars: { ...(parsed.stars ?? {}) },
          settings: { ...DEFAULTS, ...(parsed.settings ?? {}) },
        };
      }
    } catch {
      /* fall through to defaults */
    }
    return { stars: {}, settings: { ...DEFAULTS } };
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
    resetStars() {
      state.stars = {};
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
