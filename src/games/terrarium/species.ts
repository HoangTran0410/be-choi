/** The static table of who can live in the terrarium: species and their body profiles. */
import type { FxKind } from '../../core/audio';

// ---- who lives in the box ----

export type CreatureKind = 'reptile' | 'snake' | 'turtle' | 'bug' | 'hopper' | 'snail' | 'flyer';
export type Pattern = 'none' | 'bands' | 'spots' | 'stripes';

export interface Species {
  id: string;
  /** Vietnamese name, spoken when the child taps it. */
  name: string;
  kind: CreatureKind;
  /** Dark back, light belly, and the colour of the legs. */
  back: string;
  belly: string;
  limb: string;
  pattern: Pattern;
  patternColor: string;
  /** Body length, in box units (one unit is a seventh of the box's short side). */
  size: number;
  /** Half-widths head to tail, as a fraction of the body length. */
  profile: readonly number[];
  /** Walking speed, box units per second. */
  speed: number;
  /** Walks up the glass and across the lid. The reason to have a lid at all. */
  climbs: boolean;
  /** Awake after dark and dozing by day. The lamp button swaps who is busy. */
  nocturnal: boolean;
  /** Towards a finger (1) or away from it (-1). Shy ones are half the fun. */
  curious: number;
  /** A recorded or synthesized voice, for the ones that have one. */
  voice?: FxKind;
  /**
   * It can fly, and once in a while it flies straight at the child — bigger and
   * bigger until it hits the front glass with a bonk and drops off it. One animal
   * in the box has this, and one is plenty.
   */
  flies?: boolean;
}

// Half-widths as a fraction of body length. A lizard is far longer than it is
// deep, and the tail has to come down to nearly nothing or it reads as a stump.
const LIZARD = [0.075, 0.105, 0.115, 0.09, 0.06, 0.033, 0.014];
const STOUT = [0.095, 0.135, 0.145, 0.11, 0.07, 0.038, 0.015];
const NOODLE = [0.048, 0.058, 0.06, 0.055, 0.045, 0.03, 0.012];
const SHELL = [0.14, 0.2, 0.22, 0.17, 0.1, 0.05, 0.02];
const CHUBBY = [0.16, 0.23, 0.245, 0.19, 0.11, 0.055, 0.022];
const BEETLE = [0.13, 0.19, 0.2, 0.155, 0.095, 0.05, 0.02];
const TINY = [0.11, 0.16, 0.15, 0.12, 0.08, 0.045, 0.018];

export const SPECIES: readonly Species[] = [
  {
    id: 'gecko',
    name: 'con thạch sùng',
    kind: 'reptile',
    back: '#d6bda7',
    belly: '#faf1e8',
    limb: '#c0a289',
    pattern: 'spots',
    patternColor: '#8b6f5c',
    size: 1.05,
    profile: LIZARD,
    speed: 1.5,
    climbs: true,
    nocturnal: true,
    curious: 0.5,
  },
  {
    id: 'lizard',
    name: 'con thằn lằn',
    kind: 'reptile',
    back: '#4ade80',
    belly: '#dcfce7',
    limb: '#22c55e',
    pattern: 'bands',
    patternColor: '#166534',
    size: 1.2,
    profile: LIZARD,
    speed: 1.7,
    climbs: false,
    nocturnal: false,
    curious: -0.5,
  },
  {
    id: 'chameleon',
    name: 'con tắc kè hoa',
    kind: 'reptile',
    back: '#2dd4bf',
    belly: '#ccfbf1',
    limb: '#14b8a6',
    pattern: 'spots',
    patternColor: '#fbbf24',
    size: 1.15,
    profile: STOUT,
    speed: 0.45,
    climbs: true,
    nocturnal: false,
    curious: 0,
  },
  {
    id: 'turtle',
    name: 'con rùa',
    kind: 'turtle',
    back: '#65a30d',
    belly: '#d9f99d',
    limb: '#4d7c0f',
    pattern: 'spots',
    patternColor: '#3f6212',
    size: 1.1,
    profile: SHELL,
    speed: 0.35,
    climbs: false,
    nocturnal: false,
    curious: -0.4,
  },
  {
    id: 'snake',
    name: 'con rắn',
    kind: 'snake',
    back: '#fbbf24',
    belly: '#fef3c7',
    limb: '#f59e0b',
    pattern: 'bands',
    patternColor: '#ea580c',
    size: 2.1,
    profile: NOODLE,
    speed: 0.95,
    climbs: false,
    nocturnal: false,
    curious: 0.4,
  },
  {
    id: 'frog',
    name: 'con ếch',
    kind: 'hopper',
    back: '#22c55e',
    belly: '#dcfce7',
    limb: '#16a34a',
    pattern: 'spots',
    patternColor: '#166534',
    size: 0.85,
    profile: CHUBBY,
    speed: 1.1,
    climbs: false,
    nocturnal: true,
    curious: 0.6,
    voice: 'frog',
  },
  {
    id: 'cricket',
    name: 'con dế',
    kind: 'hopper',
    back: '#78716c',
    belly: '#d6d3d1',
    limb: '#44403c',
    pattern: 'stripes',
    patternColor: '#292524',
    size: 0.45,
    profile: BEETLE,
    speed: 1.4,
    climbs: false,
    nocturnal: true,
    curious: -1,
    voice: 'cricket',
  },
  {
    id: 'ladybug',
    name: 'con bọ rùa',
    kind: 'bug',
    back: '#ef4444',
    belly: '#7f1d1d',
    limb: '#1c1917',
    pattern: 'spots',
    patternColor: '#111827',
    size: 0.42,
    profile: BEETLE,
    speed: 1.1,
    climbs: true,
    nocturnal: false,
    curious: 1,
  },
  {
    id: 'ant',
    name: 'con kiến',
    kind: 'bug',
    back: '#7c2d12',
    belly: '#431407',
    limb: '#1c1917',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.32,
    profile: TINY,
    speed: 2,
    climbs: true,
    nocturnal: false,
    curious: 1,
  },
  {
    id: 'beetle',
    name: 'con bọ cánh cứng',
    kind: 'bug',
    back: '#10b981',
    belly: '#064e3b',
    limb: '#065f46',
    pattern: 'stripes',
    patternColor: '#facc15',
    size: 0.7,
    profile: BEETLE,
    speed: 0.75,
    climbs: false,
    nocturnal: false,
    curious: -0.5,
  },
  {
    id: 'roach',
    name: 'con gián',
    kind: 'bug',
    back: '#7a4a22',
    belly: '#3d2410',
    limb: '#241407',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.55,
    profile: BEETLE,
    speed: 2.2,
    climbs: true,
    nocturnal: true,
    curious: -1,
    flies: true,
  },
  {
    id: 'snail',
    name: 'con ốc sên',
    kind: 'snail',
    back: '#d97706',
    belly: '#fef3c7',
    limb: '#fbbf24',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.6,
    profile: STOUT,
    speed: 0.18,
    climbs: true,
    nocturnal: true,
    curious: 0,
  },
  {
    id: 'butterfly',
    name: 'con bướm',
    kind: 'flyer',
    back: '#f472b6',
    belly: '#fbcfe8',
    limb: '#be185d',
    pattern: 'spots',
    patternColor: '#fde047',
    size: 0.62,
    profile: TINY,
    speed: 1,
    climbs: false,
    nocturnal: false,
    curious: 0.3,
  },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}
