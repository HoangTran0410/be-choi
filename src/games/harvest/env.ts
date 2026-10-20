/** What every part of the farm (garden, barn, market, HUD) shares. */
import type { SpeechPart } from '../../core/speech';
import type { GameContext } from '../../core/types';
import type { Photo } from '../../core/photos';
import type { FarmState } from './progress';
import type { Weather } from './world';

export type Tab = 'garden' | 'barn' | 'market';
export const TABS: readonly Tab[] = ['garden', 'barn', 'market'];

export interface Pt {
  x: number;
  y: number;
}

/** One screen of the farm. */
export interface View {
  el: HTMLElement;
  /** Draw the current state (only called while this tab is showing, and once when it opens). */
  sync(): void;
  /** How many things here are waiting for the child; shown as a dot on the tab. */
  badge(): number;
  /** The element worth pointing at when the child is idle, if any. */
  hint(): HTMLElement | null;
  /** The child just opened this tab. */
  enter?(): void;
  /** A basket item was tapped. */
  chipTap(id: string): void;
  /** A basket item was dropped at `p`. Returns true if it was used. */
  chipDrop(id: string, p: Pt): boolean;
}

export interface Env {
  ctx: GameContext;
  state: FarmState;
  weather: Weather;
  /** Everything floating (flying fruit, drag ghosts, the "new!" card) is added here. */
  layer: HTMLElement;
  photos: Photo[];
  /** The basket item last tapped, used as the next thing to give. */
  selected: string | null;
  tab: Tab;
  views: Partial<Record<Tab, View>>;
  /** Draw less: the device is struggling. */
  low(): boolean;
  /** Say something. Pass `force = false` for chatter that may be skipped if something was just said. */
  say(text: string, force?: boolean): void;
  /** Say prepared slow parts (a number, then the name, …) as one sequence. */
  sayParts(parts: SpeechPart[]): void;
  /** Ask for a save soon. */
  dirty(): void;
  /** Add farm xp; handles the "new!" card when a level is reached. */
  gainXp(amount: number): void;
  later(fn: () => void, ms: number): void;
  /** Fly a picture from one place to another. A string stands for the basket chip of that item. */
  fly(emoji: string, from: Element | Pt | string, to: Element | Pt | string): void;
  /** The basket changed. */
  stockChanged(): void;
  /** Move to another tab. */
  go(tab: Tab): void;
  /** Little burst of sparkles at a point. */
  sparkle(at: Element | Pt, glyph?: string): void;
}

export function centerOf(at: Element | Pt): Pt {
  if ('getBoundingClientRect' in at) {
    const r = at.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return at;
}

/** The first of `els` whose box (grown by `tol`) holds `p`. */
export function elementAt<T extends Element>(p: Pt, els: Iterable<T>, tol = 6): T | null {
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (p.x >= r.left - tol && p.x <= r.right + tol && p.y >= r.top - tol && p.y <= r.bottom + tol) return el;
  }
  return null;
}
