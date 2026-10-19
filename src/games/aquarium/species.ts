/** The static table of who can live in the tank: species and their body profiles. */

// ---- who lives in the tank ----

export type CreatureKind = 'fish' | 'jelly' | 'ray' | 'crab';
export type Pattern = 'none' | 'stripes' | 'spots' | 'patches';

export interface Species {
  id: string;
  /** Vietnamese name, spoken when the child taps it. */
  name: string;
  kind: CreatureKind;
  /** Dark side, light belly, and the colour of the fins. */
  back: string;
  belly: string;
  fin: string;
  pattern: Pattern;
  patternColor: string;
  /** Body length, in tank units (one unit is a seventh of the tank's short side). */
  size: number;
  /** Half-widths head to tail, as a fraction of the body length. */
  profile: readonly number[];
  /** Cruising speed, tank units per second. */
  speed: number;
  /** Where in the tank it likes to be: 0 is the surface, 1 is the sand. */
  depth: number;
  /** Towards a finger (1) or away from it (-1). Shy fish are half the fun. */
  curious: number;
  /** How many are in a full tank. */
  count: number;
}

// Half-widths as a fraction of body length: a fish is far longer than it is deep,
// so these top out around a fifth of the length even on the fat ones.
const SLIM = [0.075, 0.115, 0.125, 0.105, 0.075, 0.045, 0.02];
const ROUND = [0.1, 0.165, 0.185, 0.15, 0.1, 0.055, 0.022];
const TALL = [0.11, 0.2, 0.225, 0.17, 0.1, 0.05, 0.02];
const BALL = [0.155, 0.235, 0.255, 0.2, 0.12, 0.06, 0.025];
const LONG = [0.07, 0.105, 0.115, 0.1, 0.08, 0.05, 0.022];
const SHARK = [0.085, 0.145, 0.155, 0.125, 0.085, 0.05, 0.022];

export const SPECIES: readonly Species[] = [
  {
    id: 'goldfish',
    name: 'cá vàng',
    kind: 'fish',
    back: '#f97316',
    belly: '#fed7aa',
    fin: '#fb923c',
    pattern: 'none',
    patternColor: '#fff',
    size: 1.2,
    profile: ROUND,
    speed: 0.85,
    depth: 0.42,
    curious: 1,
    count: 2,
  },
  {
    id: 'clown',
    name: 'cá hề',
    kind: 'fish',
    back: '#f97316',
    belly: '#fdba74',
    fin: '#ea580c',
    pattern: 'stripes',
    patternColor: '#ffffff',
    size: 0.95,
    profile: ROUND,
    speed: 1.05,
    depth: 0.58,
    curious: 1,
    count: 3,
  },
  {
    id: 'koi',
    name: 'cá koi',
    kind: 'fish',
    back: '#fef3c7',
    belly: '#ffffff',
    fin: '#fde68a',
    pattern: 'patches',
    patternColor: '#f97316',
    size: 1.7,
    profile: LONG,
    speed: 0.7,
    depth: 0.3,
    curious: 0.5,
    count: 1,
  },
  {
    id: 'guppy',
    name: 'cá bảy màu',
    kind: 'fish',
    back: '#a855f7',
    belly: '#f0abfc',
    fin: '#38bdf8',
    pattern: 'spots',
    patternColor: '#fde047',
    size: 0.62,
    profile: SLIM,
    speed: 1.4,
    depth: 0.18,
    curious: 1,
    count: 4,
  },
  {
    id: 'angel',
    name: 'cá thần tiên',
    kind: 'fish',
    back: '#e2e8f0',
    belly: '#f8fafc',
    fin: '#fcd34d',
    pattern: 'stripes',
    patternColor: '#1e293b',
    size: 1.1,
    profile: TALL,
    speed: 0.6,
    depth: 0.46,
    curious: -0.5,
    count: 2,
  },
  {
    id: 'puffer',
    name: 'cá nóc',
    kind: 'fish',
    back: '#fbbf24',
    belly: '#fef3c7',
    fin: '#f59e0b',
    pattern: 'spots',
    patternColor: '#78350f',
    size: 1,
    profile: BALL,
    speed: 0.45,
    depth: 0.68,
    curious: -1,
    count: 1,
  },
  {
    id: 'zebra',
    name: 'cá ngựa vằn',
    kind: 'fish',
    back: '#38bdf8',
    belly: '#e0f2fe',
    fin: '#7dd3fc',
    pattern: 'stripes',
    patternColor: '#0c4a6e',
    size: 0.58,
    profile: SLIM,
    speed: 1.6,
    depth: 0.28,
    curious: 1,
    count: 4,
  },
  {
    id: 'tang',
    name: 'cá xanh',
    kind: 'fish',
    back: '#2563eb',
    belly: '#60a5fa',
    fin: '#facc15',
    pattern: 'none',
    patternColor: '#fff',
    size: 1.05,
    profile: TALL,
    speed: 0.9,
    depth: 0.54,
    curious: 0.5,
    count: 2,
  },
  {
    id: 'shark',
    name: 'cá mập con',
    kind: 'fish',
    back: '#64748b',
    belly: '#e2e8f0',
    fin: '#475569',
    pattern: 'none',
    patternColor: '#fff',
    size: 1.8,
    profile: SHARK,
    speed: 0.65,
    depth: 0.62,
    curious: -0.3,
    count: 1,
  },
  {
    id: 'jelly',
    name: 'con sứa',
    kind: 'jelly',
    back: '#f0abfc',
    belly: '#fae8ff',
    fin: '#e879f9',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.85,
    profile: ROUND,
    speed: 0.3,
    depth: 0.22,
    curious: 0,
    count: 2,
  },
  {
    id: 'ray',
    name: 'cá đuối',
    kind: 'ray',
    back: '#7c3aed',
    belly: '#ddd6fe',
    fin: '#a78bfa',
    pattern: 'spots',
    patternColor: '#ede9fe',
    size: 1.3,
    profile: LONG,
    speed: 0.55,
    depth: 0.78,
    curious: 0,
    count: 1,
  },
  {
    id: 'crab',
    name: 'con cua',
    kind: 'crab',
    back: '#ef4444',
    belly: '#fca5a5',
    fin: '#b91c1c',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.8,
    profile: ROUND,
    speed: 0.35,
    depth: 1,
    curious: -1,
    count: 1,
  },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}
