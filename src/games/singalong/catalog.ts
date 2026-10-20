import type { FxKind, Timbre } from '../../core/audio';
import { hasLyrics, SONGS, type Song } from '../../core/music';

/**
 * Everything the child can unlock, and when. Unlocks follow the lifetime number of
 * tickets (a ticket is never spent), so nothing is ever lost and nobody has to
 * choose between two gifts.
 */

// ---- songs ----
/** Songs with words come first: they are the ones a child can sing. The rest are for the band. */
export const REPERTOIRE: readonly Song[] = [...SONGS.filter(hasLyrics), ...SONGS.filter((s) => !hasLyrics(s))];

/** Songs open from the very first show. */
export const FREE_SONGS = 3;
/** Tickets between one new song and the next. */
export const SONG_EVERY = 3;

export function songUnlockAt(index: number): number {
  return index < FREE_SONGS ? 0 : (index - FREE_SONGS + 1) * SONG_EVERY;
}

/** Is this song open to a child with `tickets`? Unknown songs are not. */
export function songOpen(songId: string, tickets: number): boolean {
  const i = REPERTOIRE.findIndex((s) => s.id === songId);
  return i >= 0 && songUnlockAt(i) <= tickets;
}

// ---- singers' hats ----
export interface Hat {
  id: string;
  emoji: string;
  name: string;
  at: number;
}
export const HATS: readonly Hat[] = [
  { id: 'none', emoji: '🙂', name: 'không đội mũ', at: 0 },
  { id: 'bow', emoji: '🎀', name: 'nơ hồng', at: 1 },
  { id: 'cap', emoji: '🧢', name: 'mũ lưỡi trai', at: 3 },
  { id: 'top', emoji: '🎩', name: 'mũ ảo thuật', at: 5 },
  { id: 'crown', emoji: '👑', name: 'vương miện', at: 8 },
  { id: 'shades', emoji: '🕶️', name: 'kính ngầu', at: 11 },
  { id: 'phones', emoji: '🎧', name: 'tai nghe', at: 14 },
  { id: 'star', emoji: '🌟', name: 'ngôi sao', at: 18 },
];

// ---- stages ----
export interface StageTheme {
  id: string;
  emoji: string;
  name: string;
  at: number;
  /** Little things painted along the back of the stage. */
  deco: readonly string[];
}
export const STAGES: readonly StageTheme[] = [
  { id: 'theatre', emoji: '🎭', name: 'sân khấu nhà hát', at: 0, deco: ['🎈', '⭐', '🎈'] },
  { id: 'night', emoji: '🌃', name: 'đêm sao', at: 4, deco: ['🌙', '⭐', '✨'] },
  { id: 'beach', emoji: '🏖️', name: 'bãi biển', at: 8, deco: ['🌴', '☀️', '🐚'] },
  { id: 'rainbow', emoji: '🌈', name: 'cầu vồng', at: 13, deco: ['☁️', '🌈', '☁️'] },
  { id: 'space', emoji: '🚀', name: 'vũ trụ', at: 19, deco: ['🪐', '🚀', '🌍'] },
  { id: 'candy', emoji: '🍭', name: 'xứ kẹo ngọt', at: 26, deco: ['🍭', '🧁', '🍬'] },
];

// ---- audience ----
/** Low voices make the big animals dance, high voices the small ones, so hearing the difference is a game. */
export type Band = 0 | 1 | 2;
export interface Fan {
  emoji: string;
  name: string;
  band: Band;
  fx: FxKind;
}
export const FANS: readonly Fan[] = [
  { emoji: '🐻', name: 'gấu', band: 0, fx: 'growl' },
  { emoji: '🐰', name: 'thỏ', band: 2, fx: 'squeak' },
  { emoji: '🐥', name: 'gà con', band: 2, fx: 'chirp' },
  { emoji: '🦊', name: 'cáo', band: 1, fx: 'bark' },
  { emoji: '🐘', name: 'voi', band: 0, fx: 'elephant' },
];
export const MAX_FANS = FANS.length;
/** Photos of the family sit in the front row, on top of the animals. */
export const MAX_FAMILY = 3;
export const FAN_EVERY = 4;
export const START_FANS = 3;

export function fanCount(tickets: number): number {
  return Math.min(MAX_FANS, START_FANS + Math.floor(Math.max(0, tickets) / FAN_EVERY));
}

// ---- singers (faces) ----
export interface Character {
  id: string;
  emoji: string;
  name: string;
}
export const CHARACTERS: readonly Character[] = [
  { id: 'kid', emoji: '🧒', name: 'bé' },
  { id: 'girl', emoji: '👧', name: 'bé gái' },
  { id: 'cat', emoji: '🐱', name: 'mèo' },
  { id: 'dog', emoji: '🐶', name: 'cún' },
  { id: 'bunny', emoji: '🐰', name: 'thỏ' },
];

// ---- the choir of the echo game ----
export interface ChoirPart {
  emoji: string;
  name: string;
  /** Playback speed of the child's recording. Only octaves and fifths: they always sound well together. */
  rate: number;
  fx: FxKind;
  /** The pitch and instrument this animal taps out when the child only gave it a rhythm. C and G sit well together. */
  note: string;
  timbre: Timbre;
  at: number;
}
export const CHOIR: readonly ChoirPart[] = [
  { emoji: '🦜', name: 'vẹt', rate: 1.5, fx: 'parrot', note: 'C5', timbre: 'flute', at: 0 },
  { emoji: '🐘', name: 'voi', rate: 0.667, fx: 'elephant', note: 'C3', timbre: 'bass', at: 0 },
  { emoji: '🐭', name: 'chuột', rate: 2, fx: 'squeak', note: 'G5', timbre: 'bell', at: 3 },
  { emoji: '🦖', name: 'khủng long', rate: 0.5, fx: 'roar', note: 'G3', timbre: 'violin', at: 7 },
];

export function choirSize(tickets: number): number {
  return CHOIR.filter((c) => c.at <= tickets).length;
}

/** One thing that just opened, for the "new!" card. */
export interface Gift {
  kind: 'song' | 'hat' | 'stage' | 'fan' | 'choir';
  emoji: string;
  name: string;
}

/** Everything that opens as the ticket count goes from `before` to `after`. */
export function giftsBetween(before: number, after: number): Gift[] {
  const out: Gift[] = [];
  const crossed = (at: number): boolean => at > before && at <= after;
  REPERTOIRE.forEach((s, i) => {
    if (crossed(songUnlockAt(i))) out.push({ kind: 'song', emoji: s.icon, name: s.title });
  });
  for (const hat of HATS) if (crossed(hat.at)) out.push({ kind: 'hat', emoji: hat.emoji, name: hat.name });
  for (const st of STAGES) if (crossed(st.at)) out.push({ kind: 'stage', emoji: st.emoji, name: st.name });
  for (let i = fanCount(before); i < fanCount(after); i++) {
    const fan = FANS[i];
    if (fan) out.push({ kind: 'fan', emoji: fan.emoji, name: `${fan.name} đến xem` });
  }
  for (const part of CHOIR) if (crossed(part.at)) out.push({ kind: 'choir', emoji: part.emoji, name: `${part.name} vào hợp xướng` });
  return out;
}

/** The next thing to look forward to, for the little progress chip. Null once everything is open. */
export function nextGift(tickets: number): { at: number; emoji: string } | null {
  const options: Array<{ at: number; emoji: string }> = [];
  REPERTOIRE.forEach((s, i) => options.push({ at: songUnlockAt(i), emoji: s.icon }));
  for (const hat of HATS) options.push({ at: hat.at, emoji: hat.emoji });
  for (const st of STAGES) options.push({ at: st.at, emoji: st.emoji });
  for (const part of CHOIR) options.push({ at: part.at, emoji: part.emoji });
  const fan = FANS[fanCount(tickets)];
  if (fan) options.push({ at: (Math.floor(tickets / FAN_EVERY) + 1) * FAN_EVERY, emoji: fan.emoji });
  const later = options.filter((o) => o.at > tickets).sort((a, b) => a.at - b.at);
  return later[0] ?? null;
}
