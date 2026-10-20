/**
 * The robots: who they are (name, colour, instrument, group), what they play (three patterns of
 * rising busyness for each of the three drum feels, written relative to the chord so they cannot
 * clash) and how they dance. Patterns use the tiny language documented on `parseBars`.
 */
import type { DrumKind, Timbre } from '../../core/audio';
import type { InstrumentId } from '../../core/instruments';
import type { Look } from './art';
import type { DanceId } from './dance';
import { DRUM_STYLES, parseBars, type Bars, type DrumStyle, type Level, type Player, type SongId, type Voice } from './groove';
import { MIX } from './mix';
import { PATTERNS, type RobotPatterns } from './patterns';

/** What a robot is for, in the music. The quests and the gentle hints talk in these. */
export type Role = 'beat' | 'bass' | 'chord' | 'melody' | 'color';
/** How the instrument is played; the robot voice says it out loud. */
export type Group = 'gõ' | 'gảy' | 'thổi' | 'kéo' | 'phím';

export interface RobotDef {
  id: string;
  /** What the voice calls this robot's instrument ("trống cái"). */
  name: string;
  color: string;
  /** Vietnamese colour word. */
  colorName: string;
  role: Role;
  group: Group;
  /** The robot's usual voice for tonal hits (drum robots play drums and never use it). */
  timbre: Timbre;
  /** Its instrument in each song, where that differs from `timbre` (the palette changes with the song). */
  voices?: Partial<Record<SongId, Voice>>;
  /** World instruments that stand in for its drums in a song (shaker to maracas, tom to djembe ...). */
  perc?: Partial<Record<SongId, Partial<Record<DrumKind, InstrumentId>>>>;
  /** Its place in the mix, 0 to 1.2: the bass and kick carry, the sparkle sits back. */
  vol: number;
  dance: DanceId;
  look: Look;
  /** Easy / medium / busy patterns for each of the drum feels. */
  patterns: RobotPatterns;
}

export const ROBOTS: readonly RobotDef[] = [
  {
    id: 'kick',
    name: 'trống cái',
    color: '#ef4444',
    colorName: 'đỏ',
    role: 'beat',
    group: 'gõ',
    timbre: 'bass',
    dance: 'stomp',
    look: { head: 'square', antenna: 'ball', eyes: 'round', belly: 'dots', ears: 'bolts', prop: 'kick', accent: '#fecaca' },
    patterns: PATTERNS.kick,
    vol: 0.85,
  },
  {
    id: 'bass',
    name: 'đàn bass',
    color: '#3b82f6',
    colorName: 'xanh dương',
    role: 'bass',
    group: 'gảy',
    timbre: 'bass',
    dance: 'sway',
    look: { head: 'wide', antenna: 'none', eyes: 'visor', belly: 'lines', ears: 'cups', prop: 'bass', accent: '#bfdbfe' },
    patterns: PATTERNS.bass,
    vol: 0.8,
    voices: { fun: 'bass', disco: 'bass', calm: 'bass', latin: 'bass', east: 'marimba' },
  },
  {
    id: 'piano',
    name: 'đàn piano',
    color: '#a855f7',
    colorName: 'tím',
    role: 'chord',
    group: 'phím',
    timbre: 'piano',
    dance: 'bob',
    look: { head: 'round', antenna: 'heart', eyes: 'happy', belly: 'heart', ears: 'none', prop: 'piano', accent: '#e9d5ff' },
    patterns: PATTERNS.piano,
    vol: 0.6,
    voices: { fun: 'piano', disco: 'organ', calm: 'vibraphone', latin: 'piano', east: 'harp' },
  },
  {
    id: 'guitar',
    name: 'đàn ghi-ta',
    color: '#22c55e',
    colorName: 'xanh lá',
    role: 'chord',
    group: 'gảy',
    timbre: 'guitar',
    dance: 'strum',
    look: { head: 'dome', antenna: 'flower', eyes: 'big', belly: 'star', ears: 'discs', prop: 'guitar', accent: '#bbf7d0' },
    patterns: PATTERNS.guitar,
    vol: 0.6,
    voices: { fun: 'ukulele', disco: 'guitar', calm: 'harp', latin: 'guitar', east: 'banjo' },
  },
  {
    id: 'xylo',
    name: 'đàn gõ',
    color: '#facc15',
    colorName: 'vàng',
    role: 'melody',
    group: 'gõ',
    timbre: 'xylo',
    dance: 'mallet',
    look: { head: 'tall', antenna: 'twin', eyes: 'star', belly: 'grid', ears: 'bolts', prop: 'xylo', accent: '#fef08a' },
    patterns: PATTERNS.xylo,
    vol: 0.8,
    voices: { fun: 'marimba', disco: 'vibraphone', calm: 'kalimba', latin: 'steelpan', east: 'handpan' },
  },
  {
    id: 'snare',
    name: 'trống con',
    color: '#f97316',
    colorName: 'cam',
    role: 'beat',
    group: 'gõ',
    timbre: 'bass',
    dance: 'tap',
    look: { head: 'round', antenna: 'bolt', eyes: 'round', belly: 'dots', ears: 'cups', prop: 'snare', accent: '#fed7aa' },
    patterns: PATTERNS.snare,
    vol: 0.8,
  },
  {
    id: 'bell',
    name: 'chuông',
    color: '#ec4899',
    colorName: 'hồng',
    role: 'color',
    group: 'gõ',
    timbre: 'bell',
    dance: 'ring',
    look: { head: 'round', antenna: 'ball', eyes: 'happy', belly: 'star', ears: 'discs', prop: 'bell', accent: '#fbcfe8' },
    patterns: PATTERNS.bell,
    vol: 0.55,
    voices: { fun: 'bell', disco: 'bell', calm: 'chimes', latin: 'vibraphone', east: 'chimes' },
  },
  {
    id: 'shaker',
    name: 'lục lạc',
    color: '#94a3b8',
    colorName: 'xám',
    role: 'beat',
    group: 'gõ',
    timbre: 'bass',
    dance: 'shake',
    look: { head: 'dome', antenna: 'twin', eyes: 'big', belly: 'grid', ears: 'none', prop: 'shaker', accent: '#e2e8f0' },
    patterns: PATTERNS.shaker,
    vol: 0.65,
    perc: { latin: { shaker: 'maracas' }, east: { shaker: 'tambourine' } },
  },
  {
    id: 'flute',
    name: 'sáo',
    color: '#14b8a6',
    colorName: 'xanh ngọc',
    role: 'melody',
    group: 'thổi',
    timbre: 'flute',
    dance: 'lean',
    look: { head: 'tall', antenna: 'flower', eyes: 'happy', belly: 'heart', ears: 'none', prop: 'flute', accent: '#99f6e4' },
    patterns: PATTERNS.flute,
    vol: 0.7,
    voices: { fun: 'flute', disco: 'flute', calm: 'panflute', latin: 'panflute', east: 'flute' },
  },
  {
    id: 'cowbell',
    name: 'chuông bò',
    color: '#334155',
    colorName: 'đen',
    role: 'beat',
    group: 'gõ',
    timbre: 'bass',
    dance: 'shake',
    look: { head: 'square', antenna: 'bolt', eyes: 'visor', belly: 'bolt', ears: 'discs', prop: 'cowbell', accent: '#94a3b8' },
    patterns: PATTERNS.cowbell,
    vol: 0.7,
    perc: { east: { cowbell: 'castanets' } },
  },
  {
    id: 'tom',
    name: 'trống tom',
    color: '#a16207',
    colorName: 'nâu',
    role: 'beat',
    group: 'gõ',
    timbre: 'bass',
    dance: 'tap',
    look: { head: 'wide', antenna: 'ball', eyes: 'big', belly: 'lines', ears: 'bolts', prop: 'tom', accent: '#fde68a' },
    patterns: PATTERNS.tom,
    vol: 0.8,
    perc: { latin: { tom: 'djembe' }, east: { tom: 'djembe', crash: 'gong' } },
  },
  {
    id: 'trumpet',
    name: 'kèn trumpet',
    color: '#84cc16',
    colorName: 'xanh chanh',
    role: 'melody',
    group: 'thổi',
    timbre: 'trumpet',
    dance: 'lean',
    look: { head: 'dome', antenna: 'bolt', eyes: 'round', belly: 'star', ears: 'cups', prop: 'trumpet', accent: '#d9f99d' },
    patterns: PATTERNS.trumpet,
    vol: 0.7,
    voices: { fun: 'trumpet', disco: 'trumpet', calm: 'harmonica', latin: 'trumpet', east: 'panflute' },
  },
  {
    id: 'sax',
    name: 'kèn sắc-xô',
    color: '#38bdf8',
    colorName: 'xanh da trời',
    role: 'melody',
    group: 'thổi',
    timbre: 'sax',
    dance: 'lean',
    look: { head: 'round', antenna: 'twin', eyes: 'visor', belly: 'heart', ears: 'discs', prop: 'sax', accent: '#bae6fd' },
    patterns: PATTERNS.sax,
    vol: 0.7,
    voices: { fun: 'sax', disco: 'sax', calm: 'sax', latin: 'accordion', east: 'harmonica' },
  },
  {
    id: 'violin',
    name: 'đàn vi-ô-lông',
    color: '#e2e8f0',
    colorName: 'trắng',
    role: 'melody',
    group: 'kéo',
    timbre: 'violin',
    dance: 'bow',
    look: { head: 'tall', antenna: 'heart', eyes: 'happy', belly: 'dots', ears: 'bolts', prop: 'violin', accent: '#c4b5fd' },
    patterns: PATTERNS.violin,
    vol: 0.6,
    voices: { fun: 'violin', disco: 'violin', calm: 'organ', latin: 'violin', east: 'violin' },
  },
  {
    id: 'triangle',
    name: 'kẻng tam giác',
    color: '#d6a35c',
    colorName: 'vàng đồng',
    role: 'color',
    group: 'gõ',
    timbre: 'bell',
    dance: 'ring',
    look: { head: 'square', antenna: 'flower', eyes: 'star', belly: 'bolt', ears: 'none', prop: 'triangle', accent: '#fde7c0' },
    patterns: PATTERNS.triangle,
    vol: 0.6,
    perc: { east: { triangle: 'chimes', ride: 'chimes' } },
  },
];

/** The five robots on the shelf the first time. */
export const STARTERS: readonly string[] = ['kick', 'bass', 'piano', 'guitar', 'xylo'];

const BY_ID = new Map(ROBOTS.map((r) => [r.id, r]));

export function findRobot(id: string): RobotDef | undefined {
  return BY_ID.get(id);
}

/** Patterns parsed once: robot id → style → level. */
const PARSED = new Map<string, Record<DrumStyle, Bars[]>>();
for (const r of ROBOTS) {
  const byStyle = {} as Record<DrumStyle, Bars[]>;
  for (const s of DRUM_STYLES) {
    const trio = r.patterns[s];
    byStyle[s] = trio.map((t) => parseBars(t));
  }
  PARSED.set(r.id, byStyle);
}

/** The bars a robot plays for this feel and level. */
export function barsOf(id: string, style: DrumStyle, level: Level): Bars {
  return PARSED.get(id)?.[style][level - 1] ?? [[]];
}

/** What the groove needs to play this robot. */
export function playerFor(robot: RobotDef): Player {
  return {
    timbre: robot.timbre,
    bars: (style, level) => barsOf(robot.id, style, level),
    voice: (song) => robot.voices?.[song] ?? robot.timbre,
    perc: (song, kind) => robot.perc?.[song]?.[kind],
    vol: (song) => MIX[robot.id]?.[song] ?? robot.vol,
  };
}

export const COUNT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám'] as const;
