import type { Timbre } from '../../core/audio';
import { talkPart, wordPart } from '../../core/say';
import type { SpeechPart } from '../../core/speech';
import { familyOf, layoutFor } from './instruments/layout';
import { pentaFrom } from './instruments/scale';
import type { InstrumentKind, Voice } from './instruments/types';
import { drum, inst, instHz, note } from './instruments/voices';

export type GroupId = 'strike' | 'pluck' | 'keys' | 'shake';

export interface Group {
  id: GroupId;
  emoji: string;
  /** Vietnamese name for a parent. */
  name: string;
  /** Spoken slowly, word by word (commas make the pauses). */
  say: string;
  /** Cabinet colour. */
  color: string;
}

export const GROUPS: readonly Group[] = [
  { id: 'strike', emoji: '🥁', name: 'Nhạc cụ gõ', say: 'nhạc cụ, gõ', color: '#fde68a' },
  { id: 'pluck', emoji: '🎸', name: 'Nhạc cụ gảy', say: 'nhạc cụ, gảy', color: '#fecdd3' },
  { id: 'keys', emoji: '🎹', name: 'Phím và thổi', say: 'bấm, phím, và, thổi', color: '#bae6fd' },
  { id: 'shake', emoji: '🔔', name: 'Lắc và rung', say: 'lắc, và, rung', color: '#bbf7d0' },
];

export interface Entry {
  /** Stable id, saved in the album. */
  id: string;
  /** Which simulation plays it. */
  kind: InstrumentKind;
  group: GroupId;
  /** Vietnamese name for a parent / screen reader. */
  name: string;
  /** What is said when the child opens it: "đàn, ma, rim, ba" — each word on its own breath. */
  say: string;
}

const e = (id: string, kind: InstrumentKind, group: GroupId, name: string, say: string): Entry => ({ id, kind, group, name, say });

/**
 * Everything in the museum. The first group of each cabinet leads with the
 * instruments a child is likeliest to know; the rest are new friends. Together
 * they cover every sound the synth can make as an instrument: all nine timbres,
 * the drum kit and hand percussion, and the world instruments.
 */
export const ENTRIES: readonly Entry[] = [
  e('drumkit', 'snare', 'strike', 'Bộ trống', 'bộ, trống'),
  e('djembe', 'djembe', 'strike', 'Trống djembe', 'trống, jem, bê'),
  e('marimba', 'marimba', 'strike', 'Đàn marimba', 'đàn, ma, rim, ba'),
  e('vibraphone', 'vibraphone', 'strike', 'Đàn vibraphone', 'đàn, vi, ba, phôn'),
  e('xylo', 'xylo', 'strike', 'Đàn xylophone', 'đàn, xi, lô, phôn'),
  e('bell', 'bell', 'strike', 'Đàn glockenspiel', 'đàn, chuông, nhỏ'),
  e('steelpan', 'steelpan', 'strike', 'Trống thép', 'trống, thép'),
  e('handpan', 'handpan', 'strike', 'Trống handpan', 'trống, hen, pan'),
  e('gong', 'gong', 'shake', 'Cồng chiêng', 'cồng, chiêng'),

  e('guitar', 'guitar', 'pluck', 'Đàn guitar', 'đàn, ghi, ta'),
  e('ukulele', 'ukulele', 'pluck', 'Đàn ukulele', 'đàn, u, ku, lê, lê'),
  e('banjo', 'banjo', 'pluck', 'Đàn banjo', 'đàn, ban, giô'),
  e('bass', 'bass', 'pluck', 'Đàn bass', 'đàn, bát'),
  e('harp', 'harp', 'pluck', 'Đàn hạc', 'đàn, hạc'),
  e('kalimba', 'kalimba', 'pluck', 'Đàn kalimba', 'đàn, ka, lim, ba'),
  e('violin', 'violin', 'pluck', 'Đàn violin', 'đàn, vi, ô, lông'),

  e('piano', 'piano', 'keys', 'Đàn piano', 'đàn, pi, a, nô'),
  e('organ', 'organ', 'keys', 'Đàn organ', 'đàn, oóc, gan'),
  e('accordion', 'accordion', 'keys', 'Đàn accordion', 'đàn, a, cọc, đê, ông'),
  e('flute', 'flute', 'keys', 'Sáo', 'sáo'),
  e('panflute', 'panflute', 'keys', 'Sáo pan', 'sáo, pan'),
  e('trumpet', 'trumpet', 'keys', 'Kèn trumpet', 'kèn, trum, pét'),
  e('sax', 'sax', 'keys', 'Kèn saxophone', 'kèn, sa, xô, phôn'),
  e('harmonica', 'harmonica', 'keys', 'Kèn harmonica', 'kèn, ha, mô, ni, ca'),

  e('maracas', 'maracas', 'shake', 'Maracas', 'lắc, ma, ra, cát'),
  e('tambourine', 'tambourine', 'shake', 'Trống lắc tay', 'trống, lắc, tay'),
  e('castanets', 'castanets', 'shake', 'Phách castanet', 'phách, cát, sta, nét'),
  e('chimes', 'chimes', 'shake', 'Chuông gió', 'chuông, gió'),
  e('rack', 'cowbell', 'shake', 'Gõ nhịp', 'gõ, nhịp'),
];

const BY_ID = new Map(ENTRIES.map((x) => [x.id, x]));
export const findEntry = (id: string): Entry | undefined => BY_ID.get(id);
export const entriesOf = (g: GroupId): Entry[] => ENTRIES.filter((x) => x.group === g);
export const groupOf = (g: GroupId): Group => GROUPS.find((x) => x.id === g)!;

/**
 * "Đây là" … (pause) … "đàn, ma, rim, ba": the name is a slow part of its own (its syllables are
 * set apart by commas); with a group, a clear gap and then "Nhóm" and the group's name.
 */
export function nameParts(en: Entry, g?: Group): SpeechPart[] {
  return [talkPart('Đây là', 350), wordPart(en.say, g ? 900 : 0), ...(g ? [talkPart('Nhóm', 350), wordPart(g.say, 0)] : [])];
}

const BASE: Partial<Record<InstrumentKind, number>> = {
  piano: 60,
  xylo: 72,
  bell: 72,
  guitar: 55,
  flute: 72,
  trumpet: 60,
  violin: 67,
  sax: 60,
  bass: 48,
  marimba: 60,
  vibraphone: 67,
  steelpan: 60,
  handpan: 60,
  harp: 60,
  ukulele: 60,
  banjo: 60,
  kalimba: 72,
  organ: 60,
  accordion: 60,
  harmonica: 72,
  panflute: 72,
  chimes: 84,
};
const TIMBRE_KINDS: ReadonlySet<string> = new Set<Timbre>(['piano', 'xylo', 'bell', 'guitar', 'flute', 'trumpet', 'violin', 'sax', 'bass']);

/**
 * Five voices for the orchestra room, low to high. Every pitched one is a note of
 * C major pentatonic, so any touch in any order sounds right with the others and
 * with the backing; percussion gets five different hits instead.
 */
export function bandVoices(kind: InstrumentKind): Voice[] {
  const fam = familyOf(kind);
  if (fam === 'kit') return (['kick', 'snare', 'hat', 'tom', 'crash'] as const).map(drum);
  if (fam === 'rack') return (['cowbell', 'wood', 'triangle', 'shaker', 'clap'] as const).map(drum);
  if (kind === 'djembe') return [105, 300, 700, 300, 520].map((hz) => instHz('djembe', hz));
  if (kind === 'gong') return [147, 110, 147, 110, 165].map((hz) => instHz('gong', hz));
  if (kind === 'maracas') return [400, 520, 440, 520, 400].map((hz) => instHz('maracas', hz));
  if (kind === 'tambourine') return [300, 620, 620, 300, 620].map((hz) => instHz('tambourine', hz));
  if (kind === 'castanets') return [1700, 2100, 1700, 2100, 1900].map((hz) => instHz('castanets', hz));
  const notes = pentaFrom(BASE[kind] ?? 60, 5);
  if (TIMBRE_KINDS.has(kind)) return notes.map((m) => note(kind as Timbre, m, kind === 'guitar' ? 1.2 : 0.8));
  return notes.map((m) => inst(kind as never, m, 0.7));
}

const thumbs = new Map<string, string>();

/** A small picture of the instrument, taken from its own drawing. Safe to put many on one page. */
export function thumbSvg(kind: InstrumentKind): string {
  let s = thumbs.get(kind);
  if (s) return s;
  const p = `t-${kind}-`;
  s = layoutFor(kind, 300, 240, 'free')
    .svg.replace(/id="([^"]+)"/g, (_m, id: string) => `id="${p}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${p}${id})`)
    .replace(/ data-z="[^"]*"/g, '')
    .replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"')
    .replace(/ width="[^"]*" height="[^"]*"/, '');
  thumbs.set(kind, s);
  return s;
}
