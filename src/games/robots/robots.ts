/**
 * The robots: who they are (name, colour, instrument, group), what they play (three patterns of
 * rising busyness for each of the three drum feels, written relative to the chord so they cannot
 * clash) and how they dance. Patterns use the tiny language documented on `parseBars`.
 */
import type { Timbre } from '../../core/audio';
import type { Look } from './art';
import type { DanceId } from './dance';
import { parseBars, type Bars, type DrumStyle, type Level, type Player } from './groove';

/** What a robot is for, in the music. The quests and the gentle hints talk in these. */
export type Role = 'beat' | 'bass' | 'chord' | 'melody' | 'color';
/** How the instrument is played; the robot voice says it out loud. */
export type Group = 'gõ' | 'gảy' | 'thổi' | 'kéo' | 'phím';

type Trio = readonly [string, string, string];

export interface RobotDef {
  id: string;
  /** What the voice calls this robot's instrument ("trống cái"). */
  name: string;
  color: string;
  /** Vietnamese colour word. */
  colorName: string;
  role: Role;
  group: Group;
  /** Voice for tonal hits (drum robots play drums and never use it). */
  timbre: Timbre;
  dance: DanceId;
  look: Look;
  /** Easy / medium / busy patterns; a feel that is missing uses `pop`. */
  patterns: { pop: Trio } & Partial<Record<DrumStyle, Trio>>;
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
    patterns: {
      pop: ['0K 8K', '0K 8K 10K', '0K 3K 8K 10K | 0K 3K 8K 10K | 0K 3K 8K 10K | 0K 6K 8K 10K 14K'],
      disco: ['0K 8K', '0K 4K 8K 12K', '0K 4K 8K 12K | 0K 4K 8K 12K | 0K 4K 8K 12K | 0K 4K 8K 12K 14K'],
      soft: ['0K', '0K 8K', '0K 6K 8K'],
    },
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
    patterns: {
      pop: [
        '0b0:7 8b0:7',
        '0b0:3 4b0:2 6b1:2 8b0:3 12b1:2 14b0:2',
        '0b0:2 2b0:2 4b2:2 6b0:2 8b1:2 10b1:2 12b2:2 14b1:2 | 0b0:2 2b0:2 4b2:2 6b0:2 8b1:2 10b1:2 12b2:2 14b1:2 | 0b0:2 2b0:2 4b2:2 6b0:2 8b1:2 10b1:2 12b2:2 14b1:2 | 0b0:2 2b0:2 4b2:2 6b0:2 8b1:2 10b2:2 12b1:2 14b0:2',
      ],
      disco: [
        '0b0:4 8b0:4',
        '0b0:2 2b2:2 4b0:2 6b2:2 8b0:2 10b2:2 12b0:2 14b2:2',
        '0b0:1 1b0:1 2b2:2 4b0:1 5b0:1 6b2:2 8b0:1 9b0:1 10b2:2 12b0:1 13b0:1 14b2:2',
      ],
      soft: ['0b0:15', '0b0:8 8b1:8', '0b0:4 4b1:4 8b0:4 12b2:4'],
    },
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
    patterns: {
      pop: ['0t:14', '0t:6 8t:6', '0t:5 6t:2 8t:5 14t:2'],
      disco: ['0t:8 8t:8', '2t:1.5 6t:1.5 10t:1.5 14t:1.5', '2t:1 3t:1 6t:1 10t:1 11t:1 14t:1'],
      soft: ['0t:15', '0c0:8 2c1:8 4c2:8', '0c0:3 4c2:3 8c1:3 12c2:3'],
    },
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
    patterns: {
      pop: [
        '0c0:4 4c1:4 8c2:4 12c1:4',
        '0c0:2 2c1:2 4c2:2 6c3:2 8c2:2 10c1:2 12c2:2 14c1:2',
        '0c0:2 2c1:2 3c2:2 6c3:2 8c2:2 10c1:2 11c2:2 14c1:2',
      ],
      disco: [
        '2c1:3 6c2:3 10c1:3 14c2:2',
        '0c1:2 2c2:2 4c1:2 6c2:2 8c1:2 10c2:2 12c1:2 14c2:2',
        '0c1:1 1c2:1 2c3:1 3c2:1 4c1:1 5c2:1 6c3:1 7c2:1 8c1:1 9c2:1 10c3:1 11c2:1 12c1:1 13c2:1 14c3:1 15c2:1',
      ],
      soft: ['0c0:8 8c2:8', '0c0:4 4c1:4 8c2:4 12c1:4', '0c0:2 2c1:2 4c2:2 6c3:2 8c2:2 10c1:2 12c2:2 14c1:2'],
    },
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
    patterns: {
      pop: [
        '0c2:6 8c1:6 | 0c1:6 8c2:6 | 0c0:6 8c2:6 | 0c1:6 8c0:6',
        '0s2:2 2s3:2 4s4:2 6s3:2 8s2:3 12s1:2 14s0:2 | 0s1:2 2s2:2 4s3:2 6s2:2 8s1:3 12s0:3 | 0s3:2 2s4:2 4s5:2 6s4:2 8s3:3 12s2:2 14s1:2 | 0s2:2 2s1:2 4s0:2 6s1:2 8s2:3 14s0:2',
        '0s2:1 1s3:1 2s4:2 4s3:1 5s2:1 6s1:2 8s2:1 9s3:1 10s4:1 11s5:1 12s4:2 14s3:2 | 0s3:1 1s4:1 2s5:2 4s4:1 5s3:1 6s2:2 8s1:1 9s2:1 10s3:2 12s2:2 14s0:2 | 0s4:1 1s5:1 2s6:2 4s5:1 5s4:1 6s3:2 8s4:1 9s3:1 10s2:2 12s1:2 14s2:2 | 0s2:2 2s3:1 3s2:1 4s1:2 6s0:2 8s2:1 9s1:1 10s0:2 12c0:3',
      ],
    },
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
    patterns: {
      pop: [
        '4S 12S',
        '0H 2H 4S 6H 8H 10H 12S 14H',
        '0H 2H 4S 6H 7H 8H 10H 12S 14H | 0H 2H 4S 6H 7H 8H 10H 12S 14H | 0H 2H 4S 6H 7H 8H 10H 12S 14H | 0H 2H 4S 6H 8H 10H 12S 13S 14S 15S',
      ],
      disco: ['4S 12S', '2H 4S 6H 10H 12S 14H', '2H 4S 6H 7H 10H 12S 14H 15H'],
      soft: ['4W 12W', '0H 4W 8H 12W', '0H 2H 4W 6H 8H 10H 12W 14H'],
    },
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
    patterns: {
      pop: ['6c2:4^ 12c1:4^', '2s4:2^ 6s3:2^ 10s4:2^ 14s2:2^', '0s3:1^ 2s4:1^ 3s5:1^ 6s4:1^ 8s3:1^ 10s5:1^ 11s4:1^ 14s3:1^'],
    },
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
    patterns: {
      pop: [
        '4X 12X',
        '0X 2X 4X 6X 8X 10X 12X 14X',
        '0X 2X 3W 4X 6X 8X 10X 11W 12X 14X',
      ],
      disco: [
        '2X 6X 10X 14X',
        '2X 6X 10X 14X',
        '0X 1X 2X 3X 4X 5X 6X 7X 8X 9X 10X 11X 12X 13X 14X 15X',
      ],
      soft: ['0X 8X', '0X 4X 8X 12X', '0X 2X 4X 6X 8X 10X 12X 14X'],
    },
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
    patterns: {
      pop: [
        '0c2:14 | 0c2:14 | 0c1:14 | 0c0:14',
        '0c2:6 8s4:3 12s3:3 | 0c2:6 8s3:3 12s2:3 | 0c1:6 8s4:3 12s3:3 | 0c0:6 8s2:3 12s1:3',
        '0c2:3 4s4:2 6s5:2 8c2:3 12s4:2 14s3:2 | 0s3:3 4s4:2 6s3:2 8c1:3 12s2:2 14s3:2 | 0c1:3 4s3:2 6s4:2 8c2:3 12s5:2 14s4:2 | 0c0:3 4s2:2 6s1:2 8c0:4 12s0:2 14s1:2',
      ],
    },
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
    patterns: {
      pop: ['0B 8B', '0B 6B 8B 14B', '0B 3B 4P 6B 8B 11B 12P 14B'],
      disco: ['0B 8B', '0B 3B 8B 11B', '0B 3B 4P 8B 11B 12P'],
      soft: ['0B', '0B 8B', '0B 6B 8B'],
    },
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
    patterns: {
      pop: [
        ' | | | 12M 14M',
        ' | 12M | | 8M 10M 12M 14M',
        '12M | 6M 12M 14M | 12M | 8M 10M 12M 13M 14M 15M',
      ],
    },
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
    patterns: {
      pop: [
        '0c0:7 8c2:7',
        '0c0:2 2c0:2 4c2:4 8c0:2 10c0:2 12c2:4',
        '0c0:1 2c1:1 4c2:2 6c3:2 8c2:2 10c1:2 12c0:4',
      ],
      disco: ['2c2:3 10c2:3', '2c2:2 6c2:2 10c1:2 14c2:2', '2c2:1 3c2:1 6c2:2 10c1:1 11c2:1 14c3:2'],
      soft: ['0c0:15', '0c0:7 8c2:7', '0c0:4 4c1:4 8c2:4 12c1:4'],
    },
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
    patterns: {
      pop: [
        '0c1:7 8c2:7',
        '0c2:3 4s4:2 6c2:2 8c1:3 12s3:2 14c1:2',
        '0c2:2 2s3:2 4s4:2 6c2:2 8c1:4 12s3:2 14c2:2',
      ],
    },
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
    patterns: {
      pop: [
        '0c2:15 | 0c2:15 | 0c2:15 | 0c1:15',
        '0c2:4 4c1:4 8c0:4 12c1:4',
        '0c2:2 2s4:2 4s5:2 6s4:2 8c2:2 10s3:2 12s2:2 14s3:2',
      ],
    },
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
    patterns: {
      pop: ['0A 8A', '0A 4A 8A 12A', '0A 2A 4A 6A 8A 10A 12A 14R'],
      soft: ['0A', '0A 8A', '0A 4A 8A 12A'],
    },
  },
];

/** The five robots on the shelf the first time. */
export const STARTERS: readonly string[] = ['kick', 'bass', 'piano', 'guitar', 'xylo'];

const BY_ID = new Map(ROBOTS.map((r) => [r.id, r]));

export function findRobot(id: string): RobotDef | undefined {
  return BY_ID.get(id);
}

const STYLES: readonly DrumStyle[] = ['pop', 'disco', 'soft'];

/** Patterns parsed once: robot id → style → level. */
const PARSED = new Map<string, Record<DrumStyle, Bars[]>>();
for (const r of ROBOTS) {
  const byStyle = {} as Record<DrumStyle, Bars[]>;
  for (const s of STYLES) {
    const trio = r.patterns[s] ?? r.patterns.pop;
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
  return { timbre: robot.timbre, bars: (style, level) => barsOf(robot.id, style, level) };
}

export const COUNT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám'] as const;
