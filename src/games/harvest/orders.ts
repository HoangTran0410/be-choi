/**
 * The little market: what can be sold, who comes shopping and what they ask for.
 * An order is shown in pictures (the item, as many times as wanted), never in words.
 */
import { CROPS, cropsAt } from './crops';
import { speciesAt } from './animals';
import { numberWord } from '../count/logic';
import { talkPart, wordPart } from '../../core/say';
import type { SpeechPart } from '../../core/speech';

export interface Item {
  id: string;
  emoji: string;
  name: string;
  kind: 'crop' | 'product';
}

export const PRODUCTS: readonly Item[] = [
  { id: 'egg', emoji: '🥚', name: 'trứng', kind: 'product' },
  { id: 'milk', emoji: '🥛', name: 'sữa', kind: 'product' },
  { id: 'wool', emoji: '🧶', name: 'len', kind: 'product' },
  { id: 'cheese', emoji: '🧀', name: 'phô mai', kind: 'product' },
];

/** Everything that can sit in the basket, crops first. */
export const ITEMS: readonly Item[] = [...CROPS.map((c): Item => ({ id: c.id, emoji: c.emoji, name: c.name, kind: 'crop' })), ...PRODUCTS];

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** What the farm can make by `level`: its crops, and what its animals give. */
export function itemsAt(level: number): Item[] {
  const ids = new Set<string>(cropsAt(level).map((c) => c.id));
  for (const s of speciesAt(level)) if (s.product) ids.add(s.product);
  return ITEMS.filter((i) => ids.has(i.id));
}

export interface Shopper {
  emoji: string;
  name: string;
}

export const SHOPPERS: readonly Shopper[] = [
  { emoji: '🐻', name: 'Gấu' },
  { emoji: '🐰', name: 'Thỏ' },
  { emoji: '🦊', name: 'Cáo' },
  { emoji: '🐼', name: 'Gấu trúc' },
  { emoji: '🐯', name: 'Hổ' },
  { emoji: '🐸', name: 'Ếch' },
  { emoji: '🐵', name: 'Khỉ' },
  { emoji: '🦁', name: 'Sư tử' },
  { emoji: '🐱', name: 'Mèo' },
  { emoji: '🐶', name: 'Chó' },
];

export interface Want {
  item: string;
  n: number;
  got: number;
}

export interface Order {
  /** Index into SHOPPERS for an animal customer. */
  shopper: number;
  /** A person from the family photos instead of an animal (which photo is picked when it is drawn). */
  photo: boolean;
  wants: Want[];
}

/** How many different things and how many of each, as the farm grows. */
export function orderSize(level: number): { kinds: number; most: number } {
  if (level >= 5) return { kinds: 3, most: 4 };
  if (level >= 3) return { kinds: 2, most: 3 };
  return { kinds: 1, most: 2 };
}

export function makeOrder(level: number, opts: { photo?: boolean; prev?: Order | null; rng?: () => number } = {}): Order {
  const rng = opts.rng ?? Math.random;
  const pool = itemsAt(level);
  const { kinds, most } = orderSize(level);
  const count = Math.min(kinds, pool.length);
  // Avoid asking for exactly what the last customer did.
  const avoid = new Set(opts.prev?.wants.map((w) => w.item) ?? []);
  const fresh = pool.filter((i) => !avoid.has(i.id));
  const source = fresh.length >= count ? fresh : pool;
  const bag = [...source];
  const wants: Want[] = [];
  for (let i = 0; i < count; i++) {
    const item = bag.splice(Math.floor(rng() * bag.length), 1)[0]!;
    wants.push({ item: item.id, n: 1 + Math.floor(rng() * most), got: 0 });
  }
  let shopper = Math.floor(rng() * SHOPPERS.length);
  if (opts.prev && !opts.prev.photo && shopper === opts.prev.shopper) shopper = (shopper + 1) % SHOPPERS.length;
  return { shopper, photo: !!opts.photo, wants };
}

/** How many more of `item` this order still wants. */
export function remaining(order: Order, item: string): number {
  const w = order.wants.find((x) => x.item === item);
  return w ? Math.max(0, w.n - w.got) : 0;
}

/** Hand over one `item`. False (and nothing changes) if the customer does not need it. */
export function give(order: Order, item: string): boolean {
  const w = order.wants.find((x) => x.item === item && x.got < x.n);
  if (!w) return false;
  w.got++;
  return true;
}

export const isDone = (order: Order): boolean => order.wants.every((w) => w.got >= w.n);

/** The things still to be handed over, one entry per piece. */
export function missingPieces(order: Order): string[] {
  return order.wants.flatMap((w) => Array.from({ length: Math.max(0, w.n - w.got) }, () => w.item));
}

/**
 * What is said aloud. Short phrases joined by commas, so a slow voice has a
 * breath between the number and the thing: "Gấu muốn, hai, cà rốt, và, một, trứng."
 */
export function orderPhrase(order: Order, who: string): string {
  const parts = order.wants.filter((w) => w.got < w.n).map((w) => `${numberWord(w.n - w.got)}, ${itemById(w.item)?.name ?? ''}`);
  if (!parts.length) return `${who} cảm ơn bé!`;
  return `${who} muốn, ${parts.join(', và, ')}.`;
}

/**
 * The same sentence as slow parts: "Gấu muốn" … "hai" … "cà rốt" … "và" … "một" … "trứng". Each
 * number and name is its own part, so none runs into the next.
 */
export function orderParts(order: Order, who: string): SpeechPart[] {
  const open = order.wants.filter((w) => w.got < w.n);
  if (!open.length) return [talkPart(`${who} cảm ơn bé!`, 0)];
  const parts: SpeechPart[] = [talkPart(`${who} muốn`, 600)];
  open.forEach((w, i) => {
    if (i > 0) parts.push(talkPart('và', 400));
    parts.push(wordPart(numberWord(w.n - w.got), 600), wordPart(itemById(w.item)?.name ?? '', i === open.length - 1 ? 0 : 700));
  });
  return parts;
}

/** Greeting for a family member: the app does not know their name, so it stays warm and general. */
export const PHOTO_WHO = 'Người thân';
